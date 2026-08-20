const { verifyAccessToken, verifyGuestSessionToken } = require('../utils/jwt');

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '未提供驗證 Token' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    req.userRole = payload.role;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, message: '無效的 Token' });
  }
};

const optionalAuthenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ') || authHeader.split(' ')[1] === 'null') {
    return next();
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    req.userRole = payload.role;
    next();
  } catch {
    next();
  }
};

const requireAdmin = (req, res, next) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ success: false, message: '需要管理員權限' });
  }
  next();
};

// SEC-04/SEC-05 的延伸：把訪客身分的驗證方式統一到伺服器簽發的憑證上。
//
// 表情反應端點先前直接把 x-session-id 標頭（或 request body 的 session_id）
// 當成身分使用，而那個值完全由請求端自報：送別人的 id 就能刪掉別人的反應，
// 送無限個假 id 就能把計數灌到任意數字。Socket.io 的握手早就改成驗證
// /auth/guest-session 簽發的簽章憑證（見 sockets/index.js），這裡沿用同一套。
//
// 刻意不 fail 掉整個請求：驗不過就是「沒有訪客身分」（req.guestSessionId 為
// null），由呼叫端決定要不要拒絕。讀取類端點沒有身分仍應能取得計數。
// 關鍵是驗不過時絕不退回採信原始值——那正是原本的漏洞。
const resolveGuestSession = (req, res, next) => {
  const raw = req.headers['x-session-id'];
  req.guestSessionId = null;
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      req.guestSessionId = verifyGuestSessionToken(raw).sid;
    } catch {
      req.guestSessionId = null;
    }
  }
  next();
};

module.exports = { authenticate, optionalAuthenticate, requireAdmin, resolveGuestSession };
