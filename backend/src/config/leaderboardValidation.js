// backend/src/config/leaderboardValidation.js
//
// POST /api/leaderboard 的驗證邏輯，從 backend/src/routes/leaderboard.js 的
// POST handler 抽出。抽出的理由：可以對每個邊界值（暱稱長度 1/12/13、emoji、
// 控制字元、空白、換行；分數上限邊界值；正確率門檻邊界值）各自寫細粒度單元
// 測試，而不必每個案例都跑一次完整的 HTTP request——路由層測試
// （backend/src/routes/leaderboard.test.js）只負責證明「route 有正確呼叫這些
// 函式並回對的 HTTP 狀態碼」，不重複測同一組邊界值。這與 Phase 2 把
// LocalStrategy 驗證邏輯搬到 backend/src/config/localVerify.js、把 OAuth
// email 驗證邏輯搬到 backend/src/config/oauthEmailVerification.js 是同一種
// 「路由層驗證邏輯抽成獨立 config 模組」的既有慣例。
//
// 跨端常數同步提醒（03-RESEARCH.md Pitfall 3）：本檔的 ACCURACY_THRESHOLD 與
// SCORE_CAP 在 frontend/src/components/typing-race/typingEngine.js 有意義對應
// 的常數（該檔命名為 ACCURACY_THRESHOLD 與 SPEED_CAP——名稱 SPEED_CAP 是
// 03-01 tracer 既有命名，本檔沿用 03-02-PLAN.md 指定的 SCORE_CAP 名稱，兩邊
// 名稱不同但數值定義必須相同）。專案沒有 monorepo/workspace 機制，
// frontend/ 與 backend/ 是完全獨立的兩個 npm 套件，這些數值必須在兩邊分別
// 維護各一份。修改本檔的 ACCURACY_THRESHOLD 或 SCORE_CAP 時，務必同步修改
// frontend/src/components/typing-race/typingEngine.js 的對應常數，否則會出現
// 「前端顯示可以上傳，後端卻 400 拒絕」或反過來的不一致。

// D-24：白名單恰好為這四個值。完整盤點依據：對整個 repo 做 grep 後確認
// POST /api/leaderboard 只有兩個既有呼叫端，分別在 frontend/src/pages/FunPage.jsx
// 送出 'snake' 與 '2048'（尾刀爭奪戰、陣營大戰分別寫入 boss_kill_log 與
// faction_results 兩張表，從不經過這個端點）。裸值 'typing'（不帶 _zh/_en 後綴）
// 刻意不在名單內——D-21 已把它細化成 typing_zh / typing_en 兩個獨立榜。
const GAME_TYPE_ALLOWLIST = ['snake', '2048', 'typing_zh', 'typing_en'];

// D-21：僅這兩個值需要 typing 專屬的嚴格驗證（暱稱字元白名單、分數上限、
// 正確率門檻）；snake 與 2048 維持既有寬鬆行為不變。
const TYPING_GAME_TYPES = ['typing_zh', 'typing_en'];

// D-23：暱稱長度 1–12 字，只允許中文（CJK 基本區 一–龥）、英數字、底線。
//
// 錨定注意事項：JavaScript 的 `$` 在沒有 `m` 旗標時仍會匹配字串結尾的換行符
// （例如 'abc\n' 對 /^abc$/ 會判定為 true），因此若字元類別本身沒有排除掉
// 換行字元，形如「合法暱稱後面接一個 \n」的輸入可能意外通過驗證。這裡的字元
// 類別 [一-鿿A-Za-z0-9_] 本身就不包含 \n（換行不落在這個字元類別裡），所以
// 換行字元無法被 {1,12} 這個量詞吃掉——若輸入是 'abc\n'，量詞只能匹配到
// 'abc'，剩下的 '\n' 会落在 $ 之前但字元類別比對失敗，整體 test() 回傳
// false。leaderboardValidation.test.js 有專門的測試案例鎖定這個行為。
const NICKNAME_STRICT_RE = /^[一-鿿A-Za-z0-9_]{1,12}$/;

// D-20/D-25：正確率門檻。未達此值不得上榜（伺服器端最終把關；前端的事前
// 灰化按鈕屬 03-04 範圍，兩層都要有但本檔只負責後端這一層）。
const ACCURACY_THRESHOLD = 90;

// D-22/D-29：「不可能的分數」硬上限，中文用「字/分」原始值口徑（不除以 5）、
// 英文用標準 WPM 口徑（除以 5）。兩個數字皆為使用者在 D-22 明確拍板、並在
// D-29 覆核中文計算公式後維持不變的數值——不是本檔推導出來的，改動前請先
// 確認決策是否已變更。
const SCORE_CAP = { typing_zh: 150, typing_en: 250 };

// 回傳單純布林值——呼叫端是普通 Express route handler，不是 Passport
// strategy，不套用 done(err, user, info) 三參數回呼模式（對照
// backend/src/config/oauthEmailVerification.js 的 isProviderEmailVerified
// 簽章風格，而非 localVerify.js 的 verifyLocalCredentials）。

const isValidGameType = (gameType) => GAME_TYPE_ALLOWLIST.includes(gameType);

const isTypingGameType = (gameType) => TYPING_GAME_TYPES.includes(gameType);

// 只做正規表達式比對，呼叫端負責先 trim。這個函式只在 typing 類型被呼叫，
// 舊遊戲（snake/2048）不走它，維持既有的 trim + 截斷 20 字寬鬆規則不變
// （D-24 明確不做的部分）。
const isValidNickname = (playerName) => {
  if (typeof playerName !== 'string') return false;
  return NICKNAME_STRICT_RE.test(playerName);
};

// 非 typing 類型一律回 true——舊遊戲沒有分數上限，維持既有行為不變。
const isScoreWithinCap = (gameType, score) => {
  if (!isTypingGameType(gameType)) return true;
  return score <= SCORE_CAP[gameType];
};

// 先 parseFloat，NaN 或小於門檻皆回 false（缺漏欄位傳進來是 undefined，
// parseFloat(undefined) 為 NaN，同一分支處理，不需要額外的 undefined 檢查）。
const isAccuracyAcceptable = (accuracy) => {
  const parsed = parseFloat(accuracy);
  if (isNaN(parsed)) return false;
  return parsed >= ACCURACY_THRESHOLD;
};

module.exports = {
  GAME_TYPE_ALLOWLIST,
  TYPING_GAME_TYPES,
  NICKNAME_STRICT_RE,
  ACCURACY_THRESHOLD,
  SCORE_CAP,
  isValidGameType,
  isTypingGameType,
  isValidNickname,
  isScoreWithinCap,
  isAccuracyAcceptable,
};
