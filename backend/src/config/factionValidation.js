// backend/src/config/factionValidation.js
//
// 陣營大戰（faction）的輸入驗證。沿用本專案既有慣例（bossValidation.js /
// leaderboardValidation.js）：socket 層只負責接收與廣播，驗證規則集中在
// config/ 下的獨立模組，好對每個邊界值寫細粒度單元測試。
//
// 這三個 handler 先前完全沒有驗證，實測（vitest + 真實 socket.io-client）
// 確認的後果：
//
//   faction_move 送 index = "length"
//     → factionState.grid["length"] = "#3b82f6"
//     → RangeError: Invalid array length
//     → socket.io 不攔截 handler 內的同步例外 → uncaughtException
//     → 真實伺服器沒有 uncaughtException handler，Node 預設中止行程。
//       一個未登入的訪客送一個字串就能讓後端整個掛掉。
//
//   faction_move 送 index = 3000000
//     → grid 從 100 格膨脹到 3,000,001 格，而 handler 每次都把「整份 grid」
//       透過 io.emit('grid_update') 廣播給所有連線
//     → 一次幾十位元組的 emit 換來每位連線者一份數 MB 的 JSON。狀態是常駐
//       單例，膨脹後不會自己縮回去，之後每一次正常落子都繼續付這個代價。
//
//   join_faction / boss_join 送 20 萬字的名字
//     → 原樣存進常駐的 players 物件，並廣播給所有人（同一組放大效果）。
//
// 名字的正規化直接沿用 bossValidation.normalizePlayerName，不另外寫一份：
// 兩個遊戲的暱稱來自前端同一個輸入框，規則沒有理由不同，而本專案已經吃過
// 四次「同樣的邏輯抄兩份、只修一邊」的虧（Boss REST/Socket、兩套 reactions、
// 兩份 markdown code 渲染、同一檔案內的 TTS_RATE_WHITELIST 與 modeInstructions）。

const { normalizePlayerName } = require('./bossValidation');

// 棋盤格數，必須與 sockets/gameState.js 的 `Array(100).fill('')` 一致。
// 前端 FunPage.jsx 的格子也是 10x10。
const GRID_SIZE = 100;

// 允許的陣營。原本的寫法是 `player.team === 'blue' ? 藍 : 橘`，任何非 'blue'
// 的字串（包含攻擊者自訂的值）都會被當成橘隊，而那個值同時被原樣廣播給所有
// 前端。改成白名單後，不在清單上的一律視為尚未選邊。
const TEAMS = ['blue', 'orange'];

// 每支隊伍的顏色。原本寫死在 handler 裡，一併收攏過來，讓「合法隊伍」與
// 「該用什麼顏色」只有一個定義來源。
const TEAM_COLORS = new Map([
  ['blue', '#3b82f6'],
  ['orange', '#f97316'],
]);

/**
 * 落子位置是否合法。
 *
 * 刻意使用 Number.isInteger 而不是 `typeof index === 'number'`：
 *   - 字串 "5"  → 拒絕（JSON 送得出來，且會走上 obj["5"] 的路徑）
 *   - 字串 "length" → 拒絕（這條是造成行程中止的那一個）
 *   - 5.5   → 拒絕（會建立一個非陣列索引的屬性，grid 從此不再是密集陣列）
 *   - -1    → 拒絕（同上，且前端拿不到對應格子，狀態直接對不起來）
 *   - NaN / Infinity → 拒絕（Number.isInteger 對兩者皆為 false）
 *
 * @param {unknown} index
 * @returns {boolean}
 */
const isValidGridIndex = (index) =>
  Number.isInteger(index) && index >= 0 && index < GRID_SIZE;

/**
 * 把請求端送來的隊伍值收斂成合法值。
 *
 * @param {unknown} raw
 * @returns {string|null} 不在白名單上一律回 null（＝尚未選邊）
 */
const normalizeTeam = (raw) => (TEAMS.includes(raw) ? raw : null);

/**
 * 取得隊伍顏色。傳入非法隊伍時回 null —— 呼叫端應該在這之前就擋掉，
 * 這裡回 null 是為了不讓非法值悄悄取得一個預設顏色。
 *
 * @param {unknown} team
 * @returns {string|null}
 */
const teamColor = (team) => TEAM_COLORS.get(team) ?? null;

module.exports = {
  GRID_SIZE,
  TEAMS,
  isValidGridIndex,
  normalizeTeam,
  teamColor,
  // 轉出去讓 sockets/index.js 只需要 import 這一個模組，同時明確標示
  // 「這是共用的那一份，不是新抄的一份」。
  normalizePlayerName,
};
