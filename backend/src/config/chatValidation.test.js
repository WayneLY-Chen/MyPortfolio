import { describe, it, expect, vi } from 'vitest';

vi.mock('../db');

import { MESSAGE_MAX_CHARS, isValidChatMessage } from './chatValidation.js';

const userTurn = (text) => ({ role: 'user', parts: [{ text }] });
const modelTurn = (text) => ({ role: 'model', parts: [{ text }] });

describe('isValidChatMessage', () => {
  it('一般提問通過', () => {
    expect(isValidChatMessage('你會什麼技術？')).toBe(true);
  });

  it('空字串與純空白被拒', () => {
    expect(isValidChatMessage('')).toBe(false);
    expect(isValidChatMessage('   ')).toBe(false);
  });

  it('邊界值：剛好上限通過，超過一個字元被拒', () => {
    expect(isValidChatMessage('x'.repeat(MESSAGE_MAX_CHARS))).toBe(true);
    expect(isValidChatMessage('x'.repeat(MESSAGE_MAX_CHARS + 1))).toBe(false);
  });

  it('非字串型別被拒', () => {
    expect(isValidChatMessage(null)).toBe(false);
    expect(isValidChatMessage(undefined)).toBe(false);
    expect(isValidChatMessage(123)).toBe(false);
    expect(isValidChatMessage({})).toBe(false);
    expect(isValidChatMessage(['hi'])).toBe(false);
  });
});
