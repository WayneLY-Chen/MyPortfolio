import { describe, it, expect, vi } from 'vitest';

vi.mock('../db');

import {
  DEFAULT_VOICE,
  TTS_TEXT_MAX_CHARS,
  resolveVoice,
  isAllowedVoice,
  escapeForSsml,
  isValidTtsText,
} from './ttsValidation.js';

const LT = String.fromCharCode(60);
const GT = String.fromCharCode(62);
const QUOTE = String.fromCharCode(34);
const AUDIO_TAG = LT + 'audio src="https://evil.example/x.mp3"/' + GT;

describe('resolveVoice / isAllowedVoice', () => {
  it('前端實際使用的兩個聲線通過', () => {
    expect(isAllowedVoice('zh-CN-XiaoxiaoNeural')).toBe(true);
    expect(isAllowedVoice('en-US-AriaNeural')).toBe(true);
    expect(resolveVoice('en-US-AriaNeural')).toBe('en-US-AriaNeural');
  });

  // msedge-tts 的 setMetadata 只用未錨定的 /\w{2}-\w{2}/ 檢查聲線，因此這個
  // 值會通過它的檢查並被原樣內插進 <voice name="...">。
  it('注入用的聲線被拒，退回預設', () => {
    const injected = 'zh-CN' + QUOTE + GT + AUDIO_TAG + LT + 'voice name=' + QUOTE;
    expect(isAllowedVoice(injected)).toBe(false);
    expect(resolveVoice(injected)).toBe(DEFAULT_VOICE);
  });

  it('未知聲線退回預設而非採信', () => {
    expect(resolveVoice('ja-JP-NanamiNeural')).toBe(DEFAULT_VOICE);
    expect(resolveVoice('')).toBe(DEFAULT_VOICE);
    expect(resolveVoice(undefined)).toBe(DEFAULT_VOICE);
  });

  // 與 ai.js 的 TTS_RATE_WHITELIST 同一組理由：用 Map 而非物件字面值
  it('原型鍵不會命中白名單', () => {
    for (const key of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']) {
      expect(isAllowedVoice(key), `${key} 不應命中`).toBe(false);
      expect(resolveVoice(key)).toBe(DEFAULT_VOICE);
    }
  });
});

describe('escapeForSsml', () => {
  it('五個 XML 特殊字元都被跳脫', () => {
    expect(escapeForSsml('&')).toBe('&amp;');
    expect(escapeForSsml(LT)).toBe('&lt;');
    expect(escapeForSsml(GT)).toBe('&gt;');
    expect(escapeForSsml(QUOTE)).toBe('&quot;');
    expect(escapeForSsml("'")).toBe('&apos;');
  });

  it('注入的 audio 標籤被中和 —— 不再是有效的 SSML 元素', () => {
    const out = escapeForSsml('hi' + AUDIO_TAG);
    expect(out).not.toContain(LT + 'audio');
    expect(out).toContain('&lt;audio');
  });

  it('關閉標籤的突破嘗試同樣被中和', () => {
    const breakout = LT + '/prosody' + GT + LT + '/voice' + GT;
    const out = escapeForSsml(breakout);
    expect(out).not.toContain(LT + '/');
  });

  it('一般文字與中文不受影響', () => {
    expect(escapeForSsml('你好，世界')).toBe('你好，世界');
    expect(escapeForSsml('Hello world 123')).toBe('Hello world 123');
  });

  it('& 不會被重複跳脫成 &amp;amp;（逐字元處理，非連續取代）', () => {
    expect(escapeForSsml('a&b')).toBe('a&amp;b');
    expect(escapeForSsml('&amp;')).toBe('&amp;amp;');
  });
});

describe('isValidTtsText', () => {
  it('一般文字通過', () => {
    expect(isValidTtsText('今天天氣不錯')).toBe(true);
  });

  it('空字串與只有空白被拒', () => {
    expect(isValidTtsText('')).toBe(false);
    expect(isValidTtsText('   ')).toBe(false);
  });

  it('邊界值：剛好上限通過，超過一個字元被拒', () => {
    expect(isValidTtsText('x'.repeat(TTS_TEXT_MAX_CHARS))).toBe(true);
    expect(isValidTtsText('x'.repeat(TTS_TEXT_MAX_CHARS + 1))).toBe(false);
  });

  it('非字串型別被拒', () => {
    expect(isValidTtsText(null)).toBe(false);
    expect(isValidTtsText(undefined)).toBe(false);
    expect(isValidTtsText(123)).toBe(false);
    expect(isValidTtsText({})).toBe(false);
  });
});
