import { describe, it, expect, vi } from 'vitest';

// Must be the first statements, before every other import.
vi.mock('../db');
vi.mock('../config/passport');

import jwt from 'jsonwebtoken';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import authRouter from './auth.js';
import { generateAccessToken } from '../utils/jwt.js';
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
