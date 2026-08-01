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
