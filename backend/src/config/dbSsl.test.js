import { describe, it, expect, vi } from 'vitest';

vi.mock('../db');

import { isHostedDb, resolveDbSslOption, readSslMode, describeSslMode, MODES_WEAK_IN_PG_V9 } from './dbSsl.js';

const NEON = 'postgresql://u:p@ep-wispy.aws.neon.tech/db?sslmode=require';
const SUPABASE = 'postgresql://u:p@db.abcd.supabase.co:5432/postgres';
const LOCAL = 'postgresql://postgres:postgres@localhost:5432/portfolio';

describe('isHostedDb', () => {
  it('認得 Neon 與 Supabase', () => {
    expect(isHostedDb(NEON)).toBe(true);
    expect(isHostedDb(SUPABASE)).toBe(true);
    expect(isHostedDb('postgresql://x@y.supabase.com/db')).toBe(true);
  });

  it('本機連線不算託管', () => {
    expect(isHostedDb(LOCAL)).toBe(false);
    expect(isHostedDb('')).toBe(false);
    expect(isHostedDb(undefined)).toBe(false);
  });
});

describe('resolveDbSslOption', () => {
  // 這是這次修補的核心。修補前的值是 { rejectUnauthorized: false }，
  // 等於在所有使用 TLS 的情境（含 production）關閉資料庫連線的憑證驗證。
  //
  // 實測（直接對正式環境的 Neon endpoint 做 Postgres SSLRequest 之後的 TLS
  // 握手，不送任何帳密）：rejectUnauthorized: true 時 authorized 為 true、
  // 無任何錯誤，憑證由 Let's Encrypt 簽發。也就是關閉驗證換不到任何相容性。
  it('託管資料庫一律驗證憑證', () => {
    expect(resolveDbSslOption(NEON, { NODE_ENV: 'development' })).toEqual({ rejectUnauthorized: true });
    expect(resolveDbSslOption(SUPABASE, { NODE_ENV: 'development' })).toEqual({ rejectUnauthorized: true });
  });

  it('production 一律驗證憑證，即使不是託管資料庫', () => {
    expect(resolveDbSslOption(LOCAL, { NODE_ENV: 'production' })).toEqual({ rejectUnauthorized: true });
  });

  it('本機非 production 維持不使用 TLS —— 既有行為不變', () => {
    expect(resolveDbSslOption(LOCAL, { NODE_ENV: 'development' })).toBe(false);
    expect(resolveDbSslOption(LOCAL, {})).toBe(false);
  });

  it('逃生門需明確設定才生效', () => {
    expect(
      resolveDbSslOption(NEON, { NODE_ENV: 'development', DB_ALLOW_SELF_SIGNED: 'true' })
    ).toEqual({ rejectUnauthorized: false });
  });

  // 與 utils/mailer.js 同一組理由：關閉憑證驗證這種事不該只靠一道開關。
  it('逃生門在 production 一律無效', () => {
    expect(
      resolveDbSslOption(NEON, { NODE_ENV: 'production', DB_ALLOW_SELF_SIGNED: 'true' })
    ).toEqual({ rejectUnauthorized: true });
  });

  it('逃生門只認字串 true，不接受任何 truthy 值', () => {
    for (const v of ['1', 'yes', 'TRUE', true, 1]) {
      expect(
        resolveDbSslOption(NEON, { NODE_ENV: 'development', DB_ALLOW_SELF_SIGNED: v }),
        `DB_ALLOW_SELF_SIGNED=${JSON.stringify(v)} 不該生效`
      ).toEqual({ rejectUnauthorized: true });
    }
  });
});

describe('readSslMode / describeSslMode（pg v9 的行為變更）', () => {
  it('讀得出連線字串裡的 sslmode', () => {
    expect(readSslMode('postgresql://u:p@h.neon.tech/db?sslmode=require')).toBe('require');
    expect(readSslMode('postgresql://u:p@h.neon.tech/db?a=1&sslmode=VERIFY-FULL')).toBe('verify-full');
    expect(readSslMode('postgresql://u:p@h.neon.tech/db')).toBe(null);
    expect(readSslMode('')).toBe(null);
    expect(readSslMode(undefined)).toBe(null);
  });

  it('連線字串不是合法 URL 時也不拋錯（密碼可能含特殊字元）', () => {
    expect(() => readSslMode('postgres://u:p@ss:w0rd@h/db?sslmode=require')).not.toThrow();
    expect(readSslMode('postgres://u:p@ss:w0rd@h/db?sslmode=require')).toBe('require');
  });

  // pg 8.x 把這三個當成 verify-full，pg v9 起改成 libpq 語意（加密但不驗證
  // 伺服器身分）。屆時憑證驗證會在沒有任何程式碼變更的情況下消失，而程式
  // 這一側擋不住 —— 連線字串永遠覆蓋程式的 ssl 設定（見檔頭實測）。
  it.each(MODES_WEAK_IN_PG_V9)('sslmode=%s 被標記為需要處理', (mode) => {
    const r = describeSslMode(`postgresql://u:p@h.neon.tech/db?sslmode=${mode}`, { NODE_ENV: 'production' });
    expect(r.level).toBe('warn');
    expect(r.sslMode).toBe(mode);
    expect(r.message).toContain('verify-full');
  });

  it('sslmode=verify-full 通過', () => {
    const r = describeSslMode('postgresql://u:p@h.neon.tech/db?sslmode=verify-full', { NODE_ENV: 'production' });
    expect(r.level).toBe('ok');
  });

  it('沒有 sslmode 時通過 —— 此時程式的 fail-closed 設定才真正生效', () => {
    const r = describeSslMode('postgresql://u:p@h.neon.tech/db', { NODE_ENV: 'production' });
    expect(r.level).toBe('ok');
    expect(r.sslMode).toBe(null);
  });

  it('本機純文字連線不做這項檢查', () => {
    const r = describeSslMode('postgresql://postgres@localhost:5432/db', { NODE_ENV: 'development' });
    expect(r.level).toBe('none');
  });

  it('未預期的 sslmode 也會被標記出來，不會靜靜放過', () => {
    const r = describeSslMode('postgresql://u:p@h.neon.tech/db?sslmode=disable', { NODE_ENV: 'production' });
    expect(r.level).toBe('warn');
  });
});
