import { describe, it, expect, vi } from 'vitest';

vi.mock('../db');

import express from 'express';
import request from 'supertest';
import { guardRouter, wrapAsync } from './asyncGuard.js';

// 與 backend/src/index.js:155 的全域錯誤中介層同形狀，用來確認 rejection 真的
// 被導到錯誤鏈上，而不是只是「沒有掛住」。
const buildApp = (router, { guard = true } = {}) => {
  const app = express();
  app.use(express.json());
  app.use('/t', guard ? guardRouter(router) : router);
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ success: false, handled: true, message: err.message });
  });
  return app;
};

// 同時攔 unhandledRejection：修補前的失敗模式不是「回了 500」，而是
// 「請求永遠不回應 + 一個未攔截的 rejection」，只斷言狀態碼區分不出來。
const probe = async (app, path = '/t/boom') => {
  const rejections = [];
  const onRejection = (reason) => rejections.push(reason);
  process.on('unhandledRejection', onRejection);
  const res = await Promise.race([
    request(app).get(path),
    new Promise((resolve) => setTimeout(() => resolve({ status: 'HUNG-NO-RESPONSE', body: {} }), 1500)),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 100));
  process.off('unhandledRejection', onRejection);
  return { status: res.status, body: res.body, rejections: rejections.map((r) => String(r && r.message)) };
};

describe('guardRouter', () => {
  // 這一則先證明「沒有 guard 時確實會掛住」，後面每一則的通過才有意義。
  it('SANITY：沒有 guard 時，async handler 的 rejection 會讓請求掛住並產生未攔截的 rejection', async () => {
    const router = express.Router();
    router.get('/boom', async () => {
      const notAString = 12345;
      notAString.split(''); // 與 /generate-image 實際爆掉的位置同型
    });

    const out = await probe(buildApp(router, { guard: false }));
    expect(out.status).toBe('HUNG-NO-RESPONSE');
    expect(out.rejections).toEqual(['notAString.split is not a function']);
  }, 10000);

  it('包上之後，同一個 rejection 走到錯誤中介層', async () => {
    const router = express.Router();
    router.get('/boom', async () => {
      const notAString = 12345;
      notAString.split('');
    });

    const out = await probe(buildApp(router));
    expect(out.status).toBe(500);
    expect(out.body.handled).toBe(true);
    expect(out.rejections, '不該再有未攔截的 rejection').toEqual([]);
  }, 10000);

  it('同步拋出的例外仍然走到錯誤中介層（不因為包了而退化）', async () => {
    const router = express.Router();
    router.get('/boom', () => {
      throw new Error('同步錯誤');
    });

    const out = await probe(buildApp(router));
    expect(out.status).toBe(500);
    expect(out.body.message).toBe('同步錯誤');
  }, 10000);

  it('正常回應不受影響', async () => {
    const router = express.Router();
    router.get('/ok', async (_req, res) => res.json({ success: true, value: 42 }));

    const res = await request(buildApp(router)).get('/t/ok');
    expect(res.status).toBe(200);
    expect(res.body.value).toBe(42);
  });

  it('同一條路由上的多個 handler 都會被包（middleware 也算）', async () => {
    const router = express.Router();
    const mw = async () => {
      throw new Error('middleware 爆炸');
    };
    router.get('/boom', mw, (_req, res) => res.json({ reached: true }));

    const out = await probe(buildApp(router));
    expect(out.status).toBe(500);
    expect(out.body.message).toBe('middleware 爆炸');
    expect(out.rejections).toEqual([]);
  }, 10000);

  it('router 內部的錯誤中介層（arity 4）不會被包壞', async () => {
    const router = express.Router();
    router.get('/boom', async () => {
      throw new Error('原始錯誤');
    });
    // eslint-disable-next-line no-unused-vars
    router.use((err, _req, res, _next) => {
      res.status(418).json({ fromRouterErrorHandler: true, message: err.message });
    });

    const out = await probe(buildApp(router));
    expect(out.status, 'router 自己的錯誤中介層應該仍然生效').toBe(418);
    expect(out.body.fromRouterErrorHandler).toBe(true);
  }, 10000);

  it('巢狀 router 也會被包', async () => {
    const inner = express.Router();
    inner.get('/boom', async () => {
      throw new Error('巢狀爆炸');
    });
    const outer = express.Router();
    outer.use('/nested', inner);

    const out = await probe(buildApp(outer), '/t/nested/boom');
    expect(out.status).toBe(500);
    expect(out.body.message).toBe('巢狀爆炸');
    expect(out.rejections).toEqual([]);
  }, 10000);

  it('重複呼叫是安全的，不會包兩次', async () => {
    const router = express.Router();
    router.get('/ok', async (_req, res) => res.json({ ok: true }));
    guardRouter(router);
    guardRouter(router);
    guardRouter(router);

    const handlers = router.stack[0].route.stack.map((l) => l.handle);
    expect(handlers.every((h) => h.__asyncGuarded)).toBe(true);

    const res = await request(buildApp(router)).get('/t/ok');
    expect(res.status).toBe(200);
  });

  it('傳入非 router 的東西不會爆炸', () => {
    expect(() => guardRouter(null)).not.toThrow();
    expect(() => guardRouter(undefined)).not.toThrow();
    expect(() => guardRouter({})).not.toThrow();
  });
});

describe('wrapAsync', () => {
  it('回傳非 Promise 的 handler 原樣運作', () => {
    const next = vi.fn();
    const wrapped = wrapAsync((_req, res) => res.sentinel = 'done');
    const res = {};
    wrapped({}, res, next);
    expect(res.sentinel).toBe('done');
    expect(next).not.toHaveBeenCalled();
  });

  it('async handler reject 時呼叫 next(err)', async () => {
    const next = vi.fn();
    const boom = new Error('boom');
    const wrapped = wrapAsync(async () => {
      throw boom;
    });
    // 刻意不 await 回傳值：wrapAsync 原樣回傳 handler 的 Promise（Express 也
    // 不會去 await 它），await 它會讓這個 reject 在測試本身重新拋出。
    // 要驗的是「.catch(next) 有沒有接到」，不是回傳值。
    wrapped({}, {}, next);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(next).toHaveBeenCalledWith(boom);
  });
});
