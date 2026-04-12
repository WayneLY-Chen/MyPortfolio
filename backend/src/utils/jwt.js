const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../db');

const generateAccessToken = (userId, role) => {
  return jwt.sign(
    { sub: userId, role, type: 'access' },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' }
  );
};

const generateRefreshToken = async (userId) => {
  const rawToken = crypto.randomBytes(64).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt]
  );
  return rawToken;
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
};

const setRefreshTokenCookie = (res, token) => {
  res.cookie('refresh_token', token, {
    httpOnly: true,
    secure: true, // 跨網域 None 必須配合 Secure: true
    sameSite: 'none',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });
};

module.exports = { generateAccessToken, generateRefreshToken, verifyAccessToken, setRefreshTokenCookie };
