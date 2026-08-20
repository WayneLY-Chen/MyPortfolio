// frontend/src/utils/markdownSanitize.js
//
// 給 react-markdown 用的 HTML 清洗設定。零 React 依賴，測得動：
//
//   cd frontend && npx vitest run src/utils/markdownSanitize.test.js
//
// 為什麼需要：本專案有四處 <ReactMarkdown rehypePlugins={[rehypeRaw]}>。
// rehypeRaw 的作用就是「把 markdown 裡的原始 HTML 當成真的 HTML 來渲染」，
// 因此 React 內建的跳脫在那條路徑上完全不生效 —— 內容裡有什麼標籤就渲染什麼。
//
// 這裡真正有攻擊路徑的是專案卡片的 README：
//
//   backend/src/services/githubService.js 的 fetchUserRepos() 會逐一呼叫
//   fetchRepoReadme(repo.name)，把使用者「所有公開 repo」的 README 原始文字
//   抓下來存進 projects.readme，前端再以 rehypeRaw 渲染。
//
//   也就是說，任何一個能讓 README 產生變更的途徑（外部貢獻者的 PR 被合併、
//   某個 repo 開放協作者）都會把那段 HTML 送上正式站。`<img src=x
//   onerror=...>` 在 README 裡完全不起眼，在 GitHub 上也不會被執行（GitHub
//   自己會清洗），只有在這個網站上會。
//
// 部落格內容（Blog.jsx）的來源是管理員，攻擊路徑窄得多，但用同一份設定是
// 對的：兩處都是「把外來 markdown 當 HTML 渲染」，沒有理由只清洗一邊 ——
// 本專案已經吃過五次「同樣的邏輯有兩份、只修一邊」的虧。
//
// AI 摘要那兩處（Projects.jsx 與 Blog.jsx 的 AiSummaryButton）不套用這份
// 設定，而是直接把 rehypeRaw 拿掉：模型輸出的摘要沒有任何需要原始 HTML 的
// 理由，能拿掉的攻擊面就不該只是縮小。

import { defaultSchema } from 'rehype-sanitize';

// rehype-sanitize 的預設 schema 就是 GitHub 自己用的那一份，對 README 來說
// 是最貼近的基準線。但它少了兩個本專案 README 實際在用的東西，因此擴充。
//
// 擴充的依據不是猜的：實測抓過 WayneLY-Chen 名下 15 個公開 repo 的 README，
// 統計出實際出現的標籤與屬性 ——
//   標籤：p img a sub td picture code h1 h2 h3 tr source strong br table b
//         div details summary ul li
//   屬性：src alt align width href height media srcset valign
// 其中只有 <picture>/<source>（深淺色主題自適應圖片，Readme-Atelier 與
// 個人 profile README 都在用）與 srcset/media/valign 不在預設 schema 內。
export const README_SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    // 深淺色主題自適應圖片：<picture><source media="..." srcset="..."><img></picture>
    'picture',
    'source',
  ],
  attributes: {
    ...defaultSchema.attributes,
    source: ['srcSet', 'srcset', 'media', 'type', 'sizes'],
    img: [...(defaultSchema.attributes?.img || []), 'align', 'srcSet', 'srcset', 'sizes'],
    // valign 是 README 表格排版常用的，預設 schema 沒有。
    td: [...(defaultSchema.attributes?.td || []), 'align', 'valign', 'width'],
    th: [...(defaultSchema.attributes?.th || []), 'align', 'valign', 'width'],
    tr: [...(defaultSchema.attributes?.tr || []), 'align', 'valign'],
  },
  // 明確列出允許的協定。預設 schema 已經限制了，這裡把它寫出來是為了讓
  // 「javascript: 不在清單上」這件事在程式碼裡是看得見的，而不是靠預設值。
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto', 'tel', '#'],
    src: ['http', 'https'],
    srcSet: ['http', 'https'],
  },
};

export default README_SANITIZE_SCHEMA;
