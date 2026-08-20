import { describe, it, expect, vi } from 'vitest';

// 與同目錄其他測試相同的排序規則：必須在 import 任何（間接）require '../db'
// 的模組之前。
vi.mock('../db');

import {
  ALLOWED_EMOJIS,
  MAX_TARGET_ID_LEN,
  isAllowedEmoji,
  isAllowedTargetType,
  isValidTargetId,
} from './reactionValidation.js';

describe('isAllowedEmoji', () => {
  it('白名單內的表情全部通過', () => {
    for (const e of ALLOWED_EMOJIS) {
      expect(isAllowedEmoji(e), `${e} 應該通過`).toBe(true);
    }
  });

  it('涵蓋前端兩份清單的聯集，任一頁的既有行為都不會壞', () => {
    // frontend/src/components/Reactions.jsx
    for (const e of ['👍', '❤️', '😂', '🔥', '🚀']) expect(isAllowedEmoji(e)).toBe(true);
    // frontend/src/pages/BlogPostPage.jsx（歷史清單）
    for (const e of ['👍', '❤️', '🔥', '🤔', '😮']) expect(isAllowedEmoji(e)).toBe(true);
  });

  it('任意字串被拒 —— emoji 欄位先前完全未驗證', () => {
    expect(isAllowedEmoji('hello')).toBe(false);
    expect(isAllowedEmoji('<img src=x onerror=alert(1)>')).toBe(false);
    expect(isAllowedEmoji('💩')).toBe(false);
    expect(isAllowedEmoji('')).toBe(false);
  });

  it('非字串型別被拒', () => {
    expect(isAllowedEmoji(null)).toBe(false);
    expect(isAllowedEmoji(undefined)).toBe(false);
    expect(isAllowedEmoji(123)).toBe(false);
    expect(isAllowedEmoji({})).toBe(false);
    expect(isAllowedEmoji(['👍'])).toBe(false);
  });
});

describe('isAllowedTargetType', () => {
  it('三種合法類型通過', () => {
    expect(isAllowedTargetType('comment')).toBe(true);
    expect(isAllowedTargetType('project')).toBe(true);
    expect(isAllowedTargetType('blog')).toBe(true);
  });

  it('不在名單內的類型被拒 —— 留一個類型不擋等於沒擋', () => {
    expect(isAllowedTargetType('user')).toBe(false);
    expect(isAllowedTargetType('BLOG')).toBe(false);
    expect(isAllowedTargetType('')).toBe(false);
    expect(isAllowedTargetType(null)).toBe(false);
  });
});

describe('isValidTargetId', () => {
  it('UUID 與 slug 都接受', () => {
    expect(isValidTargetId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidTargetId('my-first-post')).toBe(true);
  });

  it('數字會被轉成字串後接受', () => {
    expect(isValidTargetId(42)).toBe(true);
  });

  it('邊界值：剛好上限通過，超過一個字元被拒', () => {
    expect(isValidTargetId('x'.repeat(MAX_TARGET_ID_LEN))).toBe(true);
    expect(isValidTargetId('x'.repeat(MAX_TARGET_ID_LEN + 1))).toBe(false);
  });

  it('空字串與非字串型別被拒', () => {
    expect(isValidTargetId('')).toBe(false);
    expect(isValidTargetId(null)).toBe(false);
    expect(isValidTargetId(undefined)).toBe(false);
    expect(isValidTargetId({})).toBe(false);
    expect(isValidTargetId([])).toBe(false);
  });
});
