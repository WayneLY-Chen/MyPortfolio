import { describe, it, expect, vi } from 'vitest';

vi.mock('../db');

import {
  EMAIL_MAX_LEN,
  DISPLAY_NAME_MAX_LEN,
  PASSWORD_MIN_LEN,
  PASSWORD_MAX_LEN,
  isValidEmail,
  isValidDisplayName,
  isValidPassword,
} from './registrationValidation.js';

describe('isValidEmail', () => {
  it('一般信箱通過', () => {
    for (const email of [
      'wayne@example.com',
      'a.b+tag@sub.example.co.uk',
      'user_name@example.io',
      '陳@example.com',
    ]) {
      expect(isValidEmail(email), `${email} 應通過`).toBe(true);
    }
  });

  it('明顯不是信箱的字串被拒', () => {
    for (const bad of ['', 'notanemail', 'a@b', '@example.com', 'a@@b.com', 'a b@example.com', 'a@ex ample.com']) {
      expect(isValidEmail(bad), `${JSON.stringify(bad)} 應被拒`).toBe(false);
    }
  });

  // 修補前的檢查是 `!email`，數字 123 的 !123 為 false，因此一路放行寫進資料庫。
  it('非字串被拒 —— 修補前 `!email` 對數字為 false，會一路寫進資料庫', () => {
    expect(isValidEmail(123)).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
    expect(isValidEmail({})).toBe(false);
    expect(isValidEmail(['a@b.com'])).toBe(false);
  });

  it('超過欄位長度被拒（users.email 是 VARCHAR(255)）', () => {
    const local = 'x'.repeat(EMAIL_MAX_LEN - '@example.com'.length);
    expect(isValidEmail(local + '@example.com')).toBe(true);
    expect(isValidEmail('x' + local + '@example.com')).toBe(false);
  });
});

describe('isValidDisplayName', () => {
  it('一般名稱通過', () => {
    expect(isValidDisplayName('Wayne')).toBe(true);
    expect(isValidDisplayName('陳林淯')).toBe(true);
  });

  // display_name 會以留言者名稱的形式出現在公開頁面上，修補前完全沒有上限。
  it('邊界值：剛好上限通過，超過一個字元被拒', () => {
    expect(isValidDisplayName('x'.repeat(DISPLAY_NAME_MAX_LEN))).toBe(true);
    expect(isValidDisplayName('x'.repeat(DISPLAY_NAME_MAX_LEN + 1))).toBe(false);
  });

  it('十萬字的名稱被拒 —— body 上限 100kb 內，修補前這會直接寫進資料庫', () => {
    expect(isValidDisplayName('x'.repeat(100000))).toBe(false);
  });

  it('空白或非字串被拒', () => {
    expect(isValidDisplayName('')).toBe(false);
    expect(isValidDisplayName('   ')).toBe(false);
    expect(isValidDisplayName(123)).toBe(false);
    expect(isValidDisplayName(null)).toBe(false);
  });
});

describe('isValidPassword', () => {
  it('下限維持修補前的 8 字', () => {
    expect(PASSWORD_MIN_LEN).toBe(8);
    expect(isValidPassword('x'.repeat(8))).toBe(true);
    expect(isValidPassword('x'.repeat(7))).toBe(false);
  });

  it('新增的上限擋掉異常大的輸入', () => {
    expect(isValidPassword('x'.repeat(PASSWORD_MAX_LEN))).toBe(true);
    expect(isValidPassword('x'.repeat(PASSWORD_MAX_LEN + 1))).toBe(false);
  });

  it('非字串被拒', () => {
    expect(isValidPassword(12345678)).toBe(false);
    expect(isValidPassword(null)).toBe(false);
    expect(isValidPassword(undefined)).toBe(false);
  });
});
