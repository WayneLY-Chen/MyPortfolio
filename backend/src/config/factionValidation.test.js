import { describe, it, expect, vi } from 'vitest';

vi.mock('../db');

import {
  GRID_SIZE,
  TEAMS,
  isValidGridIndex,
  normalizeTeam,
  teamColor,
  normalizePlayerName,
} from './factionValidation.js';

describe('isValidGridIndex', () => {
  it('棋盤內的整數索引通過', () => {
    expect(isValidGridIndex(0)).toBe(true);
    expect(isValidGridIndex(50)).toBe(true);
    expect(isValidGridIndex(GRID_SIZE - 1)).toBe(true);
  });

  it('邊界：GRID_SIZE 本身被拒', () => {
    expect(isValidGridIndex(GRID_SIZE)).toBe(false);
  });

  // 實測確認：factionState.grid['length'] = '#3b82f6' 會拋
  // RangeError: Invalid array length，socket.io 不攔 handler 內的同步例外，
  // 因此變成 uncaughtException，真實伺服器沒有對應的 handler，Node 預設中止行程。
  it('字串 "length" 被拒 —— 這個值原本會讓整個行程中止', () => {
    expect(isValidGridIndex('length')).toBe(false);
  });

  // 實測確認：grid 從 100 格膨脹到 3,000,001 格，而每次落子都會把整份 grid
  // 透過 io.emit 廣播給所有連線者。
  it('超出棋盤的巨大索引被拒 —— 這個值原本會讓 grid 膨脹並被整份廣播', () => {
    expect(isValidGridIndex(3000000)).toBe(false);
    expect(isValidGridIndex(Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  it('負數被拒', () => {
    expect(isValidGridIndex(-1)).toBe(false);
    expect(isValidGridIndex(-5)).toBe(false);
  });

  it('非整數被拒', () => {
    expect(isValidGridIndex(5.5)).toBe(false);
    expect(isValidGridIndex(0.1)).toBe(false);
  });

  it('數字型字串被拒 —— JSON 送得出來，且會走上物件屬性的路徑', () => {
    expect(isValidGridIndex('5')).toBe(false);
    expect(isValidGridIndex('0')).toBe(false);
  });

  it('NaN / Infinity 被拒', () => {
    expect(isValidGridIndex(NaN)).toBe(false);
    expect(isValidGridIndex(Infinity)).toBe(false);
    expect(isValidGridIndex(-Infinity)).toBe(false);
  });

  it('其他型別被拒', () => {
    expect(isValidGridIndex(null)).toBe(false);
    expect(isValidGridIndex(undefined)).toBe(false);
    expect(isValidGridIndex({})).toBe(false);
    expect(isValidGridIndex([])).toBe(false);
    expect(isValidGridIndex([5])).toBe(false);
    expect(isValidGridIndex(true)).toBe(false);
  });

  it('原型鍵被拒', () => {
    for (const key of ['__proto__', 'constructor', 'prototype', 'toString']) {
      expect(isValidGridIndex(key), `${key} 不該通過`).toBe(false);
    }
  });
});

describe('normalizeTeam / teamColor', () => {
  it('前端實際送出的兩個隊伍值通過', () => {
    // frontend/src/pages/FunPage.jsx 只送 'blue' / 'orange'
    expect(normalizeTeam('blue')).toBe('blue');
    expect(normalizeTeam('orange')).toBe('orange');
    expect(TEAMS).toEqual(['blue', 'orange']);
  });

  it('任意字串回 null —— 原本會被當成橘隊並原樣廣播', () => {
    expect(normalizeTeam('ATTACKER-CONTROLLED')).toBe(null);
    expect(normalizeTeam('')).toBe(null);
    expect(normalizeTeam('Blue')).toBe(null);
  });

  it('非字串回 null', () => {
    expect(normalizeTeam(null)).toBe(null);
    expect(normalizeTeam(undefined)).toBe(null);
    expect(normalizeTeam(0)).toBe(null);
    expect(normalizeTeam({})).toBe(null);
  });

  it('teamColor 只對合法隊伍給顏色', () => {
    expect(teamColor('blue')).toBe('#3b82f6');
    expect(teamColor('orange')).toBe('#f97316');
  });

  it('teamColor 對非法隊伍回 null，不給預設顏色', () => {
    expect(teamColor('ATTACKER-CONTROLLED')).toBe(null);
    expect(teamColor(null)).toBe(null);
    expect(teamColor(undefined)).toBe(null);
  });

  // 與 ttsValidation / ai.js 的 TTS_RATE_WHITELIST 同一組理由：用 Map 而非
  // 物件字面值，原型鍵才不會命中。
  it('原型鍵不會命中顏色表', () => {
    for (const key of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']) {
      expect(teamColor(key), `${key} 不該有顏色`).toBe(null);
      expect(normalizeTeam(key), `${key} 不該是合法隊伍`).toBe(null);
    }
  });
});

describe('normalizePlayerName（與 bossValidation 共用同一份）', () => {
  // 刻意不寫 `expect(normalizePlayerName).toBe(boss.normalizePlayerName)`：
  // 實測過，那條在這個專案裡必定失敗，而且失敗的理由與正確性無關 ——
  // factionValidation.js 是 CommonJS，內部以 require('./bossValidation') 取得
  // 函式（Node 原生 Module._load）；測試檔的 import 走 Vite 的 SSR 模組圖。
  // 兩條路徑拿到不同的函式物件，即使原始碼確實只有一份。改為驗證行為等價。
  it('行為與 bossValidation 的那一份一致', async () => {
    const boss = await import('./bossValidation.js');
    for (const input of [null, undefined, '', '   ', 'Wayne', '勇者小明', 'Y'.repeat(500), 123]) {
      expect(
        normalizePlayerName(input),
        `輸入 ${JSON.stringify(input)} 的結果與 bossValidation 不一致`
      ).toBe(boss.normalizePlayerName(input));
    }
  });

  it('超長名字被截斷 —— 實測 20 萬字會原樣存進常駐狀態並廣播', () => {
    expect(normalizePlayerName('Y'.repeat(200000)).length).toBe(20);
  });
});
