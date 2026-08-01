import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// Must be the first statements, before every other import — same requirement
// documented in backend/src/routes/auth.test.js: vi.mock('../db') must
// precede the router import so auth.js's internal CommonJS
// require('../db')/require('../config/passport') resolve to the mocked
// versions via the Module._load bridge in backend/src/test/setup.js.
vi.mock('../db');
vi.mock('../config/passport');

import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { ipKeyGenerator } from 'express-rate-limit';
import authRouter from '../routes/auth.js';
import { loginLimiter } from './rateLimiters.js';

// Build a fresh, minimal Express app per call, mounting only the auth
// router — mirrors auth.test.js's own buildApp(). Never import
// backend/src/index.js itself (it calls server.listen()/initSockets() at
// module load and would bind a real port / boot a real Socket.io server).
const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/auth', authRouter);
  return app;
};

// express-rate-limit's MemoryStore is shared, module-level state for the
// lifetime of this test process. The middleware object rateLimit() returns
// only exposes resetKey(key)/getKey(key) — no store-wide reset method is
// reachable from outside the package (verified this session by reading the
// installed package's dist/index.cjs: MemoryStore itself has a resetAll(),
// but it is never bound onto the returned middleware). Every IP-keyed
// limiter in this file (loginLimiter's default keyGenerator today; a later
// task's aiLimiter/ttsLimiter req.userId || ipKeyGenerator(req.ip) fallback)
// therefore only needs ONE stable reset key per test run: this process's own
// loopback address, normalized the exact same way express-rate-limit
// normalizes it internally. Node reports local supertest connections as the
// IPv4-mapped IPv6 form "::ffff:127.0.0.1" in this environment; ipKeyGenerator
// collapses that to plain "127.0.0.1" (verified empirically this session),
// which is also what the package's own default keyGenerator produces for
// loginLimiter (no custom keyGenerator set — see rateLimiters.js).
let clientKey;
beforeAll(async () => {
  const probeApp = express();
  probeApp.get('/__probe_ip', (req, res) => res.json({ ip: req.ip }));
  const probeRes = await request(probeApp).get('/__probe_ip');
  clientKey = ipKeyGenerator(probeRes.body.ip);
});

// D-08: the fixed 429 body every limiter's shared `handler` in
// rateLimiters.js must return, verbatim.
const RATE_LIMITED_BODY = { success: false, message: '請求過於頻繁，請稍後再試' };

describe('loginLimiter on POST /auth/login (REL-04, D-07, D-08)', () => {
  beforeEach(() => {
    loginLimiter.resetKey(clientKey);
  });

  it('allows the first 10 requests within the 15-minute window and rejects the 11th with the fixed 429 body', async () => {
    const app = buildApp();

    // The mocked config/passport stub's `authenticate` ignores the
    // callback form entirely and always calls next() with a fixed fake user
    // (backend/src/config/__mocks__/passport.js) — so each of the first 10
    // requests here falls through to Express's own default 404 handling,
    // not a 200. That is expected and irrelevant to what this test verifies;
    // it must only assert "not 429", never a specific success status code.
    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'visitor@example.com', password: 'wrong-password-1' });
      expect(res.status).not.toBe(429);
    }

    const eleventh = await request(app)
      .post('/auth/login')
      .send({ email: 'visitor@example.com', password: 'wrong-password-1' });

    expect(eleventh.status).toBe(429);
    expect(eleventh.body).toEqual(RATE_LIMITED_BODY);
  });
});
