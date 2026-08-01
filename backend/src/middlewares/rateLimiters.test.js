import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// Must be the first statements, before every other import — same requirement
// documented in backend/src/routes/auth.test.js: vi.mock('../db') must
// precede the router import so auth.js's internal CommonJS
// require('../db')/require('../config/passport') resolve to the mocked
// versions via the Module._load bridge in backend/src/test/setup.js.
vi.mock('../db');
vi.mock('../config/passport');

import { createRequire } from 'node:module';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { ipKeyGenerator } from 'express-rate-limit';
import authRouter from '../routes/auth.js';
import aiRouter from '../routes/ai.js';
import commentsRouter from '../routes/comments.js';
import { generateAccessToken } from '../utils/jwt.js';
import { query } from '../db';
import { __instances } from '../test/__mocks__/msedge-tts.js';

// rateLimiters.js is plain CommonJS, reached here via a static ESM `import`
// at the top of this file — per the interop note established in
// projects.test.js (backend/src/routes/projects.test.js), a static
// `import { commentsLimiter } from './rateLimiters.js'` would resolve
// through Vite's SSR module graph and land on a SEPARATE module instance
// from the one auth.js/ai.js/comments.js/projects.js reach via their own
// internal `require('../middlewares/rateLimiters')` calls — resetKey() on
// that separate instance would silently do nothing to the limiter the
// actual mounted routes use. Verified empirically this session: with a
// plain `import`, the "two different users independently bucketed" test
// failed on its very first request because a prior test's resetKey() calls
// had reset the wrong (test-file-local) instance, leaving the REAL
// commentsLimiter still holding the previous test's 21 accumulated hits.
// createRequire gives a genuine native require, resolving through the exact
// same real Module cache every router's nested require uses.
const nodeRequire = createRequire(import.meta.url);
const { loginLimiter, aiLimiter, ttsLimiter, commentsLimiter } = nodeRequire('./rateLimiters.js');

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

// Fresh, minimal apps for the AI and comments routers — same convention,
// mounted at the exact paths backend/src/index.js uses.
const buildAiApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/ai', aiRouter);
  return app;
};

const buildCommentsApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/comments', commentsRouter);
  return app;
};

// supertest/superagent defers actual HTTP dispatch until something calls
// .then() on the returned Test object (verified empirically in 02-02, see
// ai.test.js's identical helper) — force dispatch immediately so the
// in-flight request can be driven to completion via the mocked msedge-tts
// stream before this helper's own caller awaits the response.
function fireTtsRequest(app, body) {
  const req = request(app).post('/api/ai/tts').send(body);
  return new Promise((resolve, reject) => req.then(resolve, reject));
}

// Polls with the real (unfaked) setImmediate — no fake timers are needed in
// this file's TTS test, since every request is driven to completion via a
// manually-emitted 'end' event well within the real 8s TTS_TIMEOUT_MS, so
// nothing ever needs the timeout branch to actually fire. Detects a NEW
// instance by comparing __instances.length against the count captured right
// before firing the request, rather than __lastInstance() alone — this file
// fires many /tts requests in a single test (unlike ai.test.js's one-request-
// per-test shape), so relying on "instance exists" instead of "a NEW instance
// exists" would resolve immediately to the PREVIOUS iteration's instance.
async function waitForNewTtsInstance(previousCount, maxTries = 50) {
  for (let i = 0; i < maxTries; i += 1) {
    if (__instances.length > previousCount) return __instances[__instances.length - 1];
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('MsEdgeTTS instance was never constructed — request did not reach the handler');
}

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

describe('commentsLimiter on POST /api/comments (REL-06, D-06/D-07)', () => {
  // Two fixed synthetic user ids, reused across both tests below — reset
  // both before every test so one test's quota usage can never leak into
  // the other (same reset convention Task 1 established for IP keys).
  const USER_A = 'comments-user-A';
  const USER_B = 'comments-user-B';

  beforeEach(() => {
    commentsLimiter.resetKey(USER_A);
    commentsLimiter.resetKey(USER_B);
    // vitest.config.mjs's mockReset:true already clears query's call history
    // and any queued resolved values before every test; this just supplies
    // the resolved value addComment's INSERT ... RETURNING needs to not throw.
    query.mockResolvedValue({
      rows: [{ id: 1, author_name: '訪客', content: '測試留言內容', created_at: new Date().toISOString(), user_id: USER_A }],
    });
  });

  const postComment = (app, userId) =>
    request(app)
      .post('/api/comments')
      .set('Authorization', `Bearer ${generateAccessToken(userId, 'visitor')}`)
      .send({ type: 'blog', id: '1', content: '測試留言內容' });

  it('rejects the 21st comment within 10 minutes from the same user with the fixed 429 body', async () => {
    const app = buildCommentsApp();

    for (let i = 0; i < 20; i++) {
      // eslint-disable-next-line no-await-in-loop
      const res = await postComment(app, USER_A);
      expect(res.status).not.toBe(429);
    }

    const res21 = await postComment(app, USER_A);
    expect(res21.status).toBe(429);
    expect(res21.body).toEqual(RATE_LIMITED_BODY);
  });

  it('keeps two different authenticated users independently bucketed: neither is blocked after 20 comments each', async () => {
    const app = buildCommentsApp();

    for (let i = 0; i < 20; i++) {
      // eslint-disable-next-line no-await-in-loop
      const resA = await postComment(app, USER_A);
      expect(resA.status).not.toBe(429);
      // eslint-disable-next-line no-await-in-loop
      const resB = await postComment(app, USER_B);
      expect(resB.status).not.toBe(429);
    }
  });
});

describe('aiLimiter on POST /api/ai/summarize — unauthenticated, IP-keyed (REL-05, D-06)', () => {
  beforeEach(() => {
    aiLimiter.resetKey(clientKey);
  });

  it('rejects the 41st unauthenticated request within the hour with the fixed 429 body', async () => {
    const app = buildAiApp();
    const body = { type: 'blog', title: '測試標題', content: '測試內容，足夠長度以通過驗證。' };

    for (let i = 0; i < 40; i++) {
      // No Authorization header — matches today's actual frontend behavior
      // (verified in 02-RESEARCH.md), so this exercises aiLimiter's IP
      // fallback branch. The handler itself replies 500 in this test env
      // (no GEMINI_API_KEY set) — irrelevant to this test, which only
      // asserts whether the limiter blocked the request.
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post('/api/ai/summarize').send(body);
      expect(res.status).not.toBe(429);
    }

    const res41 = await request(app).post('/api/ai/summarize').send(body);
    expect(res41.status).toBe(429);
    expect(res41.body).toEqual(RATE_LIMITED_BODY);
  });
});

describe('ttsLimiter on POST /api/ai/tts — separate, generous bucket from aiLimiter (T-02-06)', () => {
  beforeEach(() => {
    ttsLimiter.resetKey(clientKey);
  });

  it('does not 429 the 41st unauthenticated request — /tts has its own 300/hour bucket, not aiLimiter\'s 40/hour', async () => {
    const app = buildAiApp();
    let previousInstanceCount = __instances.length;
    let lastRes;

    for (let i = 0; i < 41; i++) {
      // eslint-disable-next-line no-await-in-loop
      const resPromise = fireTtsRequest(app, { text: `測試第 ${i} 句語音內容` });
      // eslint-disable-next-line no-await-in-loop
      const inst = await waitForNewTtsInstance(previousInstanceCount);
      previousInstanceCount = __instances.length;
      // Drive the mocked stream to completion immediately (well within the
      // real 8s TTS_TIMEOUT_MS) so this test never needs fake timers — see
      // fireTtsRequest's comment above.
      inst.audioStream.emit('data', Buffer.from('mock-audio-chunk'));
      inst.audioStream.emit('end');
      // eslint-disable-next-line no-await-in-loop
      lastRes = await resPromise;
    }

    expect(lastRes.status).not.toBe(429);
  });
});
