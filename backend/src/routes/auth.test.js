import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

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
import { _resetAllLimitersForTests } from '../middlewares/rateLimiters.js';

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
  // 這條先前斷言的是「沒有 Authorization header 就回 401」。那個行為本身就是
  // bug:access token 只活 15 分鐘，使用者在頁面上待久一點再按登出，請求會在
  // 進到路由本體之前就被擋掉 —— refresh token 沒撤銷、cookie 沒清掉，而前端
  // 已經把本地狀態清乾淨，人以為自己登出了。下次進站 silentRefresh 拿那張還
  // 活著的 cookie 一換就又登入了。「登出在最需要它的時候失效」是這裡最嚴重的
  // 失效模式，所以端點改掛 optionalAuthenticate，斷言也跟著改成新的意圖。
  it('沒有 Authorization header 也要能登出 —— access token 過期不該讓人登不出去', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // 撤銷 refresh token 的 UPDATE
    const res = await request(buildApp())
      .post('/auth/logout')
      .set('Cookie', ['refresh_token=some-raw-token']);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // 撤銷是靠 cookie 本身算出來的 hash，不需要另一個有效的 access token
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE refresh_tokens SET revoked_at'),
      expect.any(Array),
    );
  });

  // 清除用的屬性必須與 utils/jwt.js 的 setRefreshTokenCookie 逐項一致。前後端
  // 不同網域(Vercel / Render)，登出是跨站請求 —— 少了 SameSite=None 的
  // Set-Cookie 會被瀏覽器當成預設的 Lax 而在跨站情境整個丟棄，結果是伺服器端
  // 撤銷成功、瀏覽器裡那張 cookie 卻原封不動，而且完全不報錯。
  it('清除 cookie 的屬性與寫入時一致(HttpOnly / Secure / SameSite=None / Path=/)', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const res = await request(buildApp())
      .post('/auth/logout')
      .set('Cookie', ['refresh_token=some-raw-token']);

    const clearing = (res.headers['set-cookie'] || []).find((c) => c.startsWith('refresh_token='));
    expect(clearing).toBeDefined();
    expect(clearing).toMatch(/HttpOnly/i);
    expect(clearing).toMatch(/Secure/i);
    expect(clearing).toMatch(/SameSite=None/i);
    expect(clearing).toMatch(/Path=\//i);
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

// ---------------------------------------------------------------------------
// 第三輪資安修補的回歸測試
describe('第三輪：限流、refresh token 撤銷、is_active、輸入驗證', () => {
  beforeEach(() => {
    _resetAllLimitersForTests();
  });

  // POST /auth/reset-password 先前只更新 password_hash。refresh token 的效期
  // 是 30 天，因此攻擊者手上只要有一份還沒過期的 refresh cookie，受害者改完
  // 密碼之後他仍能繼續換發 access token —— 改密碼卻趕不走入侵者，等於沒改。
  it('重設密碼會撤銷該帳號目前所有的 refresh token', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'u-1', email: 'a@example.com' }] }); // 找 token
    query.mockResolvedValueOnce({ rows: [] });                                      // UPDATE 密碼
    query.mockResolvedValueOnce({ rows: [], rowCount: 3 });                         // 撤銷 refresh token

    const res = await request(buildApp())
      .post('/auth/reset-password')
      .send({ token: 'reset-token', newPassword: 'a-very-good-password' });

    expect(res.status).toBe(200);
    const revokeCall = query.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('refresh_tokens') && c[0].includes('revoked_at = NOW()')
    );
    expect(revokeCall, '沒有執行撤銷 refresh token 的 UPDATE').toBeDefined();
    expect(revokeCall[0]).toContain('user_id = $1');
    expect(revokeCall[1]).toEqual(['u-1']);
  });

  // 本專案在登入、忘記密碼、重寄驗證信、重設密碼四處都檢查 is_active，
  // 唯獨 /auth/refresh 沒有 —— 被停用的帳號可以靠既有 cookie 續命 30 天。
  it('/auth/refresh 的查詢帶上 is_active = true', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(buildApp()).post('/auth/refresh').set('Cookie', ['refresh_token=x']);
    expect(query.mock.calls[0][0]).toContain('u.is_active = true');
  });

  it('register 擋掉非字串與格式錯誤的 email、超長的 display_name、過短的密碼', async () => {
    for (const body of [
      { email: 123, password: 'password123', display_name: 'n' },
      { email: 'notanemail', password: 'password123', display_name: 'n' },
      { email: 'a@b.com', password: 'password123', display_name: 'x'.repeat(51) },
      { email: 'a@b.com', password: 'short', display_name: 'n' },
      { email: 'a@b.com', password: 'x'.repeat(201), display_name: 'n' },
    ]) {
      const res = await request(buildApp()).post('/auth/register').send(body);
      expect(res.status, `${JSON.stringify(body).slice(0, 60)} 應回 400`).toBe(400);
    }
    // 全部都應該在碰資料庫之前就被擋下
    expect(query).not.toHaveBeenCalled();
  });

  // 兩個會寄信的端點先前完全沒有限流。它們都以 body 的 email 決定收件人，
  // 因此沒有限流等於「任何人都能無限次觸發寄信到別人的信箱」。
  it.each([
    ['/auth/forgot-password'],
    ['/auth/resend-verification'],
  ])('%s 超過 15 分鐘 5 次之後回 429', async (path) => {
    query.mockResolvedValue({ rows: [] });
    const app = buildApp();
    const statuses = [];
    for (let i = 0; i < 7; i++) {
      const res = await request(app).post(path).send({ email: 'victim@example.com' });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5).every((s) => s !== 429), `前 5 次不該被擋: ${statuses}`).toBe(true);
    expect(statuses[5]).toBe(429);
    expect(statuses[6]).toBe(429);
  });
});

describe('Email 大小寫（第四輪）', () => {
  beforeEach(() => {
    _resetAllLimitersForTests();
  });

  // 修補前這六處全部是逐字比對，因此同一個信箱可以註冊出兩個帳號，
  // 而用大寫註冊的人打小寫會登不進去。
  it('register 的唯一性檢查以 LOWER() 比對', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });
    const res = await request(buildApp())
      .post('/auth/register')
      .send({ email: 'A@Example.com', password: 'password123', display_name: 'n' });

    expect(query.mock.calls[0][0]).toContain('LOWER(email) = LOWER($1)');
    expect(res.status).toBe(409);
  });

  it('register 寫入的 email 一律是小寫', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    query.mockResolvedValueOnce({ rows: [{ id: 'u1', email: 'a@example.com', display_name: 'n', role: 'visitor' }] });

    await request(buildApp())
      .post('/auth/register')
      .send({ email: '  A@Example.COM  ', password: 'password123', display_name: 'n' });

    expect(query.mock.calls[1][1][0]).toBe('a@example.com');
  });

  it('忘記密碼與重寄驗證信也以 LOWER() 比對', async () => {
    query.mockResolvedValue({ rows: [] });
    await request(buildApp()).post('/auth/forgot-password').send({ email: 'A@Example.com' });
    expect(query.mock.calls[0][0]).toContain('LOWER(email) = LOWER($1)');

    query.mockClear();
    await request(buildApp()).post('/auth/resend-verification').send({ email: 'A@Example.com' });
    expect(query.mock.calls[0][0]).toContain('LOWER(email) = LOWER($1)');
  });

  it('ADMIN_EMAIL 的比對不分大小寫，但 ADMIN_EMAIL 未設定時絕不提權', async () => {
    const original = process.env.ADMIN_EMAIL;

    // 大小寫不同仍然提權
    process.env.ADMIN_EMAIL = 'Admin@Example.com';
    query.mockResolvedValueOnce({
      rows: [{ id: 'u1', email: 'admin@example.com', display_name: 'a', role: 'visitor', is_verified: false, verification_expires_at: new Date(Date.now() + 3600_000) }],
    });
    query.mockResolvedValueOnce({ rows: [] });
    await request(buildApp()).get('/auth/verify').query({ token: 't1' });
    expect(query.mock.calls[1][1][1], '大小寫不同時仍應提權').toBe(true);

    // ADMIN_EMAIL 未設定時，任何帳號都不得被提權
    query.mockClear();
    delete process.env.ADMIN_EMAIL;
    query.mockResolvedValueOnce({
      rows: [{ id: 'u2', email: 'someone@example.com', display_name: 'b', role: 'visitor', is_verified: false, verification_expires_at: new Date(Date.now() + 3600_000) }],
    });
    query.mockResolvedValueOnce({ rows: [] });
    await request(buildApp()).get('/auth/verify').query({ token: 't2' });
    expect(query.mock.calls[1][1][1], 'ADMIN_EMAIL 未設定時不得提權').toBe(false);

    if (original === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = original;
  });
});
