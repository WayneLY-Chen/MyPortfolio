const express = require('express');
const router = express.Router();
const passport = require('../config/passport');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { query } = require('../db');
const { generateAccessToken, generateRefreshToken, setRefreshTokenCookie, verifyAccessToken, generateGuestSessionToken } = require('../utils/jwt');
const { authenticate, optionalAuthenticate } = require('../middlewares/authenticate');
const { loginLimiter, emailDispatchLimiter, registerLimiter, passwordResetLimiter } = require('../middlewares/rateLimiters');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/mailer');
const {
  DISPLAY_NAME_MAX_LEN,
  PASSWORD_MIN_LEN,
  PASSWORD_MAX_LEN,
  isValidEmail,
  isValidDisplayName,
  isValidPassword,
  normalizeEmail,
  isSameEmail,
} = require('../config/registrationValidation');
 
// bcrypt 的 cost factor。先前 POST /register 用 12、POST /reset-password 用 10，
// 也就是重設密碼會把該帳號的雜湊強度降一級。集中成一個常數，兩處共用。
const BCRYPT_COST = 12;

// 解析多個前端網址，取第一個作為跳轉目的地
const getPrimaryFrontendUrl = () => {
  const urls = (process.env.FRONTEND_URL || '').split(',').map(u => u.trim()).filter(Boolean);
  return urls[0] || 'http://localhost:5173';
};

// D-01/SEC-01: 完成 OAuth 登入的共用邏輯。四家 provider (Google/GitHub/LINE/
// Facebook) 的 callback 最後都只呼叫這一個函式，避免修三家漏一家。
// 這裡刻意不產生 access token —— access token 只透過 POST /auth/refresh
// 換發 (D-02)，callback redirect 不帶任何 query string，故不留下可被瀏覽器
// history / referrer / proxy log 記錄的憑證。
const completeOAuthLogin = async (req, res, provider) => {
  try {
    const user = req.user;
    const refreshToken = await generateRefreshToken(user.id);
    setRefreshTokenCookie(res, refreshToken);
    console.log(`[Auth] OAuth 登入成功 (${provider}):`, user.id);
    res.redirect(`${getPrimaryFrontendUrl()}/login/callback`);
  } catch (err) {
    console.error(`[Auth] OAuth 登入完成失敗 (${provider}):`, err.message);
    res.redirect(`${getPrimaryFrontendUrl()}/login?error=oauth_failed`);
  }
};

// 四家 provider 共用的 callback 守衛。
//
// passport.authenticate 的 failureRedirect 只接住「驗證失敗」(done(null, false))，
// 接不住 strategy 自己拋出的例外——例如 token 交換階段的 FacebookTokenError。
// 那類例外會往下走到 Express 的錯誤處理器，回傳一頁 500 JSON。
//
// 實務上最常觸發的是授權碼被重放：使用者按上一頁、重新整理 callback 網址、
// 瀏覽器預先載入連結、或安全軟體掃描該連結，都會讓同一組 code 被送第二次。
// provider 端的授權碼是一次性的，第二次必定失敗——但此時第一次其實已經
// 登入成功了，使用者卻看到一頁錯誤 JSON。
//
// 改為一律導回登入頁：真正的失敗會看到錯誤提示，重放的情況則因為 cookie
// 已經設好，前端 silentRefresh 會直接把人帶進已登入狀態。
const oauthCallbackGuard = (provider) => (req, res, next) => {
  passport.authenticate(provider, { session: false }, (err, user) => {
    if (err) {
      console.error(`[Auth] OAuth callback 失敗 (${provider}):`, err.message);
      // 重放判定：授權碼已被用掉而使用者身上又有 refresh cookie，代表
      // 前一次請求其實已經登入成功，這只是同一組 code 的第二次送達。
      // 把人導去前端 callback 頁，讓 silentRefresh 用既有 cookie 把
      // 登入狀態接起來——而不是讓一個「已經登入的人」看到登入失敗。
      // cookie 若其實無效，silentRefresh 會失敗，前端仍會退回登入頁，
      // 所以這條捷徑不會讓未登入者矇混過關。
      if (req.cookies?.refresh_token) {
        console.log(`[Auth] OAuth callback 重放 (${provider})，以既有 cookie 續用登入狀態`);
        return res.redirect(`${getPrimaryFrontendUrl()}/login/callback`);
      }
      return res.redirect(`${getPrimaryFrontendUrl()}/login?error=oauth_failed`);
    }
    if (!user) {
      // done(null, false) —— 例如 SEC-07 的未驗證 email 阻擋。
      return res.redirect(`${getPrimaryFrontendUrl()}/login?error=oauth_failed`);
    }
    req.user = user;
    next();
  })(req, res, next);
};

// POST /auth/register
router.post('/register', registerLimiter, async (req, res) => {
  const { email, password, display_name } = req.body;
  // 修補前的檢查是 `!email || !password || !display_name` 加上
  // `password.length < 8`。非字串型別一路放行（!123 為 false），email 沒有
  // 格式檢查，display_name 沒有長度上限 —— body 上限 100kb 內的任何長度都會
  // 寫進資料庫，而 display_name 會以留言者名稱的形式出現在公開頁面上。
  // 詳見 config/registrationValidation.js。
  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, error: 'Email 格式不正確' });
  }
  if (!isValidDisplayName(display_name)) {
    return res.status(400).json({ success: false, error: `顯示名稱需為 1–${DISPLAY_NAME_MAX_LEN} 個字元` });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ success: false, error: `密碼需為 ${PASSWORD_MIN_LEN}–${PASSWORD_MAX_LEN} 個字元` });
  }
  try {
    // LOWER() 比對：修補前 a@example.com 與 A@example.com 會通過這道檢查
    // 而變成兩個帳號。詳見 config/registrationValidation.js。
    const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'Email 已被使用' });
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    // D-17（第二現場，02-PROVIDER-EMAIL-VERIFICATION.md「追加發現」一節）：
    // 這裡過去會在註冊當下就比對 email === ADMIN_EMAIL 並直接寫入
    // role: 'admin'——即使 is_verified 同時被設為 false，資料庫裡仍然
    // 多出一筆「休眠中的未驗證 admin 帳號」，與 passport.js:26 的 OAuth
    // 提權問題同根同源：先信任、後驗證。
    //
    // 修法：註冊時一律建立 role: 'visitor'，admin 角色的授予延後到
    // GET /auth/verify 真正完成驗證的那一刻（見下方），讓「先驗證、後
    // 信任」在本地註冊路徑上也成立，而不是依賴 is_verified 這道次要
    // 關卡去降低一個本來就不該存在的休眠風險。

    // 生成驗證 token，有效期 24 小時
    const verificationToken = crypto.randomUUID();
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const result = await query(
      `INSERT INTO users
         (email, password_hash, display_name, role, is_verified, verification_token, verification_expires_at)
       VALUES ($1, $2, $3, 'visitor', false, $4, $5)
       RETURNING id, email, display_name, avatar_url, role, is_verified, created_at`,
      [normalizeEmail(email), passwordHash, display_name.trim(), verificationToken, verificationExpiresAt]
    );
    const user = result.rows[0];

    // 寄送驗證信
    const frontendUrl = getPrimaryFrontendUrl();
    const verifyUrl = `${frontendUrl}/verify?token=${verificationToken}`;
    try {
      await sendVerificationEmail(email, verifyUrl);
    } catch (mailErr) {
      console.error('[Auth] 驗證信寄送失敗:', mailErr.message);
      // 信件寄送失敗不中斷流程，但回傳警告
      return res.status(201).json({
        success: true,
        requiresVerification: true,
        mailError: true,
        message: '帳號已建立，但驗證信寄送失敗，請聯繫管理員',
        user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role }
      });
    }

    return res.status(201).json({
      success: true,
      requiresVerification: true,
      message: '帳號已建立，請至您的 Email 收取驗證信以啟用帳號',
      user: { id: user.id, email: user.email, display_name: user.display_name, role: user.role }
    });
  } catch (err) {
    console.error('[Auth] 註冊失敗:', err.message);
    return res.status(500).json({ success: false, error: '伺服器錯誤' });
  }
});

// GET /auth/verify?token=xxx
router.get('/verify', async (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ success: false, error: '缺少驗證 token' });
  }
  try {
    const result = await query(
      `SELECT id, email, display_name, role, is_verified, verification_expires_at
       FROM users
       WHERE verification_token = $1`,
      [token]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, error: '驗證連結無效或已被使用，請重新申請驗證信' });
    }
    const user = result.rows[0];
    if (new Date() > new Date(user.verification_expires_at)) {
      return res.status(400).json({ success: false, error: '驗證連結已過期，請重新申請驗證信' });
    }
    // D-17（第二現場）：admin 角色的授予延後到這一刻——email 必須先真正
    // 通過驗證（使用者能收到寄到該信箱的信、並點擊其中連結），才會被
    // 賦予 role: 'admin'。需在 .env 設定 ADMIN_EMAIL 以指定管理員帳號。
    // 用同一句 UPDATE 的 CASE 表達式完成，避免多一次查詢或競態；未命中
    // ADMIN_EMAIL 時 role 維持 POST /register 寫入的既有值不變。
    // 不分大小寫比對。這不是放寬：走到這一行代表使用者已經收到寄往該
    // 信箱的驗證信並點擊了其中的連結，也就是必須真的控制那個信箱。
    const promoteToAdmin = isSameEmail(user.email, process.env.ADMIN_EMAIL);
    // 標記帳號為已驗證並清除 token
    await query(
      `UPDATE users
       SET is_verified = true,
           verification_token = NULL,
           verification_expires_at = NULL,
           role = CASE WHEN $2 THEN 'admin' ELSE role END,
           updated_at = NOW()
       WHERE id = $1`,
      [user.id, promoteToAdmin]
    );
    console.log('[Auth] 使用者 Email 驗證成功:', user.email);
    return res.status(200).json({ success: true, message: '電子信箱驗證成功！您現在可以登入了' });
  } catch (err) {
    console.error('[Auth] 驗證失敗:', err.message);
    return res.status(500).json({ success: false, error: '伺服器錯誤' });
  }
});

// POST /auth/resend-verification
router.post('/resend-verification', emailDispatchLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: '請提供 Email' });
  }
  try {
    const result = await query(
      'SELECT id, email, is_verified FROM users WHERE LOWER(email) = LOWER($1) AND is_active = true',
      [email]
    );
    // 無論帳號是否存在，回傳相同訊息以防止帳號枚舉
    if (result.rows.length === 0 || result.rows[0].is_verified) {
      return res.status(200).json({ success: true, message: '若此 Email 尚未驗證，驗證信已重新寄送，請至 Email 收取' });
    }
    const user = result.rows[0];
    const verificationToken = crypto.randomUUID();
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await query(
      'UPDATE users SET verification_token = $1, verification_expires_at = $2 WHERE id = $3',
      [verificationToken, verificationExpiresAt, user.id]
    );
    const frontendUrl = getPrimaryFrontendUrl();
    const verifyUrl = `${frontendUrl}/verify?token=${verificationToken}`;
    try {
      await sendVerificationEmail(user.email, verifyUrl);
    } catch (mailErr) {
      console.error('[Auth] 重新寄送驗證信失敗:', mailErr.message);
      return res.status(500).json({ success: false, error: '驗證信寄送失敗，請稍後再試或聯繫管理員' });
    }
    return res.status(200).json({ success: true, message: '若此 Email 尚未驗證，驗證信已重新寄送，請至 Email 收取' });
  } catch (err) {
    console.error('[Auth] 重新寄送驗證信失敗:', err.message);
    return res.status(500).json({ success: false, error: '伺服器錯誤' });
  }
});

// POST /auth/login
router.post('/login', loginLimiter, (req, res, next) => {
  passport.authenticate('local', { session: false }, async (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.status(401).json({ success: false, error: info?.message || '登入失敗' });
    const accessToken = generateAccessToken(user.id, user.role);
    const refreshToken = await generateRefreshToken(user.id);
    setRefreshTokenCookie(res, refreshToken);
    return res.json({
      success: true,
      access_token: accessToken,
      expires_in: 900,
      user: { id: user.id, email: user.email, display_name: user.display_name, avatar_url: user.avatar_url, role: user.role }
    });
  })(req, res, next);
});

// POST /auth/forgot-password
router.post('/forgot-password', emailDispatchLimiter, async (req, res) => {
  const { email } = req.body;
  // 無論是否找到帳號，一律回傳相同訊息以防止帳號枚舉攻擊
  const successMsg = { message: '若此 Email 已註冊，重設密碼連結已寄出' };
  if (!email) {
    return res.status(200).json(successMsg);
  }
  try {
    const result = await query(
      'SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) AND is_active = true',
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(200).json(successMsg);
    }
    const user = result.rows[0];
    const resetToken = crypto.randomUUID();
    const resetExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 小時後過期
    await query(
      'UPDATE users SET password_reset_token = $1, password_reset_expires_at = $2 WHERE id = $3',
      [resetToken, resetExpiresAt, user.id]
    );
    const frontendUrl = getPrimaryFrontendUrl();
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;
    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (mailErr) {
      console.error('[Auth] 重設密碼信寄送失敗:', mailErr.message);
    }
    console.log('[Auth] 重設密碼 token 已生成:', user.email);
    return res.status(200).json(successMsg);
  } catch (err) {
    console.error('[Auth] 忘記密碼處理失敗:', err.message);
    return res.status(500).json({ error: '伺服器錯誤' });
  }
});

// POST /auth/reset-password
router.post('/reset-password', passwordResetLimiter, async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: '連結無效或已過期，請重新申請' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: '密碼至少需要 8 個字元' });
  }
  try {
    const result = await query(
      `SELECT id, email FROM users
       WHERE password_reset_token = $1
         AND password_reset_expires_at > NOW()
         AND is_active = true`,
      [token]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: '連結無效或已過期，請重新申請' });
    }
    const user = result.rows[0];
    // cost 必須與 POST /register 一致。先前這裡寫 10、註冊寫 12——也就是
    // 使用者每重設一次密碼，自己的雜湊強度就被降一級。同一個常數只該有一個
    // 定義來源。
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await query(
      `UPDATE users
       SET password_hash = $1,
           password_reset_token = NULL,
           password_reset_expires_at = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    // 撤銷這個帳號目前所有的 refresh token。
    //
    // 這是「重設密碼」這件事的重點：使用者會走到這裡，最常見的原因就是懷疑
    // 帳號被入侵。refresh token 的效期是 30 天，先前重設密碼完全不影響它們
    // —— 攻擊者只要手上有一份還沒過期的 refresh cookie，就能在受害者改完
    // 密碼之後繼續無限換發 access token。改密碼卻趕不走入侵者，等於沒改。
    //
    // 刻意不排除「發起這次重設的那個工作階段」：走 email 連結重設密碼的人
    // 本來就不一定登入著，而回應訊息本來就是「請重新登入」。全部撤銷最單純，
    // 也不會有「哪一個 session 是本人」的判斷失誤。
    const revoked = await query(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
      [user.id]
    );
    console.log(`[Auth] 密碼重設成功: ${user.email}，已撤銷 ${revoked.rowCount ?? 0} 個 refresh token`);
    return res.status(200).json({ message: '密碼已成功重設，請重新登入' });
  } catch (err) {
    console.error('[Auth] 重設密碼失敗:', err.message);
    return res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /auth/google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

// GET /auth/google/callback
router.get('/google/callback', oauthCallbackGuard('google'), async (req, res) => {
  await completeOAuthLogin(req, res, 'google');
});

// GET /auth/github
router.get('/github', passport.authenticate('github', { scope: ['user:email'], session: false }));

// GET /auth/github/callback
router.get('/github/callback', oauthCallbackGuard('github'), async (req, res) => {
  await completeOAuthLogin(req, res, 'github');
});

// GET /auth/line
router.get('/line', (req, res, next) => {
  if (!process.env.LINE_CHANNEL_ID) {
    return res.redirect(`${getPrimaryFrontendUrl()}/login?error=line_not_configured`);
  }
  passport.authenticate('line', { session: false })(req, res, next);
});

// GET /auth/line/callback
router.get('/line/callback', (req, res, next) => {
  if (!process.env.LINE_CHANNEL_ID) {
    return res.redirect(`${getPrimaryFrontendUrl()}/login?error=line_not_configured`);
  }
  oauthCallbackGuard('line')(req, res, next);
}, async (req, res) => {
  await completeOAuthLogin(req, res, 'line');
});

// GET /auth/facebook
router.get('/facebook', (req, res, next) => {
  if (!process.env.FACEBOOK_APP_ID) {
    return res.redirect(`${getPrimaryFrontendUrl()}/login?error=facebook_not_configured`);
  }
  // 這條路由過去只請求 'public_profile'，而 config/passport.js 的
  // FacebookStrategy 卻已在 profileFields 準備接收 emails——兩者互相矛盾，
  // 導致 email 幾乎不會被回傳（Facebook 以「使用者授權的 permission」為準，
  // 不是 profileFields/fields= 參數）。
  //
  // 但 'email' 不能無條件請求：Facebook 應用程式若未取得 email 權限，
  // 請求該 scope 會直接回 "Invalid Scopes: email" 並中斷登入，而不是靜默
  // 略過（2026-08-02 實測，開發者帳號直接被擋在同意畫面之前）。
  // 因此改為由環境變數開關，預設不請求，維持登入可用：
  //   FACEBOOK_EMAIL_SCOPE=true  → 待 Facebook 後台的 email 權限核准後再開啟
  // 準備接收的欄位。若 Facebook 應用尚未通過 email permission 審核，
  // Graph API 會靜默省略該欄位、登入照常成功——這個改動在任何審核狀態下
  // 都是安全的。
  //
  // 這個改動一旦生效，Facebook 分支的 email 就不再幾乎恆為合成信箱——
  // isProviderEmailVerified('facebook', ...) 的保守 false 判定（見
  // oauthEmailVerification.js）與 SEC-07/D-16(option-b) 的合併閘門會開始
  // 真正接住這條路徑，而不再是先前的死碼。
  const facebookScope = process.env.FACEBOOK_EMAIL_SCOPE === 'true'
    ? ['public_profile', 'email']
    : ['public_profile'];
  passport.authenticate('facebook', { scope: facebookScope, session: false })(req, res, next);
});

// GET /auth/facebook/callback
router.get('/facebook/callback', (req, res, next) => {
  if (!process.env.FACEBOOK_APP_ID) {
    return res.redirect(`${getPrimaryFrontendUrl()}/login?error=facebook_not_configured`);
  }
  oauthCallbackGuard('facebook')(req, res, next);
}, async (req, res) => {
  await completeOAuthLogin(req, res, 'facebook');
});

// POST /auth/refresh
router.post('/refresh', async (req, res) => {
  const rawToken = req.cookies?.refresh_token;
  if (!rawToken) return res.status(401).json({ success: false, error: '未提供 Refresh Token' });
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  try {
    const result = await query(
      // u.is_active 是這次補上的條件。本專案在登入（config/localVerify.js）、
      // 忘記密碼、重寄驗證信、重設密碼四處都檢查 is_active，唯獨這裡沒有
      // —— 也就是一個被停用的帳號，只要手上還有沒過期的 refresh cookie，
      // 就能繼續換發 access token 長達 30 天。停用一個帳號卻趕不走它，等於
      // 沒停用。
      'SELECT rt.*, u.role FROM refresh_tokens rt JOIN users u ON rt.user_id = u.id WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > NOW() AND u.is_active = true',
      [tokenHash]
    );
    if (result.rows.length === 0) return res.status(401).json({ success: false, error: 'Refresh Token 無效或已過期' });
    const { user_id, role, id } = result.rows[0];
    // 撤銷舊 token
    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [id]);
    const newAccessToken = generateAccessToken(user_id, role);
    const newRefreshToken = await generateRefreshToken(user_id);
    setRefreshTokenCookie(res, newRefreshToken);
    return res.json({ success: true, access_token: newAccessToken, expires_in: 900 });
  } catch (err) {
    return res.status(500).json({ success: false, error: '伺服器錯誤' });
  }
});

// GET /auth/guest-session
// SEC-04/SEC-05/D-04/D-05: 功能頁的訪客身分簽發端點。刻意不需要驗證、
// 不查詢資料庫——維持訪客免登入即可遊玩，同時讓 Socket.io 握手時能驗證
// 這個由伺服器簽發的簽章，而非像現況一樣盲信 client 端自己產生的
// sessionId。sessionId 一律由伺服器產生，永遠不採信 request 上的任何值。
router.get('/guest-session', (req, res) => {
  const sessionId = crypto.randomUUID();
  const token = generateGuestSessionToken(sessionId);
  console.log('[Auth] 已簽發訪客 session');
  return res.json({ success: true, sessionId, token });
});

// POST /auth/logout
//
// 刻意用 optionalAuthenticate 而不是 authenticate。
//
// access token 只活 15 分鐘(見上方 expires_in: 900)。掛 authenticate 的話,
// 只要使用者在頁面上待超過 15 分鐘再按登出,這個請求會在進到函式本體之前
// 就被擋成 401 —— 於是 refresh token 沒被撤銷、cookie 沒被清掉,而前端已經
// 把本地狀態清乾淨了,使用者以為自己登出了。下次進站 silentRefresh 拿那張
// 還活著的 cookie 一換,人就又回到登入狀態。「登出在最需要它的時候失效」
// 是這裡最嚴重的失效模式,必須優先排除。
//
// 放寬的代價是什麼:這個端點不再要求證明「你是誰」,只要求你手上有那張
// refresh cookie。而要撤銷一張憑證,本來就必須先持有它 —— 沒有 cookie 的
// 請求走到下面只會清一個不存在的 cookie,撤銷不了任何東西。
//
// 唯一新增的風險是 CSRF:cookie 是 SameSite=None,第三方站台可以偽造一個
// 跨站 POST 把使用者登出。這是阻斷級的騷擾(使用者重新登入即可),不會洩漏
// 任何資料、也拿不到任何憑證 —— 用它換掉「過期就登不出去」是划算的。
router.post('/logout', optionalAuthenticate, async (req, res) => {
  const rawToken = req.cookies?.refresh_token;
  if (rawToken) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [tokenHash]).catch(() => {});
  }
  // 清除用的屬性必須與 utils/jwt.js 的 setRefreshTokenCookie 逐項一致。
  // 少了 sameSite:'none' 的話,瀏覽器會把這個 Set-Cookie 當成預設的
  // SameSite=Lax —— 而本站前後端不同網域(Vercel / Render),登出是一個
  // 跨站請求,Lax 的 Set-Cookie 在跨站情境會被整個丟棄。結果就是伺服器
  // 端撤銷成功、瀏覽器裡那張 cookie 卻原封不動,而且完全不報錯。
  res.clearCookie('refresh_token', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
  });
  return res.json({ success: true, message: '已成功登出' });
});

// GET /auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, email, display_name, avatar_url, role, created_at FROM users WHERE id = $1',
      [req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: '找不到使用者' });
    return res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: '伺服器錯誤' });
  }
});

module.exports = router;
