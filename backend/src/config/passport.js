const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const LineStrategy = require('passport-line-auth').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const bcrypt = require('bcrypt');
const { query } = require('../db');

// 共用 OAuth 處理
const handleOAuth = async (provider, profileId, email, displayName, avatarUrl, done) => {
  try {
    const existing = await query(
      'SELECT u.* FROM users u JOIN oauth_accounts oa ON u.id = oa.user_id WHERE oa.provider = $1 AND oa.provider_id = $2',
      [provider, profileId]
    );
    if (existing.rows.length > 0) return done(null, existing.rows[0]);

    let user;
    if (email) {
      const byEmail = await query('SELECT * FROM users WHERE email = $1', [email]);
      if (byEmail.rows.length > 0) user = byEmail.rows[0];
    }

    // 需在 .env 設定 ADMIN_EMAIL 以指定管理員帳號
    const isAdmin = email === process.env.ADMIN_EMAIL;

    if (!user) {
      const result = await query(
        'INSERT INTO users (email, display_name, avatar_url, role, is_verified) VALUES ($1, $2, $3, $4, true) RETURNING *',
        [email, displayName, avatarUrl, isAdmin ? 'admin' : 'visitor']
      );
      user = result.rows[0];
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

// 本地登入
passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
  try {
    const result = await query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email]);
    if (result.rows.length === 0) return done(null, false, { message: 'Email 或密碼錯誤' });
    const user = result.rows[0];
    if (!user.password_hash) return done(null, false, { message: '請使用第三方登入' });
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return done(null, false, { message: 'Email 或密碼錯誤' });
    if (!user.is_verified) return done(null, false, { message: '請先至 Email 收取驗證信以啟用帳號' });
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

// Google OAuth
if (process.env.GOOGLE_CLIENT_ID) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.API_BASE_URL}/auth/google/callback`,
  }, async (accessToken, refreshToken, profile, done) => {
    const email = profile.emails?.[0]?.value;
    const avatar = profile.photos?.[0]?.value;
    await handleOAuth('google', profile.id, email, profile.displayName, avatar, done);
  }));
}

// GitHub OAuth
if (process.env.GITHUB_CLIENT_ID) {
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: `${process.env.API_BASE_URL}/auth/github/callback`,
    scope: ['user:email'],
  }, async (accessToken, refreshToken, profile, done) => {
    const email = profile.emails?.[0]?.value;
    const avatar = profile.photos?.[0]?.value;
    await handleOAuth('github', profile.id, email, profile.displayName || profile.username, avatar, done);
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
    // LINE profile 格式：profile.id, profile.displayName, profile.pictureUrl
    // email 不在 profile 內，而是透過 params.id_token 解析，passport-line-auth 會自動放入 profile.email
    const profileId = profile.id || profile.sub;
    const displayName = profile.displayName || profile.name || `LINE用戶_${profileId}`;
    const avatarUrl = profile.pictureUrl || profile.photos?.[0]?.value || null;
    const email = profile.email || `line_${profileId}@noemail.auth`;
    await handleOAuth('line', String(profileId), email, displayName, avatarUrl, done);
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
    await handleOAuth('facebook', profile.id, email, displayName, avatar, done);
  }));
}

module.exports = passport;
