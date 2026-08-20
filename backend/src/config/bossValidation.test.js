import { describe, it, expect, vi } from 'vitest';

// 與 leaderboardValidation.test.js / localVerify.test.js 相同的排序規則：
// 必須在 import 任何（間接）require '../db' 的模組之前。本模組自身不使用
// query，但同目錄其他模組會，依既有慣例保守地先 mock。
vi.mock('../db');

import {
  MAX_HIT,
  MAX_TRACKED_PLAYERS,
  DEFAULT_PLAYER_NAME,
  normalizeDamage,
  normalizePlayerName,
  recordDamage,
} from './bossValidation.js';

const NUL = String.fromCharCode(0);

describe('normalizeDamage', () => {
  it('合法整數原樣通過', () => {
    expect(normalizeDamage(15)).toBe(15);
    expect(normalizeDamage(90)).toBe(90);
  });

  it('數字字串（前端經 JSON 傳來的常見形態）可接受', () => {
    expect(normalizeDamage('35')).toBe(35);
  });

  it('邊界值：0 與 MAX_HIT 通過，MAX_HIT + 1 被拒', () => {
    expect(normalizeDamage(0)).toBe(0);
    expect(normalizeDamage(MAX_HIT)).toBe(MAX_HIT);
    expect(normalizeDamage(MAX_HIT + 1)).toBeNull();
  });

  // 這幾則直接對應修補前可實際造成的後果，不是純理論邊界。
  it('非數字字串被拒 —— 修補前會讓 hp 變成 NaN 且永不復原', () => {
    expect(normalizeDamage('abc')).toBeNull();
  });

  it('物件與陣列被拒 —— 同樣是 NaN 來源', () => {
    expect(normalizeDamage({})).toBeNull();
    expect(normalizeDamage([])).toBeNull();
  });

  it('undefined 與 null 被拒', () => {
    expect(normalizeDamage(undefined)).toBeNull();
    expect(normalizeDamage(null)).toBeNull();
  });

  it('負數被拒 —— 修補前會讓 hp 不減反增並超過 max_hp', () => {
    expect(normalizeDamage(-50000)).toBeNull();
    expect(normalizeDamage(-1)).toBeNull();
  });

  it('超大值與科學記號字串被拒 —— 修補前可一擊必殺', () => {
    expect(normalizeDamage(999999999)).toBeNull();
    expect(normalizeDamage('1e999')).toBeNull();
    expect(normalizeDamage(Infinity)).toBeNull();
    expect(normalizeDamage(NaN)).toBeNull();
  });

  it('小數無條件捨去為整數', () => {
    expect(normalizeDamage(15.9)).toBe(15);
  });
});

describe('normalizePlayerName', () => {
  it('一般名稱原樣通過', () => {
    expect(normalizePlayerName('勇者小明')).toBe('勇者小明');
  });

  it('未提供時退回預設名稱，維持訪客免登入即可遊玩', () => {
    expect(normalizePlayerName(undefined)).toBe(DEFAULT_PLAYER_NAME);
    expect(normalizePlayerName(null)).toBe(DEFAULT_PLAYER_NAME);
  });

  it('只有空白時退回預設名稱', () => {
    expect(normalizePlayerName('   ')).toBe(DEFAULT_PLAYER_NAME);
  });

  it('移除 NUL 與其他控制字元', () => {
    expect(normalizePlayerName('ab' + NUL + 'cd')).toBe('abcd');
    expect(normalizePlayerName('a' + String.fromCharCode(27) + 'b')).toBe('ab');
  });

  it('超長名稱截斷到 20 字', () => {
    expect(normalizePlayerName('x'.repeat(100))).toHaveLength(20);
  });

  it('非字串輸入先轉字串再處理', () => {
    expect(normalizePlayerName(12345)).toBe('12345');
  });
});

describe('recordDamage', () => {
  const freshState = () => ({ kills: [] });

  it('新玩家會被加入排行', () => {
    const s = freshState();
    recordDamage(s, '甲', 30);
    expect(s.kills).toEqual([{ player_name: '甲', total_damage: 30 }]);
  });

  it('既有玩家累加傷害', () => {
    const s = freshState();
    recordDamage(s, '甲', 30);
    recordDamage(s, '甲', 20);
    expect(s.kills).toEqual([{ player_name: '甲', total_damage: 50 }]);
  });

  it('依總傷害由高到低排序', () => {
    const s = freshState();
    recordDamage(s, '甲', 10);
    recordDamage(s, '乙', 90);
    expect(s.kills.map((k) => k.player_name)).toEqual(['乙', '甲']);
  });

  it('新面孔在榜滿後被丟棄 —— 修補前可用不重複名字撐爆記憶體', () => {
    const s = freshState();
    for (let i = 0; i < MAX_TRACKED_PLAYERS + 50; i++) {
      recordDamage(s, `玩家${i}`, 1);
    }
    expect(s.kills).toHaveLength(MAX_TRACKED_PLAYERS);
  });

  it('榜滿之後，已在榜上的玩家仍可繼續累加', () => {
    const s = freshState();
    for (let i = 0; i < MAX_TRACKED_PLAYERS; i++) {
      recordDamage(s, `玩家${i}`, 1);
    }
    recordDamage(s, '玩家0', 99);
    expect(s.kills).toHaveLength(MAX_TRACKED_PLAYERS);
    expect(s.kills[0]).toEqual({ player_name: '玩家0', total_damage: 100 });
  });
});
