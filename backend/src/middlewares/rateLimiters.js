const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;

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

// D-06: AI 端點以 req.userId 優先、IP 為輔計量，訪客不需登入即可使用 —— req.userId
// 只有 optionalAuthenticate 先執行過且帶有效 token 時才存在，沒有的話退回 IP，
// 絕不能變成登入牆。
// 查證（安裝完成後讀 express-rate-limit@8.6.1 的實際原始碼，非憑印象判斷）：
// node_modules/express-rate-limit/dist/index.cjs 內建一個 validations.keyGeneratorIpFallback
// 檢查——對自訂 keyGenerator 的原始碼字串做比對，若含有 "req.ip"/"request.ip"
// 卻沒有呼叫 ipKeyGenerator，會印出警告「Custom keyGenerator appears to use
// request IP without calling the ipKeyGenerator helper function for IPv6
// addresses. This could allow IPv6 users to bypass limits.」。套件本身也確實
// 匯出 ipKeyGenerator（會把 IPv4-mapped IPv6、以及純 IPv6 位址正規化成穩定的
// key，避免同一位訪客用不同位址格式繞過額度），因此 IP 分支一律包這一層。
const aiOrIpKeyGenerator = (req) => req.userId || ipKeyGenerator(req.ip);

// REL-05/D-07: 三個會消耗 Gemini 配額的端點（/chat、/generate-image、/summarize）
// 合計每小時 40 次。
const aiLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1000,
  limit: 40,
  keyGenerator: aiOrIpKeyGenerator,
});

// REL-05 的一處明確細分（非縮減範圍，理由記錄於此並同步寫進本計畫 SUMMARY）：
// /tts 走 msedge-tts（微軟 Edge 朗讀服務），完全不碰 Gemini 配額，D-07 的
// 「AI 40 次／小時」針對的是會消耗 Gemini 配額的呼叫，不包含它。前端 Wobot
// 會把一則回覆切成多個分句、每個分句各打一次 /tts —— 若與 aiLimiter 共用
// 40 次／小時，訪客講不到十句話就會被自己的朗讀功能鎖死，直接違反
// PROJECT.md 的 Core Value（訪客免登入即可互動）。300 次／小時 約等於
// 40 則回覆 × 每則約 7 個分句，與 aiLimiter 的實際可用量對齊。
const ttsLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1000,
  limit: 300,
  keyGenerator: aiOrIpKeyGenerator,
});

// REL-06/D-07: 留言每 10 分鐘 20 次，以 req.userId 計量。必須掛在 authenticate
// 之後——該 middleware 才會產生 req.userId，掛在前面時所有人共用同一個
// undefined 桶。
const commentsLimiter = rateLimit({
  ...commonOptions,
  windowMs: 10 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => req.userId,
});

// REL-06/D-07: 專案強制同步每小時 5 次，同樣以 req.userId 計量，必須掛在
// authenticate + requireAdmin 之後。合法呼叫者本來就是管理員手動觸發的低頻
// 操作，額度可以嚴一點，不影響一般訪客。
const syncLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => req.userId,
});

// 尾刀爭奪戰的 REST 端點以 IP 計量。這個功能訪客免登入即可遊玩，因此不能
// 以 req.userId 分桶（多數呼叫者根本沒有身分）。額度取每分鐘 60 次：一名
// 玩家出一張牌約需數秒，正常遊玩遠達不到，但可擋住腳本化的洗榜與洗傷害。
//
// 注意涵蓋範圍：前端實際走的是 Socket.io 的 boss_attack 事件，那條路徑不
// 經過 Express middleware，因此不受本 limiter 約束。socket 層的濫用防護
// 依靠 bossValidation.js 的數值上限與 MAX_TRACKED_PLAYERS 陣列上限，兩者
// 是互補而非重複。
const bossLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 1000,
  limit: 60,
});

// 表情反應以 req.userId 優先、IP 為輔計量。這個功能訪客免登入即可使用，
// 多數呼叫者沒有帳號身分，因此不能只用 req.userId 分桶。
//
// 額度取每分鐘 30 次：真人在一篇文章上點表情不會超過個位數，30 次留給
// 快速切換不同表情與多開分頁的情況。此限流與 resolveGuestSession 的憑證
// 驗證互補——後者讓身分不可偽造，前者限制單一來源的操作頻率。
const reactionsLimiter = rateLimit({
  ...commonOptions,
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: aiOrIpKeyGenerator,
});

module.exports = { loginLimiter, aiLimiter, ttsLimiter, commentsLimiter, syncLimiter, bossLimiter, reactionsLimiter };
