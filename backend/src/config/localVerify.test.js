import { describe, it, expect, vi } from 'vitest';
import bcrypt from 'bcrypt';

// Must be the first statement, before importing anything that (transitively)
// requires '../db' — same ordering rule as commentsController.test.js.
vi.mock('../db');

import { verifyLocalCredentials, LOGIN_FAILED_MESSAGE } from './localVerify.js';
import { query } from '../db';

// verifyLocalCredentials is async and reports its outcome via a
// passport-style done(err, user, info) callback rather than a resolved
// value — wrap it in a promise so each test can simply await the callback's
// argument list instead of relying on a fixed-time sleep.
function callVerify(email, password) {
  return new Promise((resolve) => {
    verifyLocalCredentials(email, password, (...args) => resolve(args));
  });
}

describe('verifyLocalCredentials (SEC-06/D-15: unified login failure message)', () => {
  it('unknown email: done(null, false, { message: LOGIN_FAILED_MESSAGE })', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const [err, user, info] = await callVerify('nobody@example.com', 'anything');
    expect(err).toBeNull();
    expect(user).toBe(false);
    expect(info.message).toBe(LOGIN_FAILED_MESSAGE);
  });

  it('account exists but has no password_hash (OAuth-created): message equals the same constant', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'u1', email: 'oauth@example.com', password_hash: null, is_verified: true }],
    });
    const [err, user, info] = await callVerify('oauth@example.com', 'anything');
    expect(err).toBeNull();
    expect(user).toBe(false);
    expect(info.message).toBe(LOGIN_FAILED_MESSAGE);
  });

  it('account exists with a password but it is wrong: message equals the same constant', async () => {
    const hash = await bcrypt.hash('correct-password-123', 10);
    query.mockResolvedValueOnce({
      rows: [{ id: 'u2', email: 'user@example.com', password_hash: hash, is_verified: true }],
    });
    const [err, user, info] = await callVerify('user@example.com', 'wrong-password-456');
    expect(err).toBeNull();
    expect(user).toBe(false);
    expect(info.message).toBe(LOGIN_FAILED_MESSAGE);
  });

  it('the three failure messages above are byte-identical to each other (the core security property) and each is actionable (mentions 忘記密碼)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const [, , infoNoUser] = await callVerify('nobody@example.com', 'x');

    query.mockResolvedValueOnce({ rows: [{ id: 'u1', password_hash: null, is_verified: true }] });
    const [, , infoNoHash] = await callVerify('oauth@example.com', 'x');

    const hash = await bcrypt.hash('correct-password-123', 10);
    query.mockResolvedValueOnce({ rows: [{ id: 'u2', password_hash: hash, is_verified: true }] });
    const [, , infoWrongPw] = await callVerify('user@example.com', 'wrong');

    // This is the assertion that will fail the moment anyone edits only one
    // of the three branch messages in the future — the whole reason this
    // test exists.
    expect(infoNoUser.message).toBe(infoNoHash.message);
    expect(infoNoHash.message).toBe(infoWrongPw.message);

    expect(infoNoUser.message).toContain('忘記密碼');
    expect(infoNoHash.message).toContain('忘記密碼');
    expect(infoWrongPw.message).toContain('忘記密碼');
  });

  it('is_verified=false: keeps the original unverified-account notice, distinct from LOGIN_FAILED_MESSAGE', async () => {
    const hash = await bcrypt.hash('correct-password-123', 10);
    query.mockResolvedValueOnce({
      rows: [{ id: 'u3', email: 'newuser@example.com', password_hash: hash, is_verified: false }],
    });
    const [err, user, info] = await callVerify('newuser@example.com', 'correct-password-123');
    expect(err).toBeNull();
    expect(user).toBe(false);
    // Deliberate D-15 trade-off: by this point bcrypt has already matched,
    // so the caller already holds the correct password — this branch is not
    // required to fold into the unified message. If a future change ever
    // makes this equal to LOGIN_FAILED_MESSAGE, it has silently sent a
    // freshly-registered real user back into the dead end this plan removed.
    expect(info.message).not.toBe(LOGIN_FAILED_MESSAGE);
    expect(info.message).toBe('請先至 Email 收取驗證信以啟用帳號');
  });

  it('correct password + verified account: resolves done(null, user) with no third argument', async () => {
    const hash = await bcrypt.hash('correct-password-123', 10);
    const userRow = { id: 'u4', email: 'verified@example.com', password_hash: hash, is_verified: true };
    query.mockResolvedValueOnce({ rows: [userRow] });
    const args = await callVerify('verified@example.com', 'correct-password-123');
    expect(args[0]).toBeNull();
    expect(args[1]).toEqual(userRow);
    expect(args.length).toBe(2);
  });

  it('a query rejection propagates as done(err), never as done(null, false, ...)', async () => {
    const dbErr = new Error('連線逾時：資料庫無回應');
    query.mockRejectedValueOnce(dbErr);
    const [err, user, info] = await callVerify('anyone@example.com', 'x');
    expect(err).toBe(dbErr);
    expect(user).toBeUndefined();
    expect(info).toBeUndefined();
  });
});
