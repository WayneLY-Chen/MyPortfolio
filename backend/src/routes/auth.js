const express = require('express');
const router = express.Router();
const passport = require('../config/passport');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { query } = require('../db');
const { generateAccessToken, generateRefreshToken, setRefreshTokenCookie, verifyAccessToken } = require('../utils/jwt');
const { authenticate } = require('../middlewares/authenticate');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/mailer');
 
// 解析多個前端網址，取第一個作為跳轉目的地
const getPrimaryFrontendUrl = () => {
  const urls = (process.env.FRONTEND_URL || '').split(',').map(u => u.trim()).filter(Boolean);
  return urls[0] || 'http://localhost:5173';
};

// POST /auth/register
router.post('/register', async (req, res) => {
  const { email, password, display_name } = req.body;
  if (!email || !password || !display_name) {
    return res.status(400).json({ success: false, error: '請填寫所有必要欄位' });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, error: '密碼至少需要 8 個字元' });
  }
  try {
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'Email 已被使用' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    // 需在 .env 設定 ADMIN_EMAIL 以指定管理員帳號
    const isAdmin = email === process.env.ADMIN_EMAIL;

    // 生成驗證 token，有效期 24 小時
    const verificationToken = crypto.randomUUID();
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const result = await query(
      `INSERT INTO users
         (email, password_hash, display_name, role, is_verified, verification_token, verification_expires_at)
       VALUES ($1, $2, $3, $4, false, $5, $6)
       RETURNING id, email, display_name, avatar_url, role, is_verified, created_at`,
      [email, passwordHash, display_name, isAdmin ? 'admin' : 'visitor', verificationToken, verificationExpiresAt]
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
    // 標記帳號為已驗證並清除 token
    await query(
      `UPDATE users
       SET is_verified = true, verification_token = NULL, verification_expires_at = NULL, updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );
    console.log('[Auth] 使用者 Email 驗證成功:', user.email);
    return res.status(200).json({ success: true, message: '電子信箱驗證成功！您現在可以登入了' });
  } catch (err) {
    console.error('[Auth] 驗證失敗:', err.message);
    return res.status(500).json({ success: false, error: '伺服器錯誤' });
  }
});

// POST /auth/resend-verification
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: '請提供 Email' });
  }
  try {
    const result = await query(
      'SELECT id, email, is_verified FROM users WHERE email = $1 AND is_active = true',
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
router.post('/login', (req, res, next) => {
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
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  // 無論是否找到帳號，一律回傳相同訊息以防止帳號枚舉攻擊
  const successMsg = { message: '若此 Email 已註冊，重設密碼連結已寄出' };
  if (!email) {
    return res.status(200).json(successMsg);
  }
  try {
    const result = await query(
      'SELECT id, email FROM users WHERE email = $1 AND is_active = true',
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
router.post('/reset-password', async (req, res) => {
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
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await query(
      `UPDATE users
       SET password_hash = $1,
           password_reset_token = NULL,
           password_reset_expires_at = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, user.id]
    );
    console.log('[Auth] 密碼重設成功:', user.email);
    return res.status(200).json({ message: '密碼已成功重設，請重新登入' });
  } catch (err) {
    console.error('[Auth] 重設密碼失敗:', err.message);
    return res.status(500).json({ error: '伺服器錯誤' });
  }
});

// GET /auth/google
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

// GET /auth/google/callback
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: `${getPrimaryFrontendUrl()}/login?error=oauth_failed` }), async (req, res) => {
  const user = req.user;
  const accessToken = generateAccessToken(user.id, user.role);
  const refreshToken = await generateRefreshToken(user.id);
  setRefreshTokenCookie(res, refreshToken);
  res.redirect(`${getPrimaryFrontendUrl()}/login/callback?token=${accessToken}`);
});

// GET /auth/github
router.get('/github', passport.authenticate('github', { scope: ['user:email'], session: false }));

// GET /auth/github/callback
router.get('/github/callback', passport.authenticate('github', { session: false, failureRedirect: `${getPrimaryFrontendUrl()}/login?error=oauth_failed` }), async (req, res) => {
  const user = req.user;
  const accessToken = generateAccessToken(user.id, user.role);
  const refreshToken = await generateRefreshToken(user.id);
  setRefreshTokenCookie(res, refreshToken);
  res.redirect(`${getPrimaryFrontendUrl()}/login/callback?token=${accessToken}`);
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
  passport.authenticate('line', {
    session: false,
    failureRedirect: `${getPrimaryFrontendUrl()}/login?error=oauth_failed`,
  })(req, res, next);
}, async (req, res) => {
  const user = req.user;
  const accessToken = generateAccessToken(user.id, user.role);
  const refreshToken = await generateRefreshToken(user.id);
  setRefreshTokenCookie(res, refreshToken);
  res.redirect(`${getPrimaryFrontendUrl()}/login/callback?token=${accessToken}`);
});

// GET /auth/facebook
router.get('/facebook', (req, res, next) => {
  if (!process.env.FACEBOOK_APP_ID) {
    return res.redirect(`${getPrimaryFrontendUrl()}/login?error=facebook_not_configured`);
  }
  passport.authenticate('facebook', { scope: ['public_profile'], session: false })(req, res, next);
});

// GET /auth/facebook/callback
router.get('/facebook/callback', (req, res, next) => {
  if (!process.env.FACEBOOK_APP_ID) {
    return res.redirect(`${getPrimaryFrontendUrl()}/login?error=facebook_not_configured`);
  }
  passport.authenticate('facebook', {
    session: false,
    failureRedirect: `${getPrimaryFrontendUrl()}/login?error=oauth_failed`,
  })(req, res, next);
}, async (req, res) => {
  const user = req.user;
  const accessToken = generateAccessToken(user.id, user.role);
  const refreshToken = await generateRefreshToken(user.id);
  setRefreshTokenCookie(res, refreshToken);
  res.redirect(`${getPrimaryFrontendUrl()}/login/callback?token=${accessToken}`);
});

// POST /auth/refresh
router.post('/refresh', async (req, res) => {
  const rawToken = req.cookies?.refresh_token;
  if (!rawToken) return res.status(401).json({ success: false, error: '未提供 Refresh Token' });
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  try {
    const result = await query(
      'SELECT rt.*, u.role FROM refresh_tokens rt JOIN users u ON rt.user_id = u.id WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > NOW()',
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

// POST /auth/logout
router.post('/logout', authenticate, async (req, res) => {
  const rawToken = req.cookies?.refresh_token;
  if (rawToken) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [tokenHash]).catch(() => {});
  }
  res.clearCookie('refresh_token', { path: '/auth' });
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
