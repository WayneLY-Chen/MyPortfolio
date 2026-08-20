// 執行方式：cd frontend && node --test src/components/moneyExpression.test.js
//
// 與 ttsOptions.test.js / google-proxy.test.mjs 相同的作法：frontend/ 沒有安裝
// 測試框架，直接用 node:test + node:assert/strict。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMoneyExpression as evaluate } from './moneyExpression.js';

test('基本四則運算', () => {
  assert.equal(evaluate('1+2'), 3);
  assert.equal(evaluate('10-4'), 6);
  assert.equal(evaluate('6*7'), 42);
  assert.equal(evaluate('9/3'), 3);
});

test('運算子優先順序與括號', () => {
  assert.equal(evaluate('1+2*3'), 7);
  assert.equal(evaluate('(1+2)*3'), 9);
  assert.equal(evaluate('2*(3+4)-5'), 9);
  assert.equal(evaluate('((1+2))'), 3);
});

test('小數與空白', () => {
  assert.equal(evaluate('1.5+2.25'), 3.75);
  assert.equal(evaluate(' 1 + 2 '), 3);
  assert.equal(evaluate('.5+.5'), 1);
});

test('一元正負號', () => {
  assert.equal(evaluate('-5'), -5);
  assert.equal(evaluate('-5+10'), 5);
  assert.equal(evaluate('3*-2'), -6);
  assert.equal(evaluate('+7'), 7);
  assert.equal(evaluate('--3'), 3);
});

test('實際分帳會用到的算式', () => {
  assert.equal(evaluate('120+80+45'), 245);
  assert.equal(evaluate('1200/4'), 300);
  assert.equal(evaluate('(350+120)*1.1'), 517);
});

// 以下是原本 eval + 剝除式消毒會靜默算錯的輸入。改成拒絕之後，呼叫端會顯示
// 「金額算式錯誤」，而不是讓使用者拿到一個看起來正常卻錯誤的金額。
test('科學記號被拒絕，而非剝成 15', () => {
  assert.equal(evaluate('1e5'), null);
});

test('次方符號被拒絕，而非剝成 23', () => {
  assert.equal(evaluate('2^3'), null);
});

test('逗號被拒絕，而非剝成 12', () => {
  assert.equal(evaluate('1,2'), null);
});

test('十六進位與底線數字被拒絕', () => {
  assert.equal(evaluate('0x1F'), null);
  assert.equal(evaluate('1_000'), null);
});

test('任何字母一律拒絕', () => {
  assert.equal(evaluate('alert(1)'), null);
  assert.equal(evaluate('constructor'), null);
  assert.equal(evaluate('globalThis'), null);
  assert.equal(evaluate('abc'), null);
});

test('語法錯誤被拒絕', () => {
  assert.equal(evaluate('1+'), null);
  assert.equal(evaluate('*3'), null);
  assert.equal(evaluate('(1+2'), null);
  assert.equal(evaluate('1+2)'), null);
  assert.equal(evaluate('1 2'), null);
  assert.equal(evaluate('1.2.3'), null);
  assert.equal(evaluate('.'), null);
  assert.equal(evaluate('()'), null);
});

test('空輸入與非字串被拒絕', () => {
  assert.equal(evaluate(''), null);
  assert.equal(evaluate('   '), null);
  assert.equal(evaluate(null), null);
  assert.equal(evaluate(undefined), null);
  assert.equal(evaluate(123), null);
  assert.equal(evaluate({}), null);
});

test('除以零回傳 null，不讓 Infinity 變成金額', () => {
  assert.equal(evaluate('1/0'), null);
  assert.equal(evaluate('5/(3-3)'), null);
});

test('0 是合法金額，不可與 null 混淆', () => {
  assert.equal(evaluate('0'), 0);
  assert.equal(evaluate('5-5'), 0);
});
