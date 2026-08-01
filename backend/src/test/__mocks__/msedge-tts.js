import { vi } from 'vitest';
import { EventEmitter } from 'node:events';

// Test double for the `msedge-tts` npm package (backend/src/routes/ai.js's
// `POST /tts` and `/chat` handlers do `new MsEdgeTTS()` then call
// `setMetadata()` / `toStream()`). `ai.js` is plain CommonJS, so its internal
// `require('msedge-tts')` runs through Node's real, native `Module._load` —
// `vi.mock('msedge-tts')` cannot intercept that call (see
// backend/src/test/setup.js's own comment block for the identical interop
// issue already solved for `../db`). This module is wired into that same
// Module._load redirect list instead of relying on vi.mock().

export const OUTPUT_FORMAT = {
  AUDIO_24KHZ_48KBITRATE_MONO_MP3: 'audio-24khz-48kbitrate-mono-mp3',
};

// Every constructed instance, in construction order. A test reaches the
// exact `audioStream` / `close` spy for the instance a handler created via
// __lastInstance()/__instances, without needing to intercept the
// constructor call itself.
export const __instances = [];

export class MsEdgeTTS {
  constructor() {
    // A real Readable is unnecessary and harder to drive manually in tests —
    // an EventEmitter lets a test `emit()` 'data'/'end'/'close'/'error' in
    // any order or combination to exercise ai.js's race-guard branches.
    this.audioStream = new EventEmitter();
    this.setMetadata = vi.fn(() => Promise.resolve());
    this.toStream = vi.fn(() => ({ audioStream: this.audioStream }));
    // Assertable per the plan's must_haves — proves the underlying WebSocket
    // was actually released on timeout, not just guarded against a second
    // HTTP response.
    this.close = vi.fn();
    __instances.push(this);
  }
}

// Most recently constructed instance — the common case, since each request
// handler creates exactly one `new MsEdgeTTS()`.
export function __lastInstance() {
  return __instances[__instances.length - 1];
}

export function __resetInstances() {
  __instances.length = 0;
}
