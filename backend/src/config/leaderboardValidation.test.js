import { describe, it, expect, vi } from 'vitest';

// Must be the first statement, before importing anything that (transitively)
// requires '../db' — same ordering rule as localVerify.test.js. This module
// does not itself use `query`, but other modules in the same directory do;
// mocking here first is the conservative default per the existing convention.
vi.mock('../db');

import {
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
} from './leaderboardValidation.js';

describe('D-24: GAME_TYPE_ALLOWLIST 與 isValidGameType', () => {
  it('allowlist 恰好有 4 個值', () => {
    expect(GAME_TYPE_ALLOWLIST.length).toBe(4);
    expect([...GAME_TYPE_ALLOWLIST].sort()).toEqual(['2048', 'snake', 'typing_en', 'typing_zh']);
  });

  it.each(['snake', '2048', 'typing_zh', 'typing_en'])('isValidGameType(%s) 為 true', (gameType) => {
    expect(isValidGameType(gameType)).toBe(true);
  });

  it.each(['not-a-real-game', '', undefined, 'typing'])('isValidGameType(%s) 為 false', (gameType) => {
    expect(isValidGameType(gameType)).toBe(false);
  });

  it("裸值 'typing' 不在白名單內（D-21 已細化為 typing_zh/typing_en 兩榜）", () => {
    expect(isValidGameType('typing')).toBe(false);
  });
});

describe('D-21: TYPING_GAME_TYPES 與 isTypingGameType', () => {
  it.each(['typing_zh', 'typing_en'])('isTypingGameType(%s) 為 true', (gameType) => {
    expect(isTypingGameType(gameType)).toBe(true);
  });

  it.each(['snake', '2048'])('isTypingGameType(%s) 為 false', (gameType) => {
    expect(isTypingGameType(gameType)).toBe(false);
  });

  it('TYPING_GAME_TYPES 恰為兩個值', () => {
    expect(TYPING_GAME_TYPES).toEqual(['typing_zh', 'typing_en']);
  });
});

describe('D-23: 暱稱長度與字元白名單', () => {
  it.each(['abc123_', '小明', '王小明_2026'])('isValidNickname(%s) 為 true', (name) => {
    expect(isValidNickname(name)).toBe(true);
  });

  it('空字串為 false（長度下限 1）', () => {
    expect(isValidNickname('')).toBe(false);
  });

  it('超過 12 字為 false', () => {
    expect(isValidNickname('一二三四五六七八九十十一十二十三')).toBe(false);
  });

  it('恰好 12 個字元組成的暱稱為 true（邊界值 12 通過）', () => {
    const twelveChars = '恰好十二個字元組成的暱稱';
    expect(twelveChars.length).toBe(12);
    expect(isValidNickname(twelveChars)).toBe(true);
  });

  it("含空白 'a b' 為 false（空白不在白名單）", () => {
    expect(isValidNickname('a b')).toBe(false);
  });

  it('含 emoji 為 false（emoji 被擋）', () => {
    expect(isValidNickname('hi🎉')).toBe(false); // hi + 🎉 (surrogate pair, written as escapes)
  });

  // 不可見字元一律用逸出序列建構，不在原始碼裡貼入不可見字元的字面——
  // 否則日後沒有人看得出這一行在測什麼。
  it('含定位字元 (\\t) 為 false', () => {
    expect(isValidNickname('abc\t')).toBe(false);
  });

  it('含零寬空格 (\\u200B) 為 false', () => {
    expect(isValidNickname('abc\u200B')).toBe(false);
  });

  it('含 NUL (\\u0000) 為 false', () => {
    expect(isValidNickname('abc\u0000')).toBe(false);
  });

  // JavaScript 的 $ 在無 m 旗標時仍會匹配字串結尾的換行——這條測試專門
  // 守住那個漏洞：字元類別本身不含 \n，所以量詞吃不到換行，test() 必須是 false。
  it("結尾帶換行 'abc\\n' 為 false（$ 在無 m 旗標下仍匹配結尾換行的已知陷阱）", () => {
    expect(isValidNickname('abc\n')).toBe(false);
  });

  it('非字串輸入（例如 undefined）為 false', () => {
    expect(isValidNickname(undefined)).toBe(false);
  });

  it('NICKNAME_STRICT_RE 本身對這批案例的直接比對結果與 isValidNickname 一致', () => {
    expect(NICKNAME_STRICT_RE.test('abc123_')).toBe(true);
    expect(NICKNAME_STRICT_RE.test('hi🎉')).toBe(false);
  });
});

describe('D-22/D-29: SCORE_CAP 與 isScoreWithinCap', () => {
  it('SCORE_CAP 的數值符合 D-22/D-29 拍板結果', () => {
    expect(SCORE_CAP.typing_zh).toBe(150);
    expect(SCORE_CAP.typing_en).toBe(250);
  });

  it('typing_zh: 150 通過、151 拒絕', () => {
    expect(isScoreWithinCap('typing_zh', 150)).toBe(true);
    expect(isScoreWithinCap('typing_zh', 151)).toBe(false);
  });

  it('typing_en: 250 通過、251 拒絕', () => {
    expect(isScoreWithinCap('typing_en', 250)).toBe(true);
    expect(isScoreWithinCap('typing_en', 251)).toBe(false);
  });

  it('非 typing 類型一律回 true（舊遊戲沒有上限，維持既有行為）', () => {
    expect(isScoreWithinCap('snake', 999999)).toBe(true);
    expect(isScoreWithinCap('2048', 999999)).toBe(true);
  });
});

describe('D-20/D-25: ACCURACY_THRESHOLD 與 isAccuracyAcceptable', () => {
  it('ACCURACY_THRESHOLD 為 90', () => {
    expect(ACCURACY_THRESHOLD).toBe(90);
  });

  it('90 為 true（邊界值本身通過）', () => {
    expect(isAccuracyAcceptable(90)).toBe(true);
  });

  it('89.9 為 false', () => {
    expect(isAccuracyAcceptable(89.9)).toBe(false);
  });

  it('undefined 為 false（缺漏欄位）', () => {
    expect(isAccuracyAcceptable(undefined)).toBe(false);
  });

  it("'abc' 為 false（非數字）", () => {
    expect(isAccuracyAcceptable('abc')).toBe(false);
  });
});
