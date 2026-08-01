import { describe, it, expect, vi, afterEach } from 'vitest';

// Must be the first statement, before importing anything that (transitively)
// requires '../db' — same ordering rule as localVerify.test.js /
// commentsController.test.js.
vi.mock('../db');

import { handleOAuth } from './oauthAccountLink.js';
import { query } from '../db';

// handleOAuth is async and reports its outcome via a passport-style
// done(err, user, info) callback rather than a resolved value — wrap it in a
// promise so each test can simply await the callback's argument list instead
// of relying on a fixed-time sleep. Mirrors localVerify.test.js's callVerify.
function callHandleOAuth(provider, profileId, email, displayName, avatarUrl, emailVerified) {
  return new Promise((resolve) => {
    handleOAuth(provider, profileId, email, displayName, avatarUrl, emailVerified, (...args) => resolve(args));
  });
}

const originalAdminEmail = process.env.ADMIN_EMAIL;

describe('handleOAuth (SEC-07/D-16 option-b merge gate, D-17 admin gate)', () => {
  // Keep ADMIN_EMAIL scoped to the tests that set it, so unrelated tests
  // never accidentally match it.
  afterEach(() => {
    if (originalAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = originalAdminEmail;
  });

  describe('existing oauth_accounts hit (revisit login)', () => {
    it('returns done(null, user) immediately and performs exactly one query — no email lookup, no writes', async () => {
      const existingUser = { id: 'u-existing', email: 'someone@example.com', role: 'visitor' };
      query.mockResolvedValueOnce({ rows: [existingUser] });

      const [err, user, info] = await callHandleOAuth('google', 'g-1', 'someone@example.com', 'Someone', null, true);

      expect(err).toBeNull();
      expect(user).toEqual(existingUser);
      expect(info).toBeUndefined();
      expect(query).toHaveBeenCalledTimes(1);
      const [sql] = query.mock.calls[0];
      expect(sql).toMatch(/JOIN oauth_accounts/i);
    });

    it('behaves identically whether emailVerified is true or false — the revisit path never looks at it', async () => {
      const existingUser = { id: 'u-existing', email: 'someone@example.com', role: 'visitor' };

      query.mockResolvedValueOnce({ rows: [existingUser] });
      const resultVerifiedTrue = await callHandleOAuth('google', 'g-1', 'someone@example.com', 'Someone', null, true);

      query.mockResolvedValueOnce({ rows: [existingUser] });
      const resultVerifiedFalse = await callHandleOAuth('google', 'g-1', 'someone@example.com', 'Someone', null, false);

      expect(resultVerifiedTrue).toEqual(resultVerifiedFalse);
      // One query per call (two calls total) — neither ever reached the
      // email-comparison branch.
      expect(query).toHaveBeenCalledTimes(2);
    });
  });

  describe('email collision with an existing account', () => {
    it('emailVerified=true: merges into the existing account, writes oauth_accounts, done(null, user) — today’s behavior preserved', async () => {
      const existingUser = { id: 'u-2', email: 'collide@example.com', role: 'visitor' };
      query.mockResolvedValueOnce({ rows: [] }); // no existing oauth_accounts row
      query.mockResolvedValueOnce({ rows: [existingUser] }); // byEmail hit
      query.mockResolvedValueOnce({}); // INSERT oauth_accounts

      const [err, user, info] = await callHandleOAuth('github', 'gh-1', 'collide@example.com', 'Collide', null, true);

      expect(err).toBeNull();
      expect(user).toEqual(existingUser);
      expect(info).toBeUndefined();
      expect(query).toHaveBeenCalledTimes(3);
      const [insertSql, insertParams] = query.mock.calls[2];
      expect(insertSql).toMatch(/INSERT INTO oauth_accounts/i);
      expect(insertParams[0]).toBe(existingUser.id);
      // No mail was ever sent and no separate "link request" was created —
      // option-b has no such infrastructure at all.
    });

    it('emailVerified=false: rejects the login, performs zero writes to users or oauth_accounts (SEC-07/D-16 option-b)', async () => {
      const existingUser = { id: 'u-3', email: 'collide2@example.com', role: 'visitor' };
      query.mockResolvedValueOnce({ rows: [] }); // no existing oauth_accounts row
      query.mockResolvedValueOnce({ rows: [existingUser] }); // byEmail hit

      const [err, user, info] = await callHandleOAuth('facebook', 'fb-1', 'collide2@example.com', 'Collide2', null, false);

      expect(err).toBeNull();
      expect(user).toBe(false);
      expect(info).toBeDefined();
      expect(typeof info.message).toBe('string');

      // The core assertion this test exists for: "not merged" must mean no
      // write ever happened, not just that done(null, false) was called.
      // Asserting only on done()'s arguments would miss a "write first, then
      // reject" bug.
      expect(query).toHaveBeenCalledTimes(2);
      const allSql = query.mock.calls.map(([sql]) => sql);
      expect(allSql.some((sql) => /INSERT/i.test(sql))).toBe(false);
      expect(allSql.some((sql) => /UPDATE/i.test(sql))).toBe(false);
    });
  });

  describe('no email collision (first-time login for this email)', () => {
    it('emailVerified=false, no existing account: creates a new user normally (is_verified true, role visitor) — proves the fix does not touch ordinary first-time logins', async () => {
      const newUser = { id: 'u-new', email: 'brandnew@example.com', role: 'visitor', is_verified: true };
      query.mockResolvedValueOnce({ rows: [] }); // no existing oauth_accounts row
      query.mockResolvedValueOnce({ rows: [] }); // byEmail miss
      query.mockResolvedValueOnce({ rows: [newUser] }); // INSERT users
      query.mockResolvedValueOnce({}); // INSERT oauth_accounts

      const [err, user, info] = await callHandleOAuth('line', 'line-1', 'brandnew@example.com', 'Brand New', null, false);

      expect(err).toBeNull();
      expect(user).toEqual(newUser);
      expect(info).toBeUndefined();

      const [insertUsersSql, insertUsersParams] = query.mock.calls[2];
      expect(insertUsersSql).toMatch(/INSERT INTO users/i);
      expect(insertUsersSql).toMatch(/is_verified/i);
      // is_verified is hardcoded true in the SQL literal, not a bound param —
      // assert the literal is present and unconditional.
      expect(insertUsersSql).toMatch(/VALUES \(\$1, \$2, \$3, \$4, true\)/i);
      expect(insertUsersParams[3]).toBe('visitor');
    });

    it('ADMIN_EMAIL match + emailVerified=false + no collision: new account gets role visitor, not admin (D-17)', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      const newUser = { id: 'u-admin-attempt', email: 'admin@example.com', role: 'visitor' };
      query.mockResolvedValueOnce({ rows: [] });
      query.mockResolvedValueOnce({ rows: [] });
      query.mockResolvedValueOnce({ rows: [newUser] });
      query.mockResolvedValueOnce({});

      await callHandleOAuth('google', 'g-admin', 'admin@example.com', 'Attempted Admin', null, false);

      const [, insertUsersParams] = query.mock.calls[2];
      expect(insertUsersParams[3]).toBe('visitor');
    });

    it('ADMIN_EMAIL match + emailVerified=true + no collision: new account gets role admin (existing behavior preserved)', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      const newUser = { id: 'u-real-admin', email: 'admin@example.com', role: 'admin' };
      query.mockResolvedValueOnce({ rows: [] });
      query.mockResolvedValueOnce({ rows: [] });
      query.mockResolvedValueOnce({ rows: [newUser] });
      query.mockResolvedValueOnce({});

      await callHandleOAuth('google', 'g-admin-2', 'admin@example.com', 'Real Admin', null, true);

      const [, insertUsersParams] = query.mock.calls[2];
      expect(insertUsersParams[3]).toBe('admin');
    });
  });

  it('a query rejection propagates as done(err), never as done(null, false, ...)', async () => {
    const dbErr = new Error('連線逾時：資料庫無回應');
    query.mockRejectedValueOnce(dbErr);
    const [err, user, info] = await callHandleOAuth('google', 'g-err', 'anyone@example.com', 'Anyone', null, true);
    expect(err).toBe(dbErr);
    expect(user).toBeUndefined();
    expect(info).toBeUndefined();
  });
});
