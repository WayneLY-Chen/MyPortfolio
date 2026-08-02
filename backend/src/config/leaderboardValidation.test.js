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
  NICKNAME_BLOCKLIST,
  ACCURACY_THRESHOLD,
  SCORE_CAP,
  isValidGameType,
  isTypingGameType,
  isValidNickname,
  isScoreWithinCap,
  isAccuracyAcceptable,
  containsBlockedTerm,
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

describe('D-35: 暱稱內容黑名單', () => {
  it('NICKNAME_BLOCKLIST 恰有 14 個元素，且每個元素都等於自身的 toLowerCase()', () => {
    expect(NICKNAME_BLOCKLIST.length).toBe(14);
    expect(NICKNAME_BLOCKLIST.every((term) => term === term.toLowerCase())).toBe(true);
  });

  it.each(NICKNAME_BLOCKLIST)('黑名單詞 %s → containsBlockedTerm 為 true', (term) => {
    expect(containsBlockedTerm(term)).toBe(true);
  });

  it.each(['xfuckx', '超級雞掰王'])(
    '嵌在較長暱稱裡的 %s → 仍為 true（子字串比對而非全等）',
    (name) => {
      expect(containsBlockedTerm(name)).toBe(true);
    }
  );

  // 偽陽性的迴歸網——本任務最重要的一組。未來任何人擴充黑名單時，這組
  // 測試就是煞車：只要有一個無辜名字被判定為 true，就代表清單真的會誤擋
  // 真實訪客，該回頭改清單而不是放寬這組斷言。
  it.each([
    'Yamashita',
    'shiitake',
    'Michelle',
    'Cassandra',
    'Hitchcock',
    'Dickinson',
    'Nigerian',
    'document',
    'Penistone',
    'fagotto',
    'Assassin',
    'cucumber',
    '三小時',
    '手機掰掰',
    '林北辰',
    '謝謝你老師',
    '能幹的人',
    '骨幹',
    '靠北方走',
    '機車王',
    '王小明_2026',
  ])('無辜名字迴歸網：%s → containsBlockedTerm 為 false', (name) => {
    expect(containsBlockedTerm(name)).toBe(false);
  });

  // 已知且已接受的偽陽性（決策 D）。看到這條測試而想「修好它」的人，
  // 請先讀 .planning/phases/03-typing-race/03-CONTEXT.md 的 D-35 再動手——
  // 這不是 bug，是 cunt 收進清單的已知代價。
  it('刻意接受的偽陽性：Scunthorpe → containsBlockedTerm 為 true（決策 D）', () => {
    expect(containsBlockedTerm('Scunthorpe')).toBe(true);
  });

  it.each(['FUCK', 'Fuck', 'fUcK', 'BITCH'])(
    '大小寫不敏感：%s → containsBlockedTerm 為 true',
    (name) => {
      expect(containsBlockedTerm(name)).toBe(true);
    }
  );

  // 刻意漏掉，不是缺陷（決策 E）。這是嚇阻而非保證——會打這些變體的人已經
  // 讀過規則並刻意規避，追他要付出真實使用者的代價（王小明_2026 這類合法
  // 底線暱稱就是代價的具體例子）。
  it.each(['f_u_c_k', 'fvck', 'fuuuck', 'sh1t'])(
    '刻意不做的正規化：%s → containsBlockedTerm 為 false（嚇阻而非保證）',
    (name) => {
      expect(containsBlockedTerm(name)).toBe(false);
    }
  );

  it.each([undefined, null, ''])(
    '型別與邊界：%s → containsBlockedTerm 為 false',
    (value) => {
      expect(containsBlockedTerm(value)).toBe(false);
    }
  );
});
