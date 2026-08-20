// 執行方式：cd frontend && node --test src/utils/markdownCode.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBlockCode } from './markdownCode.js';

const NL = String.fromCharCode(10);

test('帶語言的圍籬區塊判為區塊', () => {
  assert.equal(isBlockCode('language-bash', 'npm install'), true);
  assert.equal(isBlockCode('language-text', 'some text'), true);
  assert.equal(isBlockCode('language-js', 'const a = 1'), true);
});

test('README 實際使用的兩種語言都判為區塊', () => {
  // README.md 的 7 個圍籬區塊全部是 text 或 bash
  assert.equal(isBlockCode('language-text', 'tree output'), true);
  assert.equal(isBlockCode('language-bash', 'cd backend' + NL + 'npm install'), true);
});

test('沒指定語言但跨行，判為區塊', () => {
  assert.equal(isBlockCode(undefined, 'line1' + NL + 'line2'), true);
  assert.equal(isBlockCode('', 'a' + NL + 'b'), true);
  assert.equal(isBlockCode(null, 'x' + NL + 'y'), true);
});

// 以下每一則都對應到修補前會被錯誤畫成整塊區塊、把句子撕成兩半的實際內容。
test('README 裡的行內程式碼判為行內', () => {
  for (const s of ['msedge-tts', 'ai.js', 'questionIndex', 'Map', 'rate',
                   'backend/src/routes/ai.js', 'schema.sql', 'sessionStorage',
                   '/fun', '<prosody rate="...">', 'InterviewTab.jsx']) {
    assert.equal(isBlockCode(undefined, s), false, `${s} 應判為行內`);
  }
});

test('空 className 與單行內容判為行內', () => {
  assert.equal(isBlockCode('', 'npm'), false);
  assert.equal(isBlockCode(null, 'x'), false);
  assert.equal(isBlockCode(undefined, ''), false);
});

test('不像語言標記的 className 不會誤判為區塊', () => {
  // react-markdown 不會產生這些，但確保判準只認 language-*
  assert.equal(isBlockCode('inline-code', 'x'), false);
  assert.equal(isBlockCode('lang-bash', 'x'), false);
});

test('content 非字串時不會拋錯', () => {
  assert.equal(isBlockCode(undefined, undefined), false);
  assert.equal(isBlockCode(undefined, null), false);
  assert.equal(isBlockCode('language-js', undefined), true);
});
