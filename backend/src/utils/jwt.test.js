import { describe, it, expect, vi } from 'vitest';

// Must be the first statement, before any other import: backend/src/utils/jwt.js
// requires ../db (for generateRefreshToken), which — unmocked — would run the
// real Pool construction and the deferred migration timer in backend/src/db/index.js.
//
// vi.mock('../db') correctly serves THIS file's own direct `import { query }
// from '../db'` below. It does NOT, on its own, intercept the nested
// require('../db') that jwt.js issues internally (verified in Task 1) — that
// path is bridged separately by the Module._load patch in
// backend/src/test/setup.js, which redirects it to these exact same
// query/pool mock objects. See 01-01-SUMMARY.md "Deviations" for the full
// investigation of why that bridge is necessary.
vi.mock('../db');

import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  setRefreshTokenCookie,
  generateGuestSessionToken,
  verifyGuestSessionToken,
} from './jwt.js';
import { query } from '../db';

describe('generateAccessToken / verifyAccessToken', () => {
  it('round-trips a signed access token to its original claims', () => {
    const token = generateAccessToken('user-123', 'admin');
    const decoded = verifyAccessToken(token);

    expect(decoded.sub).toBe('user-123');
    expect(decoded.role).toBe('admin');
    expect(decoded.type).toBe('access');
  });

  it('rejects a token signed with a different secret (signature failure)', () => {
    const forgedToken = jwt.sign(
      { sub: 'user-123', role: 'admin', type: 'access' },
      'a-different-secret-not-the-configured-one',
      { expiresIn: '15m' }
    );

    let caught;
    try {
      verifyAccessToken(forgedToken);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(caught.name).toBe('JsonWebTokenError');
  });

  it('rejects an already-expired token with error name TokenExpiredError (the exact name authenticate.js branches on)', () => {
    // Signed directly with jsonwebtoken against the same secret the setup
    // file provides, using a negative expiresIn so the token is already
    // expired at the moment it is created — avoids fake timers entirely.
    const expiredToken = jwt.sign(
      { sub: 'user-123', role: 'admin', type: 'access' },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: -10 }
    );

    let caught;
    try {
      verifyAccessToken(expiredToken);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    // backend/src/middlewares/authenticate.js checks `err.name === 'TokenExpiredError'`
    // specifically — assert on the name, not the message, to match that branch.
    expect(caught.name).toBe('TokenExpiredError');
  });

  it('issues an access token with a 15-minute lifetime', () => {
    const token = generateAccessToken('user-123', 'admin');
    const decoded = jwt.decode(token);

    // exp/iat come from the same jsonwebtoken "now" reference internally, so
    // this delta is exact — no wall-clock tolerance window needed.
    expect(decoded.exp - decoded.iat).toBe(15 * 60);
  });
});

describe('generateRefreshToken', () => {
  it('interop proof: the CommonJS require(\'../db\') inside jwt.js is served by the same mock this test file imports', async () => {
    await generateRefreshToken('user-123');

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO refresh_tokens/i);
    expect(params).toHaveLength(3);
  });

  it('persists a SHA-256 hash of the raw token, never the raw value itself', async () => {
    const rawToken = await generateRefreshToken('user-123');

    expect(query).toHaveBeenCalledTimes(1);
    const [, params] = query.mock.calls[0];
    const [, persistedHash] = params;
    const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    expect(persistedHash).toBe(expectedHash);
    expect(persistedHash).not.toBe(rawToken);
  });

  it('returns a high-entropy hex string as the raw token', async () => {
    const rawToken = await generateRefreshToken('user-123');

    // crypto.randomBytes(64).toString('hex') -> 128 hex characters
    expect(rawToken).toMatch(/^[0-9a-f]{128}$/);
  });

  it('stores an expiry roughly 30 days in the future', async () => {
    const before = Date.now();
    await generateRefreshToken('user-123');
    const after = Date.now();

    const [, params] = query.mock.calls[0];
    const [, , expiresAt] = params;
    const expiresAtMs = new Date(expiresAt).getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    // Small tolerance window for test execution time — the plan's own
    // wording ("roughly 30 days") signals this is not meant to be exact.
    expect(expiresAtMs).toBeGreaterThanOrEqual(before + thirtyDaysMs - 5000);
    expect(expiresAtMs).toBeLessThanOrEqual(after + thirtyDaysMs + 5000);
  });
});

describe('generateGuestSessionToken / verifyGuestSessionToken (SEC-04, SEC-05, D-04, D-05)', () => {
  it('round-trips a signed guest session token to its original session identifier', () => {
    const token = generateGuestSessionToken('session-abc');
    const decoded = verifyGuestSessionToken(token);

    expect(decoded.sid).toBe('session-abc');
    expect(decoded.type).toBe('guest');
  });

  it('rejects a token signed with a different secret (signature failure)', () => {
    const forgedToken = jwt.sign(
      { sid: 'session-abc', type: 'guest' },
      'a-different-secret-not-the-configured-one',
      { expiresIn: '24h' }
    );

    expect(() => verifyGuestSessionToken(forgedToken)).toThrow();
  });

  it('rejects a structurally malformed token string', () => {
    expect(() => verifyGuestSessionToken('not-a-real-jwt')).toThrow();
  });

  it('rejects an already-expired guest token', () => {
    const expiredToken = jwt.sign(
      { sid: 'session-abc', type: 'guest' },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: -10 }
    );

    let caught;
    try {
      verifyGuestSessionToken(expiredToken);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect(caught.name).toBe('TokenExpiredError');
  });

  it('issues a guest session token with a 24-hour lifetime', () => {
    const token = generateGuestSessionToken('session-abc');
    const decoded = jwt.decode(token);

    expect(decoded.exp - decoded.iat).toBe(24 * 60 * 60);
  });

  // T-01-06: both credential kinds are signed with the same secret (RESEARCH.md
  // assumption A2), so the `type` claim check is the ONLY thing preventing a
  // guest token and a user access token from being interchangeable.
  it('rejects a real user access token when handed to verifyGuestSessionToken (cross-use)', () => {
    const accessToken = generateAccessToken('user-123', 'admin');

    expect(() => verifyGuestSessionToken(accessToken)).toThrow();
  });

  it('rejects a real guest session token when handed to verifyAccessToken (cross-use)', () => {
    const guestToken = generateGuestSessionToken('session-abc');

    expect(() => verifyAccessToken(guestToken)).toThrow();
  });

  it('verifyAccessToken still accepts a token produced by generateAccessToken (regression guard for the tightened type check)', () => {
    const accessToken = generateAccessToken('user-123', 'admin');
    const decoded = verifyAccessToken(accessToken);

    expect(decoded.sub).toBe('user-123');
    expect(decoded.role).toBe('admin');
    expect(decoded.type).toBe('access');
  });
});

describe('setRefreshTokenCookie', () => {
  it('sets httpOnly, secure, sameSite=none, and a root path', () => {
    // Minimal fake response object — no need to spin up Express for this.
    const res = { cookie: vi.fn() };

    setRefreshTokenCookie(res, 'some-raw-refresh-token');

    expect(res.cookie).toHaveBeenCalledTimes(1);
    const [cookieName, cookieValue, options] = res.cookie.mock.calls[0];

    expect(cookieName).toBe('refresh_token');
    expect(cookieValue).toBe('some-raw-refresh-token');
    // Root path is today's correct value on the SET side (jwt.js). Plan
    // 01-02 fixes the CLEAR side (auth.js's logout handler, currently
    // path: '/auth') to agree with this value (D-03) — pinning it here is
    // what makes that future fix verifiable as a diff.
    expect(options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
    });
  });
});
