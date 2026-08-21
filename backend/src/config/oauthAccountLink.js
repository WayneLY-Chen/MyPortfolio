// backend/src/config/oauthAccountLink.js
//
// handleOAuth：四家 OAuth provider（Google/GitHub/LINE/Facebook）共用的帳號
// 綁定/建立邏輯，從 backend/src/config/passport.js 整段搬出。
//
// 為什麼要搬：backend/src/test/setup.js 的 Module._load 橋接把整個
// backend/src/config/passport.js 換成測試替身（見 __mocks__/passport.js），
// 邏輯留在那裡就永遠測不到。搬到一個沒有被橋接的新檔案，測試就能直接呼叫
// 真的函式——與 02-04 把 LocalStrategy 的驗證邏輯搬到 ./localVerify.js
// 是同一種做法，理由也相同。搬移本身不改變既有行為；下方兩處改動才是。
//
// ─────────────────────────────────────────────────────────────────────────
// SEC-07/D-16 的範圍澄清（避免日後誤讀）：
//
// 02-CONTEXT.md 原案 D-16 設想的是「option-a」：撞到既有帳號且 email 未
// 驗證時，寄一封確認信、由使用者點擊連結才真正綁定 provider——需要一張新
// 資料表（oauth_link_requests）、一個新端點、一封新信件模板。
//
// 這個做法已被 02-06 的決策閘正式取代（supersede），而非被遺漏。專案擁有者
// 在看過 .planning/phases/02-reliability-hardening/02-PROVIDER-EMAIL-
// VERIFICATION.md 的事實表後，明確選擇「option-b」：撞到既有帳號且 email
// 未驗證時，直接拒絕這次登入——不寄信、不建新表、不建新端點。完整理由見
// 該文件「決策閘結果」一節與 02-06-SUMMARY.md；核心論點是：會撞到這個閘門
// 的使用者依定義已經有帳號，而 02-04(SEC-06/D-15) 已經讓登入失敗訊息可行動
// 地指向「忘記密碼」，且 /auth/forgot-password 本來就不要求帳號原本有
// password_hash——被擋下的使用者可以完全自助（設密碼→用 Email 登入），
// 不需要 D-16 那套一次性、one-way 的新基礎設施。
//
// 本檔案（連同它的檔名）沿用計畫原本的命名，是因為它仍然是「OAuth 帳號
// 綁定」邏輯的所在地——只是「綁定」現在只發生在自動合併安全的時候，
// 其餘情況一律拒絕，而不是走一個新的確認流程。
// ─────────────────────────────────────────────────────────────────────────
const { query } = require('../db');
const { normalizeEmail, isSameEmail } = require('./registrationValidation');

/**
 * @param {string} provider - 'google' | 'github' | 'line' | 'facebook'
 * @param {string} profileId - provider 端的使用者 id
 * @param {string|undefined} email - 這次登入取得的 email（可能是合成 email）
 * @param {string} displayName
 * @param {string|null} avatarUrl
 * @param {boolean} emailVerified - 由 oauthEmailVerification.js 的
 *   isProviderEmailVerified(...) 算出，四家 provider 各自的呼叫端
 *   （backend/src/config/passport.js）都必須傳入，缺一家都會讓那一家
 *   悄悄退回「無條件合併」的舊行為。
 * @param {function} done - passport 的 (err, user, info) 回呼
 */
const handleOAuth = async (provider, profileId, email, displayName, avatarUrl, emailVerified, done) => {
  try {
    const existing = await query(
      'SELECT u.* FROM users u JOIN oauth_accounts oa ON u.id = oa.user_id WHERE oa.provider = $1 AND oa.provider_id = $2',
      [provider, profileId]
    );
    // 回訪登入：這個 provider 帳號已經綁定過，直接放行——這條路徑必須
    // 在任何 email 比對之前就返回，完全不受 emailVerified 影響。這是
    // SEC-07 修復刻意保留、不得迴歸的既有行為（見本計畫 SUMMARY 的
    // T-02-29：四家中漏改一家，或這裡的順序被打亂，都會讓既有使用者
    // 被誤擋在門外）。同時，這也是「回傳 email 的功能性 bug 修好之後，
    // 既有 LINE/Facebook 使用者是否會被自己的新 email 卡住」這個問題的
    // 答案所在：既有使用者是靠這一行、靠 (provider, provider_id) 認出來
    // 的，完全不會走到下面的 email 比對，所以答案是「不會」。
    if (existing.rows.length > 0) return done(null, existing.rows[0]);

    let user;
    if (email) {
      const byEmail = await query('SELECT * FROM users WHERE LOWER(email) = LOWER($1) ORDER BY created_at ASC', [email]);
      if (byEmail.rows.length > 0) {
        if (emailVerified) {
          // 既有行為維持：provider 明確聲明這次的 email 已驗證，沿用
          // 既有帳號並在下面補寫 oauth_accounts。
          user = byEmail.rows[0];
        } else {
          // SEC-07/D-16（option-b，見檔案頂端說明）：provider 沒有明確
          // 聲明這次的 email 已驗證，但它撞到一個既有帳號——不自動合併
          // （這正是帳號預先劫持要防的事），也不建立新帳號（users.email
          // 是 UNIQUE，INSERT 會直接違反約束噴 500，"不合併" 必須有明確
          // 去處）。
          //
          // 刻意不改寫四條 callback 路由的 failureRedirect（見
          // backend/src/routes/auth.js）：訊息本身不區分「此 email
          // 是否存在」，被擋下的使用者會看到既有的通用
          // ?error=oauth_failed 頁面，該頁面已經同時顯示
          // 02-04(SEC-06/D-15) 加上的「前往忘記密碼」連結——可自助設定
          // 密碼、再以 Email 登入，不需要任何新的確認信/持久化 token
          // 基礎設施。
          return done(null, false, { message: 'oauth_email_unverified_collision' });
        }
      }
    }

    // 需在 .env 設定 ADMIN_EMAIL 以指定管理員帳號。
    // D-17：admin 判定必須同時滿足「email 與 ADMIN_EMAIL 相符」且「該
    // provider 明確聲明這次的 email 已驗證」——否則攻擊者能在把關較鬆的
    // provider 上用 ADMIN_EMAIL 註冊，在該帳號尚不存在時直接生出 role
    // 為 admin 的帳號。這與上面的合併閘門同根因、同一種修法。
    // 與 ADMIN_EMAIL 的比對改為不分大小寫。這不是放寬：要靠它取得 admin，
    // 仍然必須由 provider 明確聲明該 email 已驗證（emailVerified === true），
    // 也就是必須真的控制那個信箱。詳見 config/registrationValidation.js。
    const isAdmin = isSameEmail(email, process.env.ADMIN_EMAIL) && emailVerified === true;

    if (!user) {
      const result = await query(
        'INSERT INTO users (email, display_name, avatar_url, role, is_verified) VALUES ($1, $2, $3, $4, true) RETURNING *',
        [normalizeEmail(email), displayName, avatarUrl, isAdmin ? 'admin' : 'visitor']
      );
      user = result.rows[0];
      // is_verified 在此仍固定為 true，不得改動：02-04(SEC-06/D-15) 讓
      // OAuth 建立的帳號能經由「忘記密碼」設定密碼後以 Email 登入，而
      // LocalStrategy 會擋下 is_verified 為 false 的帳號。改成 false
      // 會製造一個新的 SEC-06 死路。
    }

    await query(
      'INSERT INTO oauth_accounts (user_id, provider, provider_id, provider_email) VALUES ($1, $2, $3, $4) ON CONFLICT (provider, provider_id) DO NOTHING',
      [user.id, provider, profileId, email]
    );

    return done(null, user);
  } catch (err) {
    return done(err);
  }
};

module.exports = { handleOAuth };
