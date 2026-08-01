import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// Must be the first statements, before every other import.
vi.mock('../db');
vi.mock('../config/passport');

import jwt from 'jsonwebtoken';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import authRouter from './auth.js';
import { generateAccessToken, verifyGuestSessionToken } from '../utils/jwt.js';
import { query } from '../db';

// backend/src/routes/auth.js's LINE and Facebook callback routes gate on
// these env vars BEFORE ever calling passport.authenticate (a guard in
// auth.js itself, separate from config/passport.js's per-strategy
// registration guard). Set fake values so all four providers reach the
// mocked authenticate path uniformly — no real credentials are ever used,
// since config/passport is fully replaced by
// backend/src/config/__mocks__/passport.js (see that file for why the
// whole module must be mocked rather than "configured" with fake ids).
process.env.LINE_CHANNEL_ID = 'test-line-channel-id';
process.env.FACEBOOK_APP_ID = 'test-facebook-app-id';

// Build a fresh, minimal Express app per call, mounting only the auth
// router — mirrors backend/src/index.js's actual middleware order (json,
// then cookie-parser, then routers: index.js:44-48,85) but NEVER imports
// backend/src/index.js itself, which calls server.listen()/initSockets() at
// module load and would bind a real port / boot a real Socket.io server.
const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/auth', authRouter);
  return app;
};

describe('OAuth callback redirects (SEC-01, D-01, TEST-03)', () => {
  // Table-driven: the production code being replaced is four copies of the
  // same four lines (backend/src/routes/auth.js), so a copy-pasted test per
  // provider would be just as easy to under-maintain as the code it
  // verifies. Adding a fifth provider is a one-line change to this array.
  const PROVIDER_CALLBACK_PATHS = [
    '/auth/google/callback',
    '/auth/github/callback',
    '/auth/line/callback',
    '/auth/facebook/callback',
  ];

  it.each(PROVIDER_CALLBACK_PATHS)(
    '%s redirects to /login/callback with no query string, no JWT, and sets the refresh cookie',
    async (callbackPath) => {
      // One INSERT performed inside generateRefreshToken; the mocked
      // config/passport never touches the database.
      query.mockResolvedValueOnce({});

      const res = await request(buildApp()).get(callbackPath);

      expect(res.status).toBeGreaterThanOrEqual(300);
      expect(res.status).toBeLessThan(400);

      const location = res.headers.location;
      expect(location).toBeDefined();
      expect(location.endsWith('/login/callback')).toBe(true);
      // SEC-01: no query string at all — today's implementation appends
      // `?token=<JWT>`, which is exactly what this assertion catches.
      expect(location.includes('?')).toBe(false);
      // Belt-and-suspenders: no JWT-shaped (three dot-separated segments)
      // substring anywhere in the redirect target.
      expect(location).not.toMatch(/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);

      const setCookieHeader = res.headers['set-cookie'] || [];
      expect(setCookieHeader.some((c) => c.startsWith('refresh_token='))).toBe(true);
    }
  );
});

describe('GET /auth/guest-session (SEC-04, SEC-05, D-04, D-05)', () => {
  it('returns 200 with a success flag, a session identifier, and a signed token, requiring no credentials', async () => {
    const res = await request(buildApp()).get('/auth/guest-session');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.sessionId).toBe('string');
    expect(res.body.sessionId.length).toBeGreaterThan(0);
    expect(typeof res.body.token).toBe('string');

    // The returned token must verify as a guest session token binding the
    // exact sessionId returned alongside it.
    const decoded = verifyGuestSessionToken(res.body.token);
    expect(decoded.sid).toBe(res.body.sessionId);
  });

  it('returns two different session identifiers on two consecutive calls', async () => {
    const app = buildApp();
    const first = await request(app).get('/auth/guest-session');
    const second = await request(app).get('/auth/guest-session');

    expect(first.body.sessionId).not.toBe(second.body.sessionId);
  });

  it('performs no database query — a guest session is never persisted', async () => {
    await request(buildApp()).get('/auth/guest-session');

    expect(query).not.toHaveBeenCalled();
  });
});

describe('POST /auth/refresh', () => {
  // Interop proof, run first (per explicit instruction carried over from
  // plan 01-01): the Module._load bridge (backend/src/test/setup.js) makes
  // auth.js's own top-level `require('../db')` resolve to the mock. (Plan
  // 01-02 additionally mocks config/passport for the OAuth callback tests
  // above, so this route's require chain no longer passes through the REAL
  // config/passport.js — but auth.js's direct db require still needs the
  // bridge, and this is that proof.)
  it('reaches the mocked query through auth.js and returns 401 for a cookie matching no live row', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await request(buildApp())
      .post('/auth/refresh')
      .set('Cookie', ['refresh_token=does-not-match-any-row']);

    expect(query).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(401);
  });

  it('returns 401 with success:false when no refresh cookie is present', async () => {
    const res = await request(buildApp()).post('/auth/refresh');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    // The handler short-circuits before ever touching the database.
    expect(query).not.toHaveBeenCalled();
  });

  it('rotates the refresh token on a successful refresh: revokes the presented row and issues a replacement', async () => {
    // Three resolutions in handler order: SELECT (matching row), UPDATE
    // (revoke), INSERT (replacement token, from the real generateRefreshToken).
    query.mockResolvedValueOnce({ rows: [{ user_id: 'user-123', role: 'admin', id: 'token-row-1' }] });
    query.mockResolvedValueOnce({});
    query.mockResolvedValueOnce({});

    const res = await request(buildApp())
      .post('/auth/refresh')
      .set('Cookie', ['refresh_token=a-token-matching-a-live-row']);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.access_token).toBe('string');

    const decoded = jwt.decode(res.body.access_token);
    expect(decoded.sub).toBe('user-123');
    expect(decoded.role).toBe('admin');

    // Token-rotation semantics D-14 protects against concurrent refresh
    // calls: both the revocation and the reissue must reach the mocked db.
    expect(query).toHaveBeenCalledTimes(3);

    const [revokeSql, revokeParams] = query.mock.calls[1];
    expect(revokeSql).toMatch(/UPDATE refresh_tokens SET revoked_at/i);
    expect(revokeParams).toEqual(['token-row-1']);

    const [insertSql] = query.mock.calls[2];
    expect(insertSql).toMatch(/INSERT INTO refresh_tokens/i);

    const setCookieHeader = res.headers['set-cookie'] || [];
    expect(setCookieHeader.some((c) => c.startsWith('refresh_token='))).toBe(true);
  });
});

describe('POST /auth/register (D-17 second site: admin role deferred to verification)', () => {
  // backend/src/routes/auth.js:52 used to write role:'admin' directly at
  // registration whenever email === ADMIN_EMAIL, even though is_verified
  // was simultaneously set to false — a dormant unverified admin row, same
  // root cause as passport.js:26's OAuth elevation path (D-17). Fixed by
  // always inserting role:'visitor' here and promoting only in GET
  // /auth/verify, below.
  const ADMIN_EMAIL = 'admin@example.com';
  let originalAdminEmail;

  beforeAll(() => {
    originalAdminEmail = process.env.ADMIN_EMAIL;
    process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  });

  afterAll(() => {
    if (originalAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = originalAdminEmail;
  });

  it('always inserts role visitor, even when the submitted email matches ADMIN_EMAIL', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // existing-email check: no match
    query.mockResolvedValueOnce({
      rows: [{ id: 'u-1', email: ADMIN_EMAIL, display_name: 'Admin Wannabe', avatar_url: null, role: 'visitor', is_verified: false, created_at: new Date() }],
    }); // INSERT

    const res = await request(buildApp())
      .post('/auth/register')
      .send({ email: ADMIN_EMAIL, password: 'password123', display_name: 'Admin Wannabe' });

    // The real mailer module runs unmocked here (no SMTP configured in the
    // test env), so it throws and the route's catch responds 201 with
    // mailError:true — this assertion only cares that registration itself
    // succeeded, not the mail outcome.
    expect([200, 201]).toContain(res.status);

    const insertCall = query.mock.calls.find(([sql]) => /INSERT INTO users/i.test(sql));
    expect(insertCall).toBeDefined();
    const [insertSql] = insertCall;
    // role is now a SQL literal ('visitor'), not a bound parameter fed by
    // an isAdmin computed at registration time — assert the literal is
    // present and unconditional, independent of the submitted email.
    expect(insertSql).toMatch(/VALUES \(\$1, \$2, \$3, 'visitor', false/);
  });
});

describe('GET /auth/verify (D-17 second site: admin role granted only at verification)', () => {
  const ADMIN_EMAIL = 'admin@example.com';
  let originalAdminEmail;

  beforeAll(() => {
    originalAdminEmail = process.env.ADMIN_EMAIL;
    process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  });

  afterAll(() => {
    if (originalAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = originalAdminEmail;
  });

  it('promotes role to admin in the same UPDATE only when the just-verified email matches ADMIN_EMAIL', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    query.mockResolvedValueOnce({
      rows: [{ id: 'u-1', email: ADMIN_EMAIL, display_name: 'Admin Wannabe', role: 'visitor', is_verified: false, verification_expires_at: future }],
    });
    query.mockResolvedValueOnce({}); // UPDATE

    const res = await request(buildApp()).get('/auth/verify').query({ token: 'sometoken' });

    expect(res.status).toBe(200);
    const [updateSql, updateParams] = query.mock.calls[1];
    expect(updateSql).toMatch(/UPDATE users/i);
    expect(updateSql).toMatch(/role = CASE WHEN \$2 THEN 'admin' ELSE role END/i);
    expect(updateParams[1]).toBe(true);
  });

  it('does not promote when the verified email does not match ADMIN_EMAIL — role stays whatever it already was', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    query.mockResolvedValueOnce({
      rows: [{ id: 'u-2', email: 'nobody@example.com', display_name: 'Nobody', role: 'visitor', is_verified: false, verification_expires_at: future }],
    });
    query.mockResolvedValueOnce({});

    const res = await request(buildApp()).get('/auth/verify').query({ token: 'sometoken' });

    expect(res.status).toBe(200);
    const [, updateParams] = query.mock.calls[1];
    expect(updateParams[1]).toBe(false);
  });

  it('still enforces the existing expiry gate: an expired token is rejected before any promotion logic runs (proves the gate itself was not weakened)', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    query.mockResolvedValueOnce({
      rows: [{ id: 'u-3', email: ADMIN_EMAIL, display_name: 'Admin Wannabe', role: 'visitor', is_verified: false, verification_expires_at: past }],
    });

    const res = await request(buildApp()).get('/auth/verify').query({ token: 'expiredtoken' });

    expect(res.status).toBe(400);
    // Only the SELECT ran — the UPDATE (and therefore any admin promotion)
    // never happens for an expired token.
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('POST /auth/logout', () => {
  it('returns 401 without an Authorization header (sits behind the authenticate middleware)', async () => {
    const res = await request(buildApp()).post('/auth/logout');

    expect(res.status).toBe(401);
  });

  it('returns 200 and clears the refresh cookie at the root path for a valid access token (D-03)', async () => {
    const accessToken = generateAccessToken('user-123', 'admin');

    const res = await request(buildApp())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const setCookieHeader = res.headers['set-cookie'] || [];
    const clearingCookie = setCookieHeader.find((c) => c.startsWith('refresh_token='));
    expect(clearingCookie).toBeDefined();

    // D-03: setRefreshTokenCookie (backend/src/utils/jwt.js) SETS this
    // cookie at the root path, so clearing it must use the same path or the
    // browser never actually drops it. Plan 01-01 deliberately pinned
    // today's buggy '/auth' clearing path without asserting on it; plan
    // 01-02 fixes the mismatch, and this assertion is the evidence the fix
    // landed — it fails against the unmodified implementation.
    const pathMatch = clearingCookie.match(/Path=([^;]+)/i);
    expect(pathMatch?.[1]).toBe('/');
  });
});
