// 執行方式：cd frontend && node --test src/utils/markdownSanitize.test.js
//
// 這一組測試跑的是「react-markdown 在頁面上實際會走的那條管線」——
// remark-parse → remark-gfm → remark-rehype(allowDangerousHtml) → rehype-raw
// → rehype-sanitize(README_SANITIZE_SCHEMA)。用 rehype-stringify 取回 HTML
// 字串來斷言，而不是渲染 React 樹，是為了讓這個檔案零 React 依賴、node --test
// 就跑得動（與 markdownCode.test.js / repoAssetUrl.test.js 同一慣例）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { README_SANITIZE_SCHEMA } from './markdownSanitize.js';

const render = (md, { sanitize = true } = {}) => {
  let pipeline = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw);
  if (sanitize) pipeline = pipeline.use(rehypeSanitize, README_SANITIZE_SCHEMA);
  return String(pipeline.use(rehypeStringify, { allowDangerousHtml: true }).processSync(md));
};

// SANITY：先證明「沒有清洗時這些 payload 真的會活下來」，
// 否則下面每一則「被擋下」都可能只是 payload 根本沒被解析成 HTML。
test('SANITY：不清洗時 payload 確實會原樣輸出', () => {
  const out = render('<img src=x onerror="alert(1)">', { sanitize: false });
  assert.ok(out.includes('onerror'), '未清洗時應該保留 onerror，否則這組測試證明不了東西');
});

test('事件處理屬性被移除', () => {
  for (const payload of [
    '<img src=x onerror="alert(1)">',
    '<div onmouseover="alert(1)">hover</div>',
    '<svg onload="alert(1)"></svg>',
    '<body onload="alert(1)">',
  ]) {
    assert.ok(!/on[a-z]+=/i.test(render(payload)), `${payload} 的事件屬性沒被移除`);
  }
});

test('script / iframe / style / form 等標籤被移除', () => {
  for (const [payload, tag] of [
    ['<script>alert(1)</script>', 'script'],
    ['<iframe src="https://evil.example"></iframe>', 'iframe'],
    ['<style>body{display:none}</style>', 'style'],
    ['<form action="https://evil.example"><input name="p"></form>', 'form'],
    ['<object data="x"></object>', 'object'],
    ['<embed src="x">', 'embed'],
  ]) {
    assert.ok(!render(payload).includes('<' + tag), `${tag} 沒被移除`);
  }
});

test('javascript: 與 data: 協定被移除', () => {
  assert.ok(!render('<a href="javascript:alert(1)">x</a>').includes('javascript:'));
  assert.ok(!render('[x](javascript:alert(1))').includes('javascript:'));
  assert.ok(!render('<a href="data:text/html,x">y</a>').includes('data:text/html'));
});

// 以下驗證修補沒有把 README 弄壞。標籤與屬性清單來自實測：
// 抓過 WayneLY-Chen 名下 15 個公開 repo 的 README，統計出實際出現的用法。
// 加上清洗後，那 15 份 README 的輸出與清洗前逐位元組完全相同。
test('README 實際使用的標籤都保留', () => {
  const out = render(
    '<div align="center">' +
    '<h1>標題</h1><p>段落</p><br><b>粗</b><strong>強</strong><sub>小</sub>' +
    '<a href="https://example.com"><img src="https://example.com/a.png" alt="a" width="100" height="50" align="center"></a>' +
    '<table><tr><td align="center" valign="top">格</td></tr></table>' +
    '<ul><li>項</li></ul><code>x</code>' +
    '<details><summary>更多</summary>內容</details>' +
    '</div>'
  );
  for (const tag of ['div', 'h1', 'p', 'br', 'b', 'strong', 'sub', 'a', 'img',
                     'table', 'tr', 'td', 'ul', 'li', 'code', 'details', 'summary']) {
    assert.ok(out.includes('<' + tag), `<${tag}> 被誤刪了`);
  }
  for (const attr of ['align', 'valign', 'width', 'height', 'alt', 'href', 'src']) {
    assert.ok(out.includes(attr + '='), `${attr} 屬性被誤刪了`);
  }
});

// <picture>/<source> 不在 rehype-sanitize 的預設 schema（GitHub 那份）裡，
// 是本專案額外加上去的 —— Readme-Atelier 與個人 profile README 都用它做
// 深淺色主題自適應圖片，少了它那些圖會整個不見。
test('picture / source 保留，含 srcset 與 media', () => {
  const out = render(
    '<picture>' +
    '<source media="(prefers-color-scheme: dark)" srcset="https://example.com/dark.png">' +
    '<img src="https://example.com/light.png" alt="x">' +
    '</picture>'
  );
  assert.ok(out.includes('<picture'), 'picture 被刪了');
  assert.ok(out.includes('<source'), 'source 被刪了');
  assert.ok(out.includes('srcset') || out.includes('srcSet'), 'srcset 被刪了');
  assert.ok(out.includes('media='), 'media 被刪了');
});

test('一般 markdown 語法不受影響', () => {
  const NL = String.fromCharCode(10);
  const out = render('# 標題' + NL + NL + '**粗體** 與 `程式碼`' + NL + NL + '- 項目');
  assert.ok(out.includes('<h1'));
  assert.ok(out.includes('<strong'));
  assert.ok(out.includes('<code'));
  assert.ok(out.includes('<li'));
});

test('GFM 表格與刪除線不受影響', () => {
  const NL = String.fromCharCode(10);
  const out = render('| a | b |' + NL + '|---|---|' + NL + '| 1 | 2 |' + NL + NL + '~~刪除~~');
  assert.ok(out.includes('<table'));
  assert.ok(out.includes('<del'));
});
