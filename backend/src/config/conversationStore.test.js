import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../db');

import {
  MAX_TURNS,
  MAX_TURN_CHARS,
  MAX_CONVERSATIONS,
  TTL_MS,
  getHistory,
  appendTurn,
  resetConversation,
  _clearAllForTests,
  _sizeForTests,
} from './conversationStore.js';

beforeEach(() => {
  _clearAllForTests();
});

afterEach(() => {
  vi.useRealTimers();
  _clearAllForTests();
});

describe('getHistory / appendTurn', () => {
  it('記下的一輪之後讀得回來，格式符合 Gemini 的 history', () => {
    appendTurn('user-a', '你好', '哈囉喵');
    expect(getHistory('user-a')).toEqual([
      { role: 'user', parts: [{ text: '你好' }] },
      { role: 'model', parts: [{ text: '哈囉喵' }] },
    ]);
  });

  it('不同身分的對話互相隔離', () => {
    appendTurn('user-a', 'A 的問題', 'A 的回覆');
    appendTurn('user-b', 'B 的問題', 'B 的回覆');
    expect(getHistory('user-a')[0].parts[0].text).toBe('A 的問題');
    expect(getHistory('user-b')[0].parts[0].text).toBe('B 的問題');
    expect(getHistory('user-a')).toHaveLength(2);
  });

  it('沒有身分時回空陣列，而且不會記錄任何東西', () => {
    expect(getHistory(null)).toEqual([]);
    expect(getHistory(undefined)).toEqual([]);
    expect(getHistory('')).toEqual([]);
    appendTurn(null, '問', '答');
    expect(_sizeForTests()).toBe(0);
  });

  it('沒見過的身分回空陣列', () => {
    expect(getHistory('沒見過的人')).toEqual([]);
  });

  it('歷史永遠以 user 開頭且 user/model 交替 —— Gemini 的硬性要求', () => {
    for (let i = 0; i < MAX_TURNS + 5; i++) appendTurn('k', `問${i}`, `答${i}`);
    const history = getHistory('k');
    expect(history[0].role).toBe('user');
    history.forEach((turn, i) => {
      expect(turn.role, `第 ${i} 則角色錯了`).toBe(i % 2 === 0 ? 'user' : 'model');
    });
  });

  it('只保留最近 MAX_TURNS 輪', () => {
    for (let i = 0; i < MAX_TURNS + 5; i++) appendTurn('k', `問${i}`, `答${i}`);
    const history = getHistory('k');
    expect(history).toHaveLength(MAX_TURNS * 2);
    // 最舊的應該被丟掉，最新的要在
    expect(history[0].parts[0].text).toBe('問5');
    expect(history[history.length - 1].parts[0].text).toBe(`答${MAX_TURNS + 4}`);
  });

  it('單則過長會被截斷，不會常駐在記憶體裡', () => {
    appendTurn('k', 'x'.repeat(MAX_TURN_CHARS + 5000), 'y'.repeat(MAX_TURN_CHARS + 5000));
    const history = getHistory('k');
    expect(history[0].parts[0].text.length).toBe(MAX_TURN_CHARS);
    expect(history[1].parts[0].text.length).toBe(MAX_TURN_CHARS);
  });

  it('非字串內容不會讓它爆掉', () => {
    expect(() => appendTurn('k', null, undefined)).not.toThrow();
    expect(() => appendTurn('k', 123, { a: 1 })).not.toThrow();
    for (const turn of getHistory('k')) {
      expect(typeof turn.parts[0].text).toBe('string');
    }
  });
});

describe('resetConversation', () => {
  it('清掉指定身分的對話', () => {
    appendTurn('k', '問', '答');
    expect(getHistory('k')).toHaveLength(2);
    resetConversation('k');
    expect(getHistory('k')).toEqual([]);
  });

  it('不影響其他身分', () => {
    appendTurn('a', '問 a', '答 a');
    appendTurn('b', '問 b', '答 b');
    resetConversation('a');
    expect(getHistory('a')).toEqual([]);
    expect(getHistory('b')).toHaveLength(2);
  });

  it('傳 null 不會爆炸', () => {
    expect(() => resetConversation(null)).not.toThrow();
  });
});

describe('過期與容量上限', () => {
  it('超過 TTL 的對話讀不到，且會被丟棄', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    appendTurn('k', '問', '答');
    expect(getHistory('k')).toHaveLength(2);

    vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime() + TTL_MS + 1000);
    expect(getHistory('k')).toEqual([]);
    expect(_sizeForTests()).toBe(0);
  });

  it('未過期的對話不受影響', () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-01-01T00:00:00Z').getTime();
    vi.setSystemTime(t0);
    appendTurn('k', '問', '答');
    vi.setSystemTime(t0 + TTL_MS - 1000);
    expect(getHistory('k')).toHaveLength(2);
  });

  it('超過 MAX_CONVERSATIONS 時丟掉最久沒用到的', () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-01-01T00:00:00Z').getTime();
    // 每筆間隔 1 秒，讓 lastSeen 有明確先後
    for (let i = 0; i < MAX_CONVERSATIONS + 10; i++) {
      vi.setSystemTime(t0 + i * 1000);
      appendTurn(`k${i}`, '問', '答');
    }
    expect(_sizeForTests()).toBeLessThanOrEqual(MAX_CONVERSATIONS);
    // 最舊的被丟掉，最新的還在
    expect(getHistory('k0')).toEqual([]);
    expect(getHistory(`k${MAX_CONVERSATIONS + 9}`)).toHaveLength(2);
  });
});
