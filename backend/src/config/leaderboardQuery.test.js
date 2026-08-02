import { describe, it, expect, vi } from 'vitest';

// Must be the first statement, before importing anything that (transitively)
// requires '../db' — same ordering rule as leaderboardValidation.test.js. This
// module does not itself use `query`, but keeping the convention consistent
// across every file in this directory is the conservative default.
vi.mock('../db');

import {
  LEGACY_SELECT,
  TYPING_BEST_SELECT,
  buildLeaderboardSelect,
} from './leaderboardQuery.js';

// 改動前 backend/src/routes/leaderboard.js 第 19 行的原始查詢字串，逐字抄錄
// 於此作為比對基準——不從實作檔匯入常數再拿來比對自己（那樣任何一次意外改動
// 都會通過測試），而是直接寫死本測試檔案獨立掌握的「舊行為」定義。
const ORIGINAL_ROUTE_SQL =
  'SELECT player_name, score, created_at FROM leaderboard WHERE game_type = $1 ORDER BY score DESC LIMIT $2';

describe('D-34: buildLeaderboardSelect 依 game_type 分岔', () => {
  it("buildLeaderboardSelect('typing_zh') 含 DISTINCT ON (player_name)", () => {
    expect(buildLeaderboardSelect('typing_zh')).toContain('DISTINCT ON (player_name)');
  });

  it("buildLeaderboardSelect('typing_en') 含 DISTINCT ON (player_name)", () => {
    expect(buildLeaderboardSelect('typing_en')).toContain('DISTINCT ON (player_name)');
  });

  it('typing 的 SQL 內層排序含 player_name, score DESC, created_at ASC（同分同玩家取最早那一筆）', () => {
    expect(TYPING_BEST_SELECT).toMatch(/player_name,\s*score DESC,\s*created_at ASC/);
  });

  it('typing 的 SQL 外層排序含 score DESC, created_at ASC（同分先達到者在前）', () => {
    // 內層 ORDER BY 已在上一條測試鎖定，這裡改用出現次數確認「外層」另有一組
    // score DESC, created_at ASC——DISTINCT ON 查詢的合法寫法是
    // 外層再包一層 SELECT * FROM (...) ORDER BY，因此排序字樣會出現兩次。
    const occurrences = TYPING_BEST_SELECT.match(/score DESC,\s*created_at ASC/g) || [];
    expect(occurrences.length).toBe(2);
  });

  it('typing 的 SQL 不含 LOWER( 也不含 UPPER(（鎖住區分大小寫這個選擇）', () => {
    expect(TYPING_BEST_SELECT).not.toContain('LOWER(');
    expect(TYPING_BEST_SELECT).not.toContain('UPPER(');
  });

  it("buildLeaderboardSelect('snake') 與改動前的原始查詢逐字相等", () => {
    expect(buildLeaderboardSelect('snake')).toBe(ORIGINAL_ROUTE_SQL);
  });

  it("buildLeaderboardSelect('2048') 與 buildLeaderboardSelect('snake') 相同", () => {
    expect(buildLeaderboardSelect('2048')).toBe(buildLeaderboardSelect('snake'));
  });

  it("buildLeaderboardSelect('faction')（不在白名單內）走舊路徑，與 'snake' 相同", () => {
    expect(buildLeaderboardSelect('faction')).toBe(buildLeaderboardSelect('snake'));
  });

  it('LEGACY_SELECT 本身與改動前的原始查詢逐字相等，且不含 DISTINCT', () => {
    expect(LEGACY_SELECT).toBe(ORIGINAL_ROUTE_SQL);
    expect(LEGACY_SELECT).not.toContain('DISTINCT');
  });

  it('兩條 SQL 都含 $1 與 $2，都不含字串串接進來的 game 值（T-quick-01）', () => {
    for (const sql of [LEGACY_SELECT, TYPING_BEST_SELECT]) {
      expect(sql).toContain('$1');
      expect(sql).toContain('$2');
      expect(sql).not.toContain('typing_zh');
      expect(sql).not.toContain('typing_en');
      expect(sql).not.toContain('snake');
    }
  });
});
