// backend/src/config/oauthEmailVerification.js
//
// D-18/SEC-07：依 .planning/phases/02-reliability-hardening/
// 02-PROVIDER-EMAIL-VERIFICATION.md 的逐家事實表，判定這次 OAuth 登入的
// email 是否被該 provider 明確聲明為已驗證。
//
// 不 require ../db、不寄信——不碰持久化狀態或外部通訊。decodeLineIdToken
// 是本檔唯一會做非純函式運算的部分（HMAC 簽章驗證屬確定性計算，失敗時
// console.error 一行以利除錯，不寫入任何狀態），刻意放在這裡而不是留在
// passport.js 裡的原因與 handleOAuth 搬到 oauthAccountLink.js 相同：
// passport.js 整個檔案會被 backend/src/test/setup.js 的 Module._load
// 橋接換成測試替身，留在那裡的邏輯永遠測不到——這裡才能被
// oauthEmailVerification.test.js 直接呼叫、直接偽造簽章驗證失敗。
//
// 呼叫端（backend/src/config/oauthAccountLink.js）依 isProviderEmailVerified
// 的回傳值決定是否允許自動合併既有帳號（SEC-07/D-16，已被 02-06 決策閘
// 取代為 option-b：撞到既有帳號且未驗證時直接拒絕登入，不建新表/端點/
// 確認信）與是否允許滿足 admin 判定（D-17）。
//
// 保守原則：任何「無法確定」的訊號一律回傳 false，而非省略判斷——
// 詳見事實表「對 02-08 的影響」一節。四家目前的結論：
//   - google：訊號現成存在於 profile.emails[0].verified（來自 OIDC
//     email_verified claim），本模組是第一個真正讀取它的地方。
//   - github：訊號存在於 provider API，但只有在 passport.js 建構
//     GitHubStrategy 時加上 allRawEmails: true，profile.emails[0].verified
//     才不會被函式庫在抵達這裡之前就丟棄成 undefined。
//   - line：passport-line-auth@0.2.9 從未把 email 寫進 profile；02-08
//     另外在 passport.js 手動解碼並驗證 params.id_token 取得真實 email，
//     但 LINE 的 ID token 是否附帶 email_verified claim 未經即時查證，
//     保守回傳 false，除非呼叫端明確算出 emailVerified === true。
//   - facebook：Graph API 的 email 欄位不附帶任何驗證旗標，一律 false。

const jwt = require('jsonwebtoken');

const SYNTHETIC_EMAIL_PATTERN = /^(line|fb)_.+@noemail\.auth$/;

const LINE_ID_TOKEN_ISSUER = 'https://access.line.me';

// D-18/追加調查(C)：passport-line-auth@0.2.9 的 userProfile() 從未把 email
// 寫進 profile（見事實表逐行追蹤 node_modules 原始碼的結論）。真正的 email
// 落在 token 端點回應裡的 id_token（LINE 簽發的 JWT），這裡手動解碼並
// 驗證簽章——不是單純 base64 解碼，那樣任何人都能偽造 email claim 直接
// 走過 D-16/option-b 的合併/拒絕閘門。LINE 以 Channel Secret 做 HS256
// 對稱簽章，額外比對 issuer 與 audience，三者缺一都視為驗證失敗。
//
// @param {string} idToken - params.id_token（passport-oauth2 arity-5 verify
//   callback 原封不動傳進來的 token 端點原始回應欄位）
// @param {string} channelSecret - process.env.LINE_CHANNEL_SECRET
// @param {string} channelId - process.env.LINE_CHANNEL_ID（作為 audience）
// @returns {object|null} 驗證成功回傳解碼後的 claims；任何失敗（簽章不符、
//   issuer/audience 不符、過期、格式錯誤、缺少 channelSecret）一律回傳
//   null——呼叫端應落回既有的合成 email 分支，不得因此中斷整個登入流程。
const decodeLineIdToken = (idToken, channelSecret, channelId) => {
  if (!idToken || !channelSecret) return null;
  try {
    return jwt.verify(idToken, channelSecret, {
      algorithms: ['HS256'],
      issuer: LINE_ID_TOKEN_ISSUER,
      audience: channelId,
    });
  } catch (err) {
    console.error('[Auth] LINE id_token 驗證失敗:', err.message);
    return null;
  }
};

// 合成 email（line_ 或 fb_ 前綴、@noemail.auth 結尾）一律視為未驗證。這在
// 實務上是 no-op——合成 email 不可能撞到真實使用者帳號——但明確寫出來，
// 避免下一個讀者以為漏了一個分支。沒有 email（undefined/null/空字串）
// 同樣視為未驗證。
const isSyntheticEmail = (email) => !email || SYNTHETIC_EMAIL_PATTERN.test(email);

/**
 * @param {string} provider - 'google' | 'github' | 'line' | 'facebook' | 其他
 * @param {object} profile - 該家 provider 的 profile 物件（形狀依家而異，見下）
 * @param {object} params - passport-oauth2 傳遞的 token 端點原始回應（本模組
 *   目前只用於未來擴充；LINE 的已驗證訊號由呼叫端算好後放進 profile.emailVerified）
 * @returns {boolean}
 */
const isProviderEmailVerified = (provider, profile = {}, params = {}) => {
  switch (provider) {
    case 'google': {
      // passport-google-oauth20 的 openid 解析器把 UserInfo 回應的
      // email_verified claim 放進 profile.emails[0].verified，同一份原始
      // 值也留在 profile._json.email_verified。本專案設定下，一般 Gmail
      // 帳號恆為 true，但自訂網域（Google Workspace）尚未完成網域驗證時
      // 可能是 false——這正是本次修復要接住的訊號。
      const email = profile?.emails?.[0]?.value;
      if (isSyntheticEmail(email)) return false;
      return (
        profile?.emails?.[0]?.verified === true ||
        profile?._json?.email_verified === true
      );
    }
    case 'github': {
      // 前提：passport.js 建構 GitHubStrategy 時已加上 allRawEmails: true。
      // 若日後這個選項被移除，profile.emails[0].verified 會變回 undefined，
      // 下面的 === true 會落在 false——保守但不會誤判為已驗證。
      const email = profile?.emails?.[0]?.value;
      if (isSyntheticEmail(email)) return false;
      return profile?.emails?.[0]?.verified === true;
    }
    case 'line': {
      // profile.email 是 passport.js 手動解碼 params.id_token 後算出的
      // 真實 email（若解碼/驗證失敗則回退為合成 email，見 passport.js）。
      // profile.emailVerified 則是呼叫端從 id_token claims 讀出的
      // email_verified（若該 claim 不存在，呼叫端會傳 undefined，此處
      // === true 一樣落在 false）。
      const email = profile?.email;
      if (isSyntheticEmail(email)) return false;
      return profile?.emailVerified === true;
    }
    case 'facebook': {
      // Facebook Graph API 的 email 欄位沒有任何 verified/email_verified
      // 旗標可讀（passport-facebook@3.0.0 的 Profile.parse() 已逐行確認），
      // 沒有訊號可用，一律保守回傳 false，而非省略此分支。
      const email = profile?.emails?.[0]?.value;
      if (isSyntheticEmail(email)) return false;
      return false;
    }
    default:
      // 未知 provider：沒有任何事實依據可以判定已驗證，保守回傳 false。
      return false;
  }
};

module.exports = { isProviderEmailVerified, isSyntheticEmail, decodeLineIdToken };
