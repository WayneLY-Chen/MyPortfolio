// 執行方式：cd frontend && node --test src/utils/blogMarkdown.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, renderMarkdown } from './blogMarkdown.js';

const NL = String.fromCharCode(10);
const LT = String.fromCharCode(60);
const GT = String.fromCharCode(62);

test('escapeHtml 跳脫三個結構字元', () => {
  assert.equal(escapeHtml('&'), '&amp;');
  assert.equal(escapeHtml(LT), '&lt;');
  assert.equal(escapeHtml(GT), '&gt;');
});

test('escapeHtml 先換 & 才不會二次跳脫', () => {
  // 若先換 < 再換 &，'<' 會先變成 '&lt;'，接著 & 又被換成 &amp;，
  // 結果是 '&amp;lt;' —— 畫面上會看到字面的 &lt;。
  assert.equal(escapeHtml(LT), '&lt;');
  assert.equal(escapeHtml('a&b' + LT + 'c'), 'a&amp;b&lt;c');
});

test('escapeHtml 不動一般文字與中文', () => {
  assert.equal(escapeHtml('Hello 世界 123'), 'Hello 世界 123');
});

// 以下每一則都是修補前會真的被瀏覽器執行的內容
// （renderMarkdown 的輸出交給 dangerouslySetInnerHTML）。
test('標題分支不再能夾帶 HTML', () => {
  const out = renderMarkdown('## ' + LT + 'img src=x onerror=alert(1)' + GT);
  assert.ok(!out.includes(LT + 'img'), '不該出現真的 img 標籤');
  assert.ok(out.includes('&lt;img'), '應該以文字呈現');
  assert.ok(out.includes('h2 class="md-h2"'), '標題本身仍要正常產生');
});

test('段落分支不再能夾帶 script', () => {
  const out = renderMarkdown(LT + 'script' + GT + 'alert(1)' + LT + '/script' + GT);
  assert.ok(!out.includes(LT + 'script'));
  assert.ok(out.includes('&lt;script'));
});

test('粗體、斜體、清單分支都不能夾帶 HTML', () => {
  for (const src of [
    '**' + LT + 'svg onload=alert(1)' + GT + '**',
    '*' + LT + 'iframe src=x' + GT + '*',
    '- ' + LT + 'img src=x onerror=alert(1)' + GT,
  ]) {
    const out = renderMarkdown(src);
    assert.ok(!/<(img|svg|iframe)/i.test(out), `${src} 洩漏了標籤: ${out}`);
  }
});

test('行內程式碼分支不能夾帶 HTML', () => {
  const out = renderMarkdown('這是 `' + LT + 'img src=x onerror=alert(1)' + GT + '` 範例');
  assert.ok(!out.includes(LT + 'img'));
  assert.ok(out.includes('code class="md-code"'));
});

test('圍籬區塊仍然跳脫，且不會二次跳脫', () => {
  const out = renderMarkdown('```js' + NL + 'if (a ' + LT + ' b) {}' + NL + '```');
  assert.ok(out.includes('&lt;'), '應該跳脫');
  assert.ok(!out.includes('&amp;lt;'), '不該二次跳脫成 &amp;lt;');
  assert.ok(out.includes('pre class="md-pre"'));
});

// 以下驗證修補沒有把正常排版弄壞 —— 這些是這一頁本來就要能渲染的東西。
test('一般文章排版不受影響', () => {
  const out = renderMarkdown('## 標題' + NL + NL + '這是一段**粗體**文字。');
  assert.ok(out.includes('h2 class="md-h2"'));
  assert.ok(out.includes('標題'));
  assert.ok(out.includes('strong'));
  assert.ok(out.includes('粗體'));
});

test('清單仍然產生 ul/li', () => {
  const out = renderMarkdown('- 第一項' + NL + '- 第二項' + NL + NL + '結尾');
  assert.ok(out.includes('ul class="md-ul"'));
  assert.ok(out.includes('li' + GT + '第一項'));
});

test('空輸入回空字串', () => {
  assert.equal(renderMarkdown(''), '');
  assert.equal(renderMarkdown(null), '');
  assert.equal(renderMarkdown(undefined), '');
});
