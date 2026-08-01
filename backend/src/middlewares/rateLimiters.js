const rateLimit = require('express-rate-limit');

// 集中管理本專案所有的 rate limiter。四組端點（登入 / AI / TTS / 留言 / 專案同步）
// 共用同一組回應格式與 header 設定，避免各自維護一份、格式日後漂移時要改四處。
// D-08 已把 429 回應 body 釘死為下面這個固定物件，所有 limiter 一律共用。
const commonOptions = {
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ success: false, message: '請求過於頻繁，請稍後再試' });
  },
};

// REL-04/D-07: 登入端點 15 分鐘內最多 10 次，以 IP 計量 —— 登入成功前不存在任何
// 身分（req.userId 尚未產生），無法以使用者分桶，因此沿用套件預設的 keyGenerator
// （內部已對 IPv6 做正規化）。目的是拉高暴力字典攻擊「線上化」的成本，而不是擋住
// 訪客偶爾打錯密碼 —— 10 次的額度刻意寬鬆（D-07：訪客可能是面試官，誤擋代價較高）。
const loginLimiter = rateLimit({
  ...commonOptions,
  windowMs: 15 * 60 * 1000,
  limit: 10,
});

module.exports = { loginLimiter };
