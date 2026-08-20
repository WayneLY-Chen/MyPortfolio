// backend/src/config/bossValidation.js
//
// 尾刀爭奪戰（Boss 戰）的輸入驗證與傷害記錄邏輯，從 backend/src/routes/boss.js
// 的 POST /attack handler 與 backend/src/sockets/index.js 的 boss_attack handler
// 一起抽出。沿用本專案既有慣例（leaderboardValidation.js / localVerify.js /
// oauthEmailVerification.js）：路由層與 socket 層只負責接收與回應，驗證規則
// 集中在 config/ 下的獨立模組，好對每個邊界值寫細粒度單元測試。
//
// 抽出的關鍵理由（不只是為了測試方便）：這兩條路徑先前各自維護一份「同樣沒有
// 驗證」的攻擊邏輯，前端實際走的是 socket 那條，REST 只是備援。只修其中一邊
// 等於沒修。共用同一組函式後，規則只有一份，不會再出現一邊擋住、另一邊放行的
// 情況。

// 傷害上限。前端 FunPage.jsx 的卡牌 power 最大值為 90（c15 炎爆火隕），
// 這裡取 100 留下餘裕，讓日後新增卡牌不必立刻同步改這個常數，同時仍能擋掉
// 「一擊把 10000 HP 打完」的偽造請求。
//
// 跨端常數同步提醒：卡牌 power 定義在
// frontend/src/components/... 之外的 frontend/src/pages/FunPage.jsx 內。
// 若日後新增 power 超過 100 的卡牌，必須同步調高這裡，否則合法玩家會被擋。
const MAX_HIT = 100;

// 暱稱長度上限，與 leaderboardValidation.js 的舊遊戲寬鬆規則（trim + 截斷
// 20 字）保持一致 —— 尾刀戰的暱稱與排行榜的暱稱是同一個輸入框來源。
const MAX_PLAYER_NAME_LEN = 20;

// bossState.kills 追蹤的玩家數上限。這個陣列原本沒有任何上限：每出現一個
// 沒見過的 player_name 就 push 一筆，而 player_name 完全由請求端控制，
// 因此送出大量不重複名字即可讓它無限成長，撐爆伺服器記憶體（bossState 是
// 常駐在記憶體的單例，不會隨請求結束釋放）。200 筆遠超過這個功能實際會有的
// 同時參戰人數，對正常遊玩不構成影響。
const MAX_TRACKED_PLAYERS = 200;

const DEFAULT_PLAYER_NAME = '勇者';

/**
 * 把請求端送來的 damage 正規化成一個可安全參與算術的數字。
 *
 * 為什麼不能直接用原值做 bossState.hp - damage：
 *   - 'abc' / {} / undefined  → 相減得 NaN，而 Math.max(0, NaN) 仍是 NaN。
 *     bossState.hp 一旦變成 NaN 就永遠回不來（NaN - 任何數 = NaN），
 *     is_alive 也永遠不會轉成 false，整個功能壞掉直到伺服器重啟。
 *     單一請求即可造成，不需要任何權限。
 *   - 負數 → hp 不減反增，可超過 max_hp。
 *   - 999999999 或 '1e999' → 一擊必殺，killed_by 可填任意名字。
 *
 * @param {unknown} raw 請求端提供的 damage
 * @returns {number|null} 合法時回傳 0..MAX_HIT 的整數，不合法時回傳 null
 */
const normalizeDamage = (raw) => {
  // Number(null) 是 0、Number([]) 也是 0，這類「看起來像空值」的輸入一律
  // 視為不合法而非當成 0 攻擊，避免靜默吞掉明顯有問題的請求。
  if (raw === null || raw === undefined || typeof raw === 'object') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > MAX_HIT) return null;
  return Math.floor(n);
};

/**
 * 把請求端送來的 player_name 正規化成可安全存進記憶體與資料庫的字串。
 * 未提供時退回預設名稱，維持「訪客免登入即可遊玩」的既有行為。
 *
 * @param {unknown} raw
 * @returns {string} 長度 1..MAX_PLAYER_NAME_LEN 的字串
 */
const normalizePlayerName = (raw) => {
  if (raw === null || raw === undefined) return DEFAULT_PLAYER_NAME;
  // 逐字元過濾掉 C0/C1 控制字元（含 NUL）——它們會被寫進 boss_kill_log，
  // 也會被廣播到所有連線的前端。刻意不用正規表示式字面量：控制字元的跳脫
  // 序列在經手的工具鏈中容易被還原成真正的控制字元寫進檔案，改用碼位比較。
  const cleaned = Array.from(String(raw))
    .filter((ch) => {
      const c = ch.codePointAt(0);
      return c > 31 && c !== 127 && !(c >= 128 && c <= 159);
    })
    .join('')
    .trim();
  if (cleaned.length === 0) return DEFAULT_PLAYER_NAME;
  return cleaned.slice(0, MAX_PLAYER_NAME_LEN);
};

/**
 * 把一次攻擊記進傷害排行，並維持陣列有上限。
 *
 * 已在榜上的玩家一律可以累加（不受 MAX_TRACKED_PLAYERS 影響）；只有「新面孔
 * 且榜已滿」的情況會被丟棄。這個取捨讓額度用完後真正在玩的人不受影響，
 * 被擋掉的只有灌名字的那一方。
 *
 * @param {{kills: Array<{player_name: string, total_damage: number}>}} bossState
 * @param {string} playerName 已經過 normalizePlayerName 的名字
 * @param {number} damage 已經過 normalizeDamage 的傷害
 */
const recordDamage = (bossState, playerName, damage) => {
  const existing = bossState.kills.find((k) => k.player_name === playerName);
  if (existing) {
    existing.total_damage += damage;
  } else {
    if (bossState.kills.length >= MAX_TRACKED_PLAYERS) return;
    bossState.kills.push({ player_name: playerName, total_damage: damage });
  }
  bossState.kills.sort((a, b) => b.total_damage - a.total_damage);
};

module.exports = {
  MAX_HIT,
  MAX_PLAYER_NAME_LEN,
  MAX_TRACKED_PLAYERS,
  DEFAULT_PLAYER_NAME,
  normalizeDamage,
  normalizePlayerName,
  recordDamage,
};
