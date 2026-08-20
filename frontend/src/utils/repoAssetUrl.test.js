// 執行方式：cd frontend && node --test src/utils/repoAssetUrl.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRepoUrl, parseRepoUrl } from './repoAssetUrl.js';

const REPO = 'https://github.com/WayneLY-Chen/MyPortfolio';
const RAW = 'https://raw.githubusercontent.com/WayneLY-Chen/MyPortfolio/HEAD/';
const BLOB = 'https://github.com/WayneLY-Chen/MyPortfolio/blob/HEAD/';

test('parseRepoUrl 取出 owner 與 repo', () => {
  assert.deepEqual(parseRepoUrl(REPO), { owner: 'WayneLY-Chen', repo: 'MyPortfolio' });
  assert.deepEqual(parseRepoUrl(REPO + '.git'), { owner: 'WayneLY-Chen', repo: 'MyPortfolio' });
  assert.deepEqual(parseRepoUrl(REPO + '/tree/main'), { owner: 'WayneLY-Chen', repo: 'MyPortfolio' });
});

test('parseRepoUrl 對非 GitHub 網址回傳 null', () => {
  assert.equal(parseRepoUrl('https://gitlab.com/a/b'), null);
  assert.equal(parseRepoUrl('not a url'), null);
  assert.equal(parseRepoUrl(''), null);
  assert.equal(parseRepoUrl(null), null);
});

// 這三張正是專案卡片裡破圖的圖片
test('README 的相對圖片路徑補成 raw 網址', () => {
  assert.equal(resolveRepoUrl('docs/screenshots/fun.png', REPO, { raw: true }), RAW + 'docs/screenshots/fun.png');
  assert.equal(resolveRepoUrl('docs/screenshots/home.png', REPO, { raw: true }), RAW + 'docs/screenshots/home.png');
  assert.equal(resolveRepoUrl('docs/screenshots/interview.png', REPO, { raw: true }), RAW + 'docs/screenshots/interview.png');
});

test('相對連結補成 blob 網址', () => {
  assert.equal(resolveRepoUrl('backend/src/routes/ai.js', REPO), BLOB + 'backend/src/routes/ai.js');
  assert.equal(resolveRepoUrl('frontend/src/utils/fetchBlog.js', REPO), BLOB + 'frontend/src/utils/fetchBlog.js');
});

test('./ 與開頭的 / 都視為 repo 根目錄', () => {
  assert.equal(resolveRepoUrl('./docs/a.png', REPO, { raw: true }), RAW + 'docs/a.png');
  assert.equal(resolveRepoUrl('/docs/a.png', REPO, { raw: true }), RAW + 'docs/a.png');
  // 開頭 // 是協定相對網址（指向另一個主機），刻意不改寫 —— 把它當成 repo
  // 內路徑會改出一個錯誤的目標。README 不會出現這種寫法，此處只是釘住行為。
  assert.equal(resolveRepoUrl('//example.com/a.png', REPO, { raw: true }), '//example.com/a.png');
});

test('已是絕對網址的一律不動 —— 徽章不能被改寫', () => {
  const badge = 'https://img.shields.io/badge/React-18-61DAFB';
  assert.equal(resolveRepoUrl(badge, REPO, { raw: true }), badge);
  assert.equal(resolveRepoUrl('http://example.com/a.png', REPO, { raw: true }), 'http://example.com/a.png');
  assert.equal(resolveRepoUrl('//example.com/a.png', REPO, { raw: true }), '//example.com/a.png');
});

test('特殊協定不動', () => {
  assert.equal(resolveRepoUrl('data:image/png;base64,AAA', REPO, { raw: true }), 'data:image/png;base64,AAA');
  assert.equal(resolveRepoUrl('mailto:a@b.com', REPO), 'mailto:a@b.com');
  assert.equal(resolveRepoUrl('tel:+886', REPO), 'tel:+886');
});

test('頁內錨點不動 —— 那是本頁的目錄連結，不是 repo 檔案', () => {
  assert.equal(resolveRepoUrl('#核心特色', REPO), '#核心特色');
  assert.equal(resolveRepoUrl('#技術棧', REPO), '#技術棧');
});

test('沒有 repo 網址或不是 GitHub 時原樣回傳，不亂猜', () => {
  assert.equal(resolveRepoUrl('docs/a.png', undefined, { raw: true }), 'docs/a.png');
  assert.equal(resolveRepoUrl('docs/a.png', 'https://gitlab.com/a/b', { raw: true }), 'docs/a.png');
  assert.equal(resolveRepoUrl('docs/a.png', '', { raw: true }), 'docs/a.png');
});

test('空值與非字串原樣回傳', () => {
  assert.equal(resolveRepoUrl('', REPO), '');
  assert.equal(resolveRepoUrl(undefined, REPO), undefined);
  assert.equal(resolveRepoUrl(null, REPO), null);
});
