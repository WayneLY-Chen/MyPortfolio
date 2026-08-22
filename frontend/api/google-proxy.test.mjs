// 用 Node 內建測試執行器測試共享密鑰閘門（D-04/D-05）。
// frontend/ 沒有安裝任何測試框架，本計畫不引入 —— 直接用 node:test + node:assert/strict。
// 執行方式：node --test frontend/api/google-proxy.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from './google-proxy.js';

// 手刻 res stub：status() 回傳 this 以支援鏈式呼叫，並記錄收到的狀態碼與 body 供斷言。
function createRes() {
  const res = {
    statusCode: undefined,
    body: undefined,
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    end(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

// 每個測試案例自行設定與還原 INTERNAL_PROXY_KEY，不依賴外部環境。
function withEnvKey(value, fn) {
  const original = process.env.INTERNAL_PROXY_KEY;
  if (value === undefined) delete process.env.INTERNAL_PROXY_KEY;
  else process.env.INTERNAL_PROXY_KEY = value;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (original === undefined) delete process.env.INTERNAL_PROXY_KEY;
      else process.env.INTERNAL_PROXY_KEY = original;
    });
}

test('INTERNAL_PROXY_KEY 未設定 → 503（fail-closed，不再寬限放行）', async () => {
  await withEnvKey(undefined, async () => {
    // 密鑰缺席時必須在碰到 GEMINI_API_KEY 之前就擋下來。req.url 指向合法的
    // proxy 路徑，證明擋下來的原因是閘門本身，而非後續 URL 解析失敗。
    const req = { method: 'POST', url: '/api/google-proxy/v1beta/models', headers: {} };
    const res = createRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 503);
    assert.deepStrictEqual(res.body, { error: 'Proxy not configured' });
  });
});

test('未設定 PROXY_ALLOWED_ORIGINS 時不得回傳 CORS 標頭', async () => {
  await withEnvKey('test-only-secret-value', async () => {
    const req = {
      method: 'OPTIONS',
      url: '/api/google-proxy/v1beta/models',
      headers: { origin: 'https://evil.example' },
    };
    const res = createRes();
    await handler(req, res);
    assert.strictEqual(res.headers['Access-Control-Allow-Origin'], undefined);
  });
});

test('INTERNAL_PROXY_KEY 已設定、請求帶錯誤的標頭值 → 401', async () => {
  await withEnvKey('test-only-secret-value', async () => {
    const req = {
      method: 'POST',
      url: '/api/google-proxy/v1beta/models',
      headers: { 'x-internal-proxy-key': 'wrong-value' },
    };
    const res = createRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 401);
    assert.deepStrictEqual(res.body, { error: 'Unauthorized' });
  });
});

test('INTERNAL_PROXY_KEY 已設定、請求帶正確標頭、但 req.url 不含 /api/google-proxy/ → 400（證明已通過閘門）', async () => {
  await withEnvKey('test-only-secret-value', async () => {
    // 帶正確標頭卻得到 400 而非 401，證明請求真的通過了閘門 —— 否則會停在 401。
    // 同時因為 URL 解析在 fetch 之前就失敗，測試不需要任何網路存取。
    const req = {
      method: 'POST',
      url: '/some/other/path',
      headers: { 'x-internal-proxy-key': 'test-only-secret-value' },
    };
    const res = createRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 400);
  });
});

// ---------------------------------------------------------------------------
// 共享密鑰的固定時間比對
//
// 定位：防禦深度，不是在修一個可被利用的漏洞（理由見 google-proxy.js 內的
// 註解——隔著網際網路與 serverless 冷啟動抖動，時間側通道在此不可利用）。
// 這組測試鎖的是「行為與原本的 !== 完全一致」：正確的密鑰仍然放行、錯的仍然
// 擋下，而且不會因為兩邊長度不同而讓 timingSafeEqual 拋錯。
const PROXY_PATH = '/api/google-proxy/v1beta/models';

test('正確的密鑰仍然放行（不再被閘門擋下）', async () => {
  await withEnvKey('correct-secret-value', async () => {
    const req = {
      method: 'POST',
      url: PROXY_PATH,
      headers: { 'x-internal-proxy-key': 'correct-secret-value' },
      body: {},
    };
    const res = createRes();
    await handler(req, res);
    assert.notStrictEqual(res.statusCode, 401, '正確的密鑰不該被擋下');
  });
});

// timingSafeEqual 對長度不同的 Buffer 會直接拋錯，因此實作先各自 SHA-256
// 再比對摘要（永遠 32 位元組）。這幾個長度各異的值就是在鎖這件事。
test('錯誤的密鑰擋下，長度不同也不拋錯', async () => {
  await withEnvKey('correct-secret-value', async () => {
    for (const bad of ['wrong', '', 'correct-secret-valuX', 'correct-secret-value-plus-extra']) {
      const req = { method: 'POST', url: PROXY_PATH, headers: { 'x-internal-proxy-key': bad }, body: {} };
      const res = createRes();
      await handler(req, res);
      assert.strictEqual(res.statusCode, 401, `密鑰 ${JSON.stringify(bad)} 應被擋下`);
    }
  });
});

test('完全沒帶標頭時擋下，不拋錯', async () => {
  await withEnvKey('correct-secret-value', async () => {
    const req = { method: 'POST', url: PROXY_PATH, headers: {}, body: {} };
    const res = createRes();
    await handler(req, res);
    assert.strictEqual(res.statusCode, 401);
  });
});
