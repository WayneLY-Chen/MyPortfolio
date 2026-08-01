const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const LineStrategy = require('passport-line-auth').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const { verifyLocalCredentials } = require('./localVerify');
const { handleOAuth } = require('./oauthAccountLink');
const { isProviderEmailVerified, decodeLineIdToken } = require('./oauthEmailVerification');

// SEC-07/D-16(option-b)/D-17：handleOAuth 已搬到 ./oauthAccountLink.js
// （見該檔頂端註解說明原因與 D-16 option-a → option-b 的取代紀錄）。
// isProviderEmailVerified 依 02-PROVIDER-EMAIL-VERIFICATION.md 的事實表
// 判定各家 provider 是否明確聲明這次的 email 已驗證，四家 strategy 都
// 必須算出這個值並傳給 handleOAuth——這是 Phase 1 抽出 completeOAuthLogin
// 要防的同一類「改三家漏一家」問題。decodeLineIdToken（LINE id_token 的
// HS256 簽章驗證，見 oauthEmailVerification.js）也搬到同一個模組，理由
// 相同：這裡會被測試替身整個換掉，邏輯留在這裡就永遠測不到。

// 本地登入
// 驗證邏輯搬到 ./localVerify.js（見該檔案頂端註解說明原因：測試環境會把
// 整個 passport.js 換成替身，驗證邏輯留在這裡就永遠測不到）。
passport.use(new LocalStrategy({ usernameField: 'email' }, verifyLocalCredentials));

// Google OAuth
if (process.env.GOOGLE_CLIENT_ID) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.API_BASE_URL}/auth/google/callback`,
  }, async (accessToken, refreshToken, profile, done) => {
    const email = profile.emails?.[0]?.value;
    const avatar = profile.photos?.[0]?.value;
    // D-18/SEC-07：Google 已經現成提供 email_verified 訊號
    // （profile.emails[0].verified，見 oauthEmailVerification.js），
    // 這是四家中最容易正確判斷的一家。
    const emailVerified = isProviderEmailVerified('google', profile, {});
    await handleOAuth('google', profile.id, email, profile.displayName, avatar, emailVerified, done);
  }));
}

// GitHub OAuth
if (process.env.GITHUB_CLIENT_ID) {
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: `${process.env.API_BASE_URL}/auth/github/callback`,
    scope: ['user:email'],
    // D-18/SEC-07（02-06 決策閘追加調整）：passport-github2 預設會把
    // /user/emails 回應的 verified 欄位丟棄，只留下 primary email 的
    // 字串值。加上 allRawEmails: true 讓 profile.emails[0].verified
    // 保留真實查驗結果，而不是被本專案的設定方式截斷。
    allRawEmails: true,
  }, async (accessToken, refreshToken, profile, done) => {
    const email = profile.emails?.[0]?.value;
    const avatar = profile.photos?.[0]?.value;
    const emailVerified = isProviderEmailVerified('github', profile, {});
    await handleOAuth('github', profile.id, email, profile.displayName || profile.username, avatar, emailVerified, done);
  }));
}

// LINE OAuth
// 需在 LINE Developers 後台將 Callback URL 設定為：${API_BASE_URL}/auth/line/callback
// 並在 .env 設定 LINE_CHANNEL_ID、LINE_CHANNEL_SECRET
if (process.env.LINE_CHANNEL_ID) {
  passport.use(new LineStrategy({
    channelID: process.env.LINE_CHANNEL_ID,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
    callbackURL: `${process.env.API_BASE_URL}/auth/line/callback`,
    // scope 必須包含 openid 和 email，否則 email 拿不到
    scope: ['profile', 'openid', 'email'],
    botPrompt: 'normal',
  }, async (accessToken, refreshToken, params, profile, done) => {
    // LINE profile 格式：profile.id, profile.displayName, profile.pictureUrl。
    //
    // D-18 追加調查（C）：先前這裡寫著「email 不在 profile 內，而是透過
    // params.id_token 解析，passport-line-auth 會自動放入 profile.email」
    // ——這個說法與目前安裝的 passport-line-auth@0.2.9 實際行為不符（逐行
    // 讀 node_modules 原始碼證實：該版本從未處理 email 或 id_token，
    // profile.email 恆為 undefined，見
    // .planning/phases/02-reliability-hardening/02-PROVIDER-EMAIL-VERIFICATION.md）。
    // 這裡改為手動解碼並驗證 params.id_token（LINE 的 token 端點回應，
    // passport-oauth2 以 arity-5 verify callback 原封不動傳進來）。
    const profileId = profile.id || profile.sub;
    const displayName = profile.displayName || profile.name || `LINE用戶_${profileId}`;
    const avatarUrl = profile.pictureUrl || profile.photos?.[0]?.value || null;
    const idTokenClaims = decodeLineIdToken(params?.id_token, process.env.LINE_CHANNEL_SECRET, process.env.LINE_CHANNEL_ID);
    const email = idTokenClaims?.email || profile.email || `line_${profileId}@noemail.auth`;
    // LINE 的 ID token 是否附帶 email_verified claim 未經即時查證——保守
    // 只在該 claim 明確為 true 時才視為已驗證，其餘一律 false。
    const lineProfileForVerification = {
      email,
      emailVerified: idTokenClaims?.email_verified === true,
    };
    const emailVerified = isProviderEmailVerified('line', lineProfileForVerification, params);
    await handleOAuth('line', String(profileId), email, displayName, avatarUrl, emailVerified, done);
  }));
}

// Facebook OAuth
// 需在 Facebook Developers 後台將 OAuth 重新導向 URI 設定為：${API_BASE_URL}/auth/facebook/callback
// 並在 .env 設定 FACEBOOK_APP_ID、FACEBOOK_APP_SECRET
if (process.env.FACEBOOK_APP_ID) {
  passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: `${process.env.API_BASE_URL}/auth/facebook/callback`,
    // profileFields 必須明確指定，否則 email 和大頭貼不會回傳
    profileFields: ['id', 'emails', 'name', 'displayName', 'photos'],
  }, async (accessToken, refreshToken, profile, done) => {
    const email = profile.emails?.[0]?.value || `fb_${profile.id}@noemail.auth`;
    const avatar = profile.photos?.[0]?.value || null;
    const displayName = profile.displayName ||
      `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim() ||
      `Facebook用戶_${profile.id}`;
    // Facebook Graph API 的 email 欄位不附帶任何驗證旗標，一律 false
    // （見 oauthEmailVerification.js）。
    const emailVerified = isProviderEmailVerified('facebook', profile, {});
    await handleOAuth('facebook', profile.id, email, displayName, avatar, emailVerified, done);
  }));
}

module.exports = passport;
