// frontend/src/utils/blogMarkdown.js
//
// BlogPostPage 專用的極簡 markdown → HTML 轉換，從該頁抽出來以便測試：
//
//   cd frontend && npx vitest run src/utils/blogMarkdown.test.js
//
// 為什麼是安全問題：BlogPostPage.jsx 用
//
//   <div dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }} />
//
// 渲染這個函式的輸出。函式原本只在「圍籬程式碼區塊」那一條分支跳脫 < 與 >，
// 其他所有分支（標題、粗體、斜體、清單、段落）都把原文直接內插進 HTML 字串。
// 也就是說文章內容裡的 `## <img src=x onerror=alert(1)>` 會變成
// `<h2 class="md-h2"><img src=x onerror=alert(1)></h2>` 並真的執行。
//
// 攻擊面窄：文章只有管理員寫得了（routes/blog.js 的 POST/PUT 都掛
// authenticate + requireAdmin），所以這不是「任何訪客都能打」的漏洞。但它是
// 一個貨真價實的 XSS sink，而修法只是把跳脫從一條分支移到最前面 —— 沒有理由
// 留著。專案裡其他四處 markdown 渲染走的是 react-markdown + rehype-sanitize
// （見 utils/markdownSanitize.js），只有這一處是手寫的。
//
// 沒有改成 react-markdown 的原因：這一頁的 CSS 是針對這個函式產生的
// .md-h2 / .md-pre / .md-code / .md-ul 等 class 寫的，換掉渲染器等於同時要
// 重寫版型，那是超出「修掉這個 sink」的改動。

/**
 * 跳脫 HTML 的三個結構字元。
 *
 * 只跳脫 & < >，不動引號：這個函式產生的 HTML 裡，使用者內容永遠出現在
 * 元素的「文字內容」位置，不會出現在屬性值裡（class 都是寫死的常數），
 * 因此引號不構成逃逸途徑。& 必須第一個換，否則會把後面產生的實體再跳脫一次。
 *
 * @param {string} s
 * @returns {string}
 */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * @param {string|null|undefined} text 文章原文（markdown）
 * @returns {string} 可交給 dangerouslySetInnerHTML 的 HTML 字串
 */
export function renderMarkdown(text) {
  if (!text) return ''

  // 先跳脫，再產生標籤。順序是這個函式安全與否的全部關鍵：跳脫之後原文裡
  // 不可能再出現 < 或 >，後面每一條 replace 加上去的標籤都是這裡自己產生的。
  // 反過來（先產生標籤再跳脫）會把自己產生的標籤也跳脫掉，整頁變成純文字。
  let html = escapeHtml(text)

  // 圍籬區塊內不再重複跳脫 —— 上面那一步已經處理過，這裡再跳一次會讓
  // 程式碼裡的 < 顯示成 &lt;。
  html = html.replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) =>
    `<pre class="md-pre"><code>${code}</code></pre>`
  )
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>[\s\S]+?<\/li>)\n(?!<li>)/g, '$1</ul>\n')
  html = html.replace(/(?:^|\n)(<li>)/g, '\n<ul class="md-ul">$1')
  html = html.replace(/\n\n/g, '</p><p class="md-p">')
  html = `<p class="md-p">${html}</p>`
  html = html.replace(/<p class="md-p">(<(?:h[23]|pre|ul)[^>]*>)/g, '$1')
  html = html.replace(/(<\/(?:h[23]|pre|ul)>)<\/p>/g, '$1')
  return html
}

export default renderMarkdown;
