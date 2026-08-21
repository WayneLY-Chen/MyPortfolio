import { describe, it, expect, vi } from 'vitest';

vi.mock('../db');

import {
  CONTENT_MAX_CHARS,
  AUTHOR_NAME_MAX_LEN,
  DEFAULT_AUTHOR_NAME,
  ALLOWED_TARGET_TYPES,
  isAllowedTargetType,
  isValidTargetId,
  isValidCommentContent,
  normalizeAuthorName,
} from './commentValidation.js';

describe('target 白名單（與 reactionValidation 共用同一份）', () => {
  it('行為與 reactionValidation 的那一份一致', async () => {
    // 刻意不比對函式身分（=== ）：commentValidation.js 是 CommonJS，內部以
    // require 取得 reactionValidation，而測試檔的 import 走 Vite 的 SSR 模組圖，
    // 兩條路徑拿到不同的函式物件，即使原始碼確實只有一份。改為驗證行為等價。
    const reactions = await import('./reactionValidation.js');
    for (const input of ['blog', 'project', 'comment', 'nope', '', null, 123, '__proto__']) {
      expect(
        isAllowedTargetType(input),
        `target_type ${JSON.stringify(input)} 的判斷與 reactionValidation 不一致`
      ).toBe(reactions.isAllowedTargetType(input));
    }
    expect(ALLOWED_TARGET_TYPES).toEqual(reactions.ALLOWED_TARGET_TYPES);
  });

  it('前端實際使用的三種目標都通過', () => {
    // Blog.jsx 送 'blog'、Projects.jsx 送 'project'、Reactions.jsx 送 'comment'
    expect(isAllowedTargetType('blog')).toBe(true);
    expect(isAllowedTargetType('project')).toBe(true);
    expect(isAllowedTargetType('comment')).toBe(true);
  });

  it('任意字串被拒 —— 實測修補前可以用任意 target_type 寫進資料庫', () => {
    expect(isAllowedTargetType('任意亂編的類型')).toBe(false);
    expect(isAllowedTargetType('')).toBe(false);
    expect(isAllowedTargetType(undefined)).toBe(false);
  });

  it('target_id 接受字串與數字（Projects 送的是 github_id 或 name）', () => {
    expect(isValidTargetId('abc-123')).toBe(true);
    expect(isValidTargetId(1029384756)).toBe(true);
  });

  it('過長或空的 target_id 被拒 —— 實測修補前 500 字的 id 可以寫進資料庫', () => {
    expect(isValidTargetId('x'.repeat(255))).toBe(true);
    expect(isValidTargetId('x'.repeat(256))).toBe(false);
    expect(isValidTargetId('')).toBe(false);
    expect(isValidTargetId(null)).toBe(false);
    expect(isValidTargetId({})).toBe(false);
  });
});

describe('isValidCommentContent', () => {
  it('一般留言通過', () => {
    expect(isValidCommentContent('這篇寫得很好')).toBe(true);
  });

  // 修補前的檢查是 `!content?.trim()`，這幾個值會直接拋 TypeError，
  // 而那一行在 try 區塊之外 —— 在 asyncGuard 補上之前是可讓行程中止的輸入。
  it('非字串被拒 —— 這幾個值原本會拋 TypeError', () => {
    expect(isValidCommentContent(12345)).toBe(false);
    expect(isValidCommentContent(['a'])).toBe(false);
    expect(isValidCommentContent({ a: 1 })).toBe(false);
    expect(isValidCommentContent(true)).toBe(false);
  });

  it('缺少或只有空白被拒', () => {
    expect(isValidCommentContent(undefined)).toBe(false);
    expect(isValidCommentContent(null)).toBe(false);
    expect(isValidCommentContent('')).toBe(false);
    expect(isValidCommentContent('    ')).toBe(false);
  });

  it('長度以 trim 之後為準 —— 修補前是用未 trim 的長度比對、卻寫入 trim 過的值', () => {
    expect(isValidCommentContent('x'.repeat(CONTENT_MAX_CHARS))).toBe(true);
    expect(isValidCommentContent('x'.repeat(CONTENT_MAX_CHARS + 1))).toBe(false);
    // 前後空白讓未 trim 的長度超標，但實際內容沒有
    expect(isValidCommentContent('  ' + 'x'.repeat(CONTENT_MAX_CHARS) + '  ')).toBe(true);
  });
});

describe('normalizeAuthorName', () => {
  it('一般名稱去空白後保留', () => {
    expect(normalizeAuthorName('  小明  ')).toBe('小明');
  });

  it('超長名稱被截斷', () => {
    expect(normalizeAuthorName('N'.repeat(1000)).length).toBe(AUTHOR_NAME_MAX_LEN);
  });

  it('空值或非字串退回預設值，不會寫入 undefined', () => {
    expect(normalizeAuthorName(null)).toBe(DEFAULT_AUTHOR_NAME);
    expect(normalizeAuthorName(undefined)).toBe(DEFAULT_AUTHOR_NAME);
    expect(normalizeAuthorName('')).toBe(DEFAULT_AUTHOR_NAME);
    expect(normalizeAuthorName('   ')).toBe(DEFAULT_AUTHOR_NAME);
    expect(normalizeAuthorName(123)).toBe(DEFAULT_AUTHOR_NAME);
  });
});
