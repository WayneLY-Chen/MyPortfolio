import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Must be the first statements, before every other import.
vi.mock('../db');

import express from 'express';
import request from 'supertest';
import aiRouter from './ai.js';
import { __lastInstance, __resetInstances } from '../test/__mocks__/msedge-tts.js';

// Build a fresh, minimal Express app per test, mounting only the ai router —
// mirrors backend/src/index.js's real mount point but never imports
// backend/src/index.js itself, which calls server.listen()/initSockets() at
// module load (same convention as auth.test.js / projects.test.js).
const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/ai', aiRouter);
  return app;
};

// supertest/superagent defers the actual HTTP dispatch until something calls
// `.then()` on the returned Test object — it is a "thenable", not a real
// Promise, so merely holding a reference to
// `request(app).post(...).send(...)` performs no I/O at all yet (verified
// empirically this session: polling for the mocked instance before forcing
// dispatch never finds it, with or without fake timers). These race tests
// need to inject stream events WHILE the request is in flight, so dispatch
// is forced immediately here by wrapping it in a genuine Promise, instead of
// deferring that first `.then()` call to a later top-level `await`.
function fireRequest(app, body) {
  const req = request(app).post('/api/ai/tts').send(body);
  return new Promise((resolve, reject) => req.then(resolve, reject));
}

// Polls with the real (unfaked) setImmediate until the route handler has
// constructed its MsEdgeTTS instance. `toFake: ['setTimeout', 'clearTimeout']`
// below deliberately leaves setImmediate real (default vi.useFakeTimers()
// fakes it too, verified empirically this session to deadlock this exact
// poll loop — nothing ever advances the fake immediate queue). The mocked
// setMetadata()/toStream() never touch real I/O, so the handler reaches the
// point of constructing its instance after only a same-process loopback
// HTTP round trip plus a couple of microtasks — this resolves in a handful
// of event-loop turns, nowhere near maxTries.
async function waitForInstance(maxTries = 50) {
  let inst = null;
  for (let i = 0; i < maxTries && !inst; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    inst = __lastInstance();
  }
  if (!inst) throw new Error('MsEdgeTTS instance was never constructed — request did not reach the handler');
  return inst;
}

// TTS_TIMEOUT_MS is not exported from ai.js (only the router is) — this
// mirrors its current value (Claude's Discretion, documented in
// 02-02-PLAN.md and 02-RESEARCH.md). If that constant ever changes, this
// value must be updated to match.
const TTS_TIMEOUT_MS = 8000;

beforeEach(() => {
  __resetInstances();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/ai/tts (REL-03: hard timeout + single-response guarantee)', () => {
  it('times out alone when no stream event ever fires: 504, and tts.close() releases the underlying WebSocket exactly once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const resPromise = fireRequest(buildApp(), { text: '你好，這是逾時測試' });
    const inst = await waitForInstance();

    vi.advanceTimersByTime(TTS_TIMEOUT_MS);
    const res = await resPromise;

    expect(res.status).toBe(504);
    expect(res.body).toEqual({ success: false, error: '語音合成逾時' });
    // The must_haves are explicit that a guard flag alone (stopping the
    // double HTTP response) without releasing the socket is a disguised
    // resource leak — this is the assertion that catches that regression.
    expect(inst.close).toHaveBeenCalledTimes(1);
  });

  it('completes normally when "end" fires first: 200 audio/mpeg, and the pending timeout is genuinely cancelled (not merely guarded)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const resPromise = fireRequest(buildApp(), { text: '你好' });
    const inst = await waitForInstance();

    inst.audioStream.emit('data', Buffer.from('mock-audio-chunk'));
    inst.audioStream.emit('end');
    const res = await resPromise;

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^audio\/mpeg/);

    // Prove clearTimeout actually cancelled the timer rather than a `sent`
    // flag merely masking one that is still pending: advance well past the
    // timeout window afterward. tts.close() is only ever called from the
    // timeout branch, so it must stay uncalled if cancellation is real.
    vi.advanceTimersByTime(TTS_TIMEOUT_MS);
    expect(inst.close).not.toHaveBeenCalled();
  });

  it('responds with the stream error first: 500, logs err.stack verbatim (REL-02 + UTF-8 integrity), and cancels the pending timeout', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const resPromise = fireRequest(buildApp(), { text: '你好' });
    const inst = await waitForInstance();

    const streamErr = new Error('模擬串流中斷：連線被對端關閉');
    inst.audioStream.emit('error', streamErr);
    const res = await resPromise;

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, error: '語音合成失敗' });

    // REL-02 + UTF-8 integrity: the logged value must be err.stack (always
    // truthy for a real Error) and must carry the multi-byte Chinese
    // message through byte-identical — not truncated, not mojibake.
    const loggedCall = consoleErrorSpy.mock.calls.find(([tag]) => tag === '[AI TTS] stream error:');
    expect(loggedCall).toBeDefined();
    expect(loggedCall[1]).toBe(streamErr.stack);
    expect(loggedCall[1]).toContain('模擬串流中斷：連線被對端關閉');

    vi.advanceTimersByTime(TTS_TIMEOUT_MS);
    expect(inst.close).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('race A: "end" then a late "error" on the same stream — still exactly one response (200)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const resPromise = fireRequest(buildApp(), { text: '你好' });
    const inst = await waitForInstance();

    inst.audioStream.emit('data', Buffer.from('abc'));
    inst.audioStream.emit('end');
    // Must not throw ERR_HTTP_HEADERS_SENT and must not attempt to mutate
    // the already-sent response.
    expect(() => inst.audioStream.emit('error', new Error('late error after end'))).not.toThrow();

    const res = await resPromise;
    expect(res.status).toBe(200);
  });

  it('race B: "error" then a late "close" on the same stream — still exactly one response (500)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const resPromise = fireRequest(buildApp(), { text: '你好' });
    const inst = await waitForInstance();

    inst.audioStream.emit('error', new Error('primary stream error'));
    expect(() => inst.audioStream.emit('close')).not.toThrow();

    const res = await resPromise;
    expect(res.status).toBe(500);
  });

  it('race C: timeout fires first, then late "end" and "close" arrive — still exactly one response (504)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const resPromise = fireRequest(buildApp(), { text: '你好' });
    const inst = await waitForInstance();

    vi.advanceTimersByTime(TTS_TIMEOUT_MS);
    const res = await resPromise;
    expect(res.status).toBe(504);

    expect(() => {
      inst.audioStream.emit('data', Buffer.from('too-late'));
      inst.audioStream.emit('end');
      inst.audioStream.emit('close');
    }).not.toThrow();

    // Still exactly one timeout-branch execution — the late events must be
    // fully absorbed by the `sent` guard.
    expect(inst.close).toHaveBeenCalledTimes(1);
  });

  it('race D: "close" and "end" both fire (msedge-tts 2.x ends on close, not always end) — still exactly one response', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const resPromise = fireRequest(buildApp(), { text: '你好' });
    const inst = await waitForInstance();

    inst.audioStream.emit('data', Buffer.from('abc'));
    inst.audioStream.emit('close');
    expect(() => inst.audioStream.emit('end')).not.toThrow();

    const res = await resPromise;
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^audio\/mpeg/);
  });
});

describe('POST /api/ai/tts (SSML 注入防護)', () => {
  // msedge-tts 的 _SSMLTemplate 是純字串內插、完全不跳脫：
  //   <voice name="${this._voice}"> ... ${input}
  // 而其 setMetadata() 對聲線的檢查只是未錨定的 /\w{2}-\w{2}/，
  // 字串裡任何位置有 xx-xx 就通過。以下兩個值修補前都能成功注入 SSML。
  const INJECTED_VOICE = "zh-CN\"><audio src=\"https://evil.example/x.mp3\"/><voice name=\"";
  const INJECTED_TEXT = "嗨<audio src=\"https://evil.example/x.mp3\"/>";

  it('注入用的聲線被換成預設值，不會原樣傳給 setMetadata', async () => {
    const resPromise = fireRequest(buildApp(), { text: "你好", voice: INJECTED_VOICE });
    const inst = await waitForInstance();
    inst.audioStream.emit('end');
    await resPromise;

    const passedVoice = inst.setMetadata.mock.calls[0][0];
    expect(passedVoice).toBe('zh-CN-XiaoxiaoNeural');
    expect(passedVoice).not.toContain('evil.example');
  });

  it('白名單內的聲線原樣傳遞，正常功能不受影響', async () => {
    const resPromise = fireRequest(buildApp(), { text: "hello", voice: 'en-US-AriaNeural' });
    const inst = await waitForInstance();
    inst.audioStream.emit('end');
    await resPromise;

    expect(inst.setMetadata.mock.calls[0][0]).toBe('en-US-AriaNeural');
  });

  it('文字裡的 SSML 標籤被 XML 跳脫，不會原樣進入合成內容', async () => {
    const resPromise = fireRequest(buildApp(), { text: INJECTED_TEXT });
    const inst = await waitForInstance();
    inst.audioStream.emit('end');
    await resPromise;

    const passedText = inst.toStream.mock.calls[0][0];
    expect(passedText).not.toContain("<audio");
    expect(passedText).toContain('&lt;audio');
  });

  it('超過長度上限的文字回 400，且完全不會建立 MsEdgeTTS 連線', async () => {
    const res = await fireRequest(buildApp(), { text: 'x'.repeat(2001) });
    expect(res.status).toBe(400);
    expect(__lastInstance()).toBeUndefined();
  });

  it('空白文字回 400', async () => {
    const res = await fireRequest(buildApp(), { text: '   ' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// /generate-image 與 /summarize 的輸入驗證（config/aiInputValidation.js）
//
// 這裡是路由層的回歸測試 —— 單元測試在 config/aiInputValidation.test.js。
// 兩邊都要，因為單元測試證明不了「路由真的呼叫了驗證函式」。
describe('POST /api/ai/generate-image 輸入驗證', () => {
  // 修補前的實測結果（vitest + supertest，STABILITY_API_KEY 未設定）：
  //
  //   prompt=12345 (number)  -> outcome=HUNG-NO-RESPONSE
  //                             unhandledRejections=["prompt.split is not a function"]
  //   prompt={a:1} (object)  -> 同上
  //   prompt=[1,2] (array)   -> 同上
  //   prompt=true (boolean)  -> 同上
  //   prompt="a cat" (string)-> outcome=200
  //
  // 請求永遠不回應，而 backend/src/index.js 沒有註冊 unhandledRejection
  // handler，Node 24 的預設行為是中止行程。也就是一個未登入的訪客送
  // {"prompt": 1} 就能讓整個後端掛掉。
  //
  // 這裡除了斷言狀態碼，也攔 unhandledRejection —— 只斷言「回了 400」無法區分
  // 「驗證擋下」與「別的原因剛好也回 400」，而 rejection 才是那個真正致命的訊號。
  const probeGenerateImage = async (body) => {
    const rejections = [];
    const onRejection = (reason) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);
    const res = await Promise.race([
      request(buildApp()).post('/api/ai/generate-image').send(body),
      new Promise((resolve) => setTimeout(() => resolve({ status: 'HUNG-NO-RESPONSE' }), 2000)),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    process.off('unhandledRejection', onRejection);
    return { status: res.status, rejections: rejections.map((r) => String(r && r.message)) };
  };

  beforeEach(() => {
    delete process.env.STABILITY_API_KEY;
  });

  it('非字串 prompt 回 400，且不再產生未攔截的 rejection', async () => {
    for (const prompt of [12345, { a: 1 }, [1, 2], true]) {
      const out = await probeGenerateImage({ prompt });
      expect(out.status, `prompt=${JSON.stringify(prompt)} 應回 400`).toBe(400);
      expect(
        out.rejections,
        `prompt=${JSON.stringify(prompt)} 產生未攔截的 rejection —— 真實伺服器會中止行程`
      ).toEqual([]);
    }
  }, 20000);

  // SANITY：合法輸入必須仍然走得通，否則上面每一則 400 都可能只是「全部都壞了」。
  it('合法字串 prompt 仍然正常回應（示範模式）', async () => {
    const out = await probeGenerateImage({ prompt: 'a cat sitting on a keyboard' });
    expect(out.status).toBe(200);
    expect(out.rejections).toEqual([]);
  }, 20000);

  it('缺少 prompt 回 400', async () => {
    const res = await request(buildApp()).post('/api/ai/generate-image').send({});
    expect(res.status).toBe(400);
  });

  it('超過 2000 字的 prompt 回 400，不會送進第三方 API', async () => {
    const res = await request(buildApp())
      .post('/api/ai/generate-image')
      .send({ prompt: 'x'.repeat(2001) });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/ai/summarize 輸入驗證', () => {
  it('非字串 content 回 400', async () => {
    for (const content of [123, { a: 1 }, [1]]) {
      const res = await request(buildApp()).post('/api/ai/summarize').send({ content });
      expect(res.status, `content=${JSON.stringify(content)} 應回 400`).toBe(400);
    }
  });

  it('缺少 content 回 400', async () => {
    const res = await request(buildApp()).post('/api/ai/summarize').send({ title: 'x' });
    expect(res.status).toBe(400);
  });

  it('超過長度上限的 content 回 400', async () => {
    const res = await request(buildApp())
      .post('/api/ai/summarize')
      .send({ content: 'x'.repeat(20001) });
    expect(res.status).toBe(400);
  });

  // 修補前 title 完全沒有上限也沒有 slice，body 上限（100kb）內的任何長度都會
  // 整份進入 prompt 並送進 Gemini 計費。這裡驗證它在到達模型之前就被截斷 ——
  // 沒有 GEMINI_API_KEY 時會停在 500，那一步已經在驗證之後，足以證明驗證通過
  // 而非被長度擋下（若 title 仍會被當成錯誤，狀態碼會是 400）。
  it('超長 title 不會讓請求被拒，而是被截斷後繼續', async () => {
    delete process.env.GEMINI_API_KEY;
    const res = await request(buildApp())
      .post('/api/ai/summarize')
      .send({ content: '正常內容', title: 'T'.repeat(100000) });
    expect(res.status).not.toBe(400);
  });
});
