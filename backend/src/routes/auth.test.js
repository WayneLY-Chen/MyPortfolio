import { describe, it, expect, vi } from 'vitest';

// Must be the first statement, before every other import.
vi.mock('../db');

import jwt from 'jsonwebtoken';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import authRouter from './auth.js';
import { generateAccessToken } from '../utils/jwt.js';
import { query } from '../db';

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

describe('POST /auth/refresh', () => {
  // Interop proof, run first (per explicit instruction): Task 1/2 proved the
  // Module._load bridge (backend/src/test/setup.js) works for jwt.js, a
  // single-hop require('../db'). auth.js is a strictly harder case — it
  // requires ../config/passport (which ALSO requires ../db) in addition to
  // its own direct require('../db'), and is reached here through
  // supertest -> express -> the mounted router, not a plain function call.
  // This held (verified before writing anything else in this file), and
  // this test also doubles as the plan's "cookie matching no live row"
  // behavior.
  it('reaches the mocked query through auth.js (and its config/passport.js dependency) and returns 401 for a cookie matching no live row', async () => {
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

  it('returns 200 and clears the refresh cookie for a valid access token', async () => {
    const accessToken = generateAccessToken('user-123', 'admin');

    const res = await request(buildApp())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const setCookieHeader = res.headers['set-cookie'] || [];
    const clearingCookie = setCookieHeader.find((c) => c.startsWith('refresh_token='));
    expect(clearingCookie).toBeDefined();
    // Deliberately NOT asserting the cookie's Path attribute here: today it
    // is cleared with path '/auth' (auth.js:347) while it was SET with path
    // '/' (jwt.js's setRefreshTokenCookie — pinned in jwt.test.js's
    // "setRefreshTokenCookie" describe block). The two paths never match in
    // a real browser, so logout does not actually clear the cookie — this
    // is the exact D-03 bug. This is a known, intentional omission: plan
    // 01-02 fixes the mismatch, and that fix should show up as a NEW
    // assertion added to this test (asserting `path=/`), not as a
    // pre-existing failure discovered later.
  });
});
