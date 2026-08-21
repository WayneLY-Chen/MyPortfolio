const rateLimit = require('express-rate-limit');
const { ipKeyGenerator, MemoryStore } = rateLimit;

// 每個 limiter 都掛一個自己的 MemoryStore 實例。
//
// 不指定 store 時 express-rate-limit 會自己建一個，但外部就拿不到它，
// 計數也就無法重置。整合測試（例如 routes/leaderboard.test.js）會在同一個
// 行程內對同一條路由發數十次請求，全部來自 127.0.0.1 —— 沒有重置手段的話
// 第 N 次之後一律回 429，測試失敗的原因會變成「額度用完」而不是被測的邏輯。
//
// 刻意不用「NODE_ENV === test 就 skip」的做法：那會讓限流在測試環境完全不
// 生效，於是「這條路由到底有沒有掛上 limiter」這件事就再也測不到了 ——
// 而那正是這一輪發現 leaderboard 漏掛限流的那一類問題。
const stores = [];
const makeStore = () => { const s = new MemoryStore(); stores.push(s); return s; };

/** 測試用：清掉所有 limiter 的計數。 */
const _resetAllLimitersForTests = () => { for (const s of stores) s.resetAll(); };

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
  store: makeStore(),
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
  store: makeStore(),
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
  store: makeStore(),
  windowMs: 60 * 60 * 1000,
  limit: 300,
  keyGenerator: aiOrIpKeyGenerator,
});

// REL-06/D-07: 留言每 10 分鐘 20 次，以 req.userId 計量。必須掛在 authenticate
// 之後——該 middleware 才會產生 req.userId，掛在前面時所有人共用同一個
// undefined 桶。
const commentsLimiter = rateLimit({
  ...commonOptions,
  store: makeStore(),
  windowMs: 10 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => req.userId,
});

// REL-06/D-07: 專案強制同步每小時 5 次，同樣以 req.userId 計量，必須掛在
// authenticate + requireAdmin 之後。合法呼叫者本來就是管理員手動觸發的低頻
// 操作，額度可以嚴一點，不影響一般訪客。
const syncLimiter = rateLimit({
  ...commonOptions,
  store: makeStore(),
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
  store: makeStore(),
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
  store: makeStore(),
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: aiOrIpKeyGenerator,
});

// 會寄出 Email 的兩個端點：POST /auth/forgot-password 與
// POST /auth/resend-verification。兩者先前完全沒有限流。
//
// 為什麼這是安全問題而不只是「少一道保險」：兩者都以請求 body 的 email 決定
// 收件人，而且都刻意做了防帳號枚舉（不論帳號存不存在都回同一句話）。沒有限流
// 時，攻擊者只要知道某人的註冊信箱，就能無限次觸發寄信到那個信箱 —— 收件人被
// 灌爆，而寄件方（本站的 SMTP 帳號）會因為大量發信被判定為濫用，連帶讓真正的
// 驗證信進垃圾桶。這是一個「用別人的信箱當受害者」的攻擊，不是自傷。
//
// 以 IP 計量：這兩個端點在呼叫時都還沒有身分。額度取 15 分鐘 5 次 —— 正常使用
// 者一次就夠，重試兩三次已是極限；5 次留給誤觸與同一個 NAT 後面的多位訪客。
const emailDispatchLimiter = rateLimit({
  ...commonOptions,
  store: makeStore(),
  windowMs: 15 * 60 * 1000,
  limit: 5,
});

// POST /auth/register 先前也沒有限流。它同樣會寄出一封驗證信，而且每一次成功
// 呼叫都在 users 表留下一列。額度比寄信端點再寬一點（同一個 NAT 後面可能有多位
// 訪客同時註冊），但仍遠低於腳本化註冊所需的量。
const registerLimiter = rateLimit({
  ...commonOptions,
  store: makeStore(),
  windowMs: 60 * 60 * 1000,
  limit: 10,
});

// POST /auth/reset-password 帶著一個 token 換新密碼。token 是 crypto.randomUUID()
// （122 bits），暴力猜測不可行，因此這道限流不是為了擋猜測，而是為了讓「拿著
// 一堆猜測值連續打」這件事本身有成本，並與其他端點的處置保持一致。
const passwordResetLimiter = rateLimit({
  ...commonOptions,
  store: makeStore(),
  windowMs: 15 * 60 * 1000,
  limit: 10,
});

// POST /api/leaderboard 先前沒有任何限流，而它是一個免登入、每次呼叫都在
// leaderboard 表插入一列的端點。驗證擋得住不合理的分數與暱稱，擋不住
// 「合法但無限多」的寫入 —— 資料庫是 Neon，儲存與運算都計費。
// 額度取每分鐘 20 次：一局遊戲結束才送一次，真人遠達不到。
const leaderboardLimiter = rateLimit({
  ...commonOptions,
  store: makeStore(),
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: aiOrIpKeyGenerator,
});

module.exports = { _resetAllLimitersForTests, loginLimiter, aiLimiter, ttsLimiter, commentsLimiter, syncLimiter, bossLimiter, reactionsLimiter, emailDispatchLimiter, registerLimiter, passwordResetLimiter, leaderboardLimiter };
