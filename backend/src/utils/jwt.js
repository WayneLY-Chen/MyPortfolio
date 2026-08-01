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
  const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  // SEC-05/T-01-06: guest session tokens (見下方 generateGuestSessionToken)
  // 使用同一把簽章密鑰，簽章驗證本身無法區分兩種憑證。若不檢查 type claim，
  // 一個合法簽章的訪客 token 會通過這裡的驗證，導致 req.userId 被設成
  // undefined（訪客 token 沒有 sub claim），後續查詢會用 undefined 執行。
  // 名稱與 TokenExpiredError 不同，讓 authenticate.js 既有的過期判斷分支
  // 維持原樣。
  if (payload.type !== 'access') {
    const err = new Error('WRONG_TOKEN_TYPE');
    err.name = 'JsonWebTokenError';
    throw err;
  }
  return payload;
};

const setRefreshTokenCookie = (res, token) => {
  res.cookie('refresh_token', token, {
    httpOnly: true,
    secure: true, // 跨網域 None 必須配合 Secure: true
    sameSite: 'none',
    path: '/',
  });
};

// SEC-04/SEC-05/D-04/D-05: 訪客 session 憑證。維持功能頁免登入即可遊玩——
// 伺服器產生並簽名 sessionId，Socket.io 握手時驗證簽章而非盲信 client 端
// 自報的值。刻意沿用 JWT_ACCESS_SECRET（不新增環境變數，見 RESEARCH.md
// assumption A2），因此 type claim 是區分兩種憑證的唯一依據——見上方
// verifyAccessToken 與下方 verifyGuestSessionToken 的雙向檢查。
// 24 小時效期：訪客不必每次瀏覽都重新取得 token，但憑證也不會存活超過
// 一次瀏覽 session 太多天。
const generateGuestSessionToken = (sessionId) => {
  return jwt.sign(
    { sid: sessionId, type: 'guest' },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '24h' }
  );
};

const verifyGuestSessionToken = (token) => {
  const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  if (payload.type !== 'guest') {
    const err = new Error('WRONG_TOKEN_TYPE');
    err.name = 'JsonWebTokenError';
    throw err;
  }
  return payload;
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  setRefreshTokenCookie,
  generateGuestSessionToken,
  verifyGuestSessionToken,
};
