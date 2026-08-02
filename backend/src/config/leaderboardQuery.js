// backend/src/config/leaderboardQuery.js
//
// GET /api/leaderboard 的 SQL 建構邏輯，從 backend/src/routes/leaderboard.js 的
// GET handler 抽出。抽出的理由與 leaderboardValidation.js 相同：SQL 的形狀可以
// 用細粒度單元測試直接鎖定，不必每個斷言都跑一次完整 HTTP request。
//
// D-34（部分反轉 D-27）：D-27 原本決定「重複上榜不處理、不做同暱稱去重」，
// 理由之一是去重會改到 snake/2048 共用的 GET 查詢。這個顧慮本身是對的，但
// 解法不是「完全不做」，而是「同一端點內依 game_type 分岔，讓兩條路徑各自
// 獨立、其中一條逐字不變」。使用者上線後連玩兩場，打字榜上出現兩列「Wayne」
// （142 與 122），這是本次改動要消滅的視覺結果。
//
// 只作用於打字榜（typing_zh / typing_en）：舊遊戲（snake / 2048 與任何未來
// 新增的 game_type）一律走 LEGACY_SELECT，字串與改動前的 GET handler 逐字
//相同——這是本模組最高優先的不變式，leaderboardQuery.test.js 用 toBe 逐字
// 比對鎖定，routes/leaderboard.test.js 再從路由層追加一次迴歸測試。
//
// created_at ASC 是新加的同分 tie-break，刻意不外溢到 LEGACY_SELECT：
// 現行舊遊戲查詢只有 ORDER BY score DESC，同分時 Postgres 回傳順序不保證；
// 這是既有行為，本次不改。打字榜補上 created_at ASC 代表「同分者先達到的
// 排前面」，同時讓 DISTINCT ON (player_name) 在同一玩家多筆同分紀錄時，
// 固定取最早那一筆，避免畫面上的 created_at 每次查詢都跳動。
//
// 大小寫：刻意區分大小寫，'Wayne' 與 'wayne' 視為兩個不同玩家。理由：
// POST handler 儲存暱稱時不做任何大小寫正規化，若 GET 用 LOWER() 比對，
// 寫入端與讀取端對「誰是同一個人」的定義就會不一致。這個選擇可逆——
// 日後要改成不分大小寫，只需把 DISTINCT ON 的鍵從 player_name 換成
// LOWER(player_name)，一行的事，且不涉及既有資料。
//
// 索引：不加新索引（零 schema 變更）。既有索引 idx_leaderboard_game
// (game_type, score DESC) 服務 WHERE 過濾，但服務不了 DISTINCT ON 需要的
// player_name 排序，Postgres 會多一次 Sort → Unique → Sort → Limit。這在
// 本表規模（單一 game_type 至多數千列的個人作品集流量）下遠在毫秒以下，
// 真正需要重新評估的門檻大約在單一 game_type 十萬列以上，屆時該補的是
// 上傳頻率限制（D-27 已指向 Phase 2 REL-06），不是索引。
const { isTypingGameType } = require('./leaderboardValidation');

// 舊遊戲（snake / 2048 及任何未在 typing 白名單內的 game_type）用，逐字沿用
// 改動前 backend/src/routes/leaderboard.js 第 19 行的查詢——一個字都不能改。
const LEGACY_SELECT =
  'SELECT player_name, score, created_at FROM leaderboard WHERE game_type = $1 ORDER BY score DESC LIMIT $2';

// 打字榜（typing_zh / typing_en）用。內層 DISTINCT ON (player_name) 取出每位
// 玩家的最佳列：先依 player_name 分組、組內依 score DESC, created_at ASC
// 排序後取每組第一筆（最高分；同分取最早的那一筆）。外層再依
// score DESC, created_at ASC 排出最終名次並套用 LIMIT。
const TYPING_BEST_SELECT = `
  SELECT player_name, score, created_at FROM (
    SELECT DISTINCT ON (player_name) player_name, score, created_at
    FROM leaderboard
    WHERE game_type = $1
    ORDER BY player_name, score DESC, created_at ASC
  ) AS best_per_player
  ORDER BY score DESC, created_at ASC
  LIMIT $2
`;

// 唯一的分岔點：是否為打字榜。不在本檔重列 typing 類型清單，改用
// leaderboardValidation.js 既有的 isTypingGameType()——兩份清單會日後走鐘。
const buildLeaderboardSelect = (gameType) => {
  return isTypingGameType(gameType) ? TYPING_BEST_SELECT : LEGACY_SELECT;
};

module.exports = {
  LEGACY_SELECT,
  TYPING_BEST_SELECT,
  buildLeaderboardSelect,
};
