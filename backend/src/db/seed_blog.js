require('dotenv').config();
const { pool } = require('../db');

const WAYNE_EMAIL = 'qweasd226410@gmail.com';

const POSTS = [
  {
    title: 'GSAP 動畫指南：讓你的網站活起來',
    slug: 'gsap-animation-guide',
    cover_image: '/images/blog/gsap-guide.png',
    summary: '深入探討 GSAP（GreenSock Animation Platform）的核心功能，從基礎 tween 到 ScrollTrigger，讓靜態網頁搖身一變成為互動體驗。',
    content: `## 什麼是 GSAP？

GSAP（GreenSock Animation Platform）是目前最強大的 JavaScript 動畫庫之一。它不僅效能卓越，API 設計也極為直觀，是前端工程師製作複雜動畫的首選工具。

## 基礎 Tween

最簡單的動畫只需要幾行程式碼：

\`\`\`js
gsap.to('.box', {
  x: 200,
  duration: 1,
  ease: 'power3.out'
});
\`\`\`

## ScrollTrigger 的魔法

ScrollTrigger 插件讓你能根據滾動位置觸發動畫：

\`\`\`js
gsap.from('.card', {
  opacity: 0,
  y: 60,
  stagger: 0.12,
  scrollTrigger: {
    trigger: '.grid',
    start: 'top 80%'
  }
});
\`\`\`

## 實用技巧

- 使用 will-change: transform 提升 GPU 加速效能
- 善用 stagger 製造錯落有致的入場效果
- 配合 ScrollTrigger.refresh() 處理動態內容
- 用 gsap.context() 做好清理，避免記憶體洩漏

## 結語

GSAP 的學習曲線相對平緩，但能做出的效果卻非常豐富。建議從官方文件的 Getting Started 開始，搭配 CodePen 練習，很快就能上手！`
  },
  {
    title: 'Next.js 14 vs Vite：2024 該如何選擇？',
    slug: 'nextjs-vs-vite-2024',
    cover_image: '/images/blog/nextjs-vite.png',
    summary: '隨著 Next.js 14 帶來 App Router 和 Server Actions，以及 Vite 持續以極速著稱，這兩個工具各有千秋。本文從實際開發角度分析如何做出最佳選擇。',
    content: `## 前言

2024 年前端生態系百花齊放，Next.js 14 和 Vite 都是備受開發者推崇的工具，但它們的設計哲學卻截然不同。

## Next.js 14 的強項

### Server Components

Next.js 14 的 App Router 帶來了真正的 React Server Components 支援，讓伺服器端渲染更加強大。

### Server Actions

表單處理變得前所未有地簡潔，完全不需要手寫 API endpoint。

## Vite 的強項

- 極速的開發伺服器啟動（HMR 幾乎即時）
- 設定簡單，幾乎零配置就能跑起來
- 非常適合純 SPA 或客戶端渲染專案
- 打包產物乾淨，易於部署

## 如何選擇？

- 需要 SEO / SSR / 全端功能 → 選 Next.js
- 純前端 SPA / 工具類網站 → 選 Vite
- 企業級專案 / 需要 ISR → 選 Next.js
- 學習 React 基礎 / 快速原型 → 選 Vite

## 結論

兩者都是優秀的工具，沒有絕對的好壞之分。關鍵在於了解你的專案需求，選擇最適合的工具！`
  },
  {
    title: 'AI 工具如何徹底改變我的開發流程',
    slug: 'ai-tools-changed-my-workflow',
    cover_image: '/images/blog/ai-workflow.png',
    summary: '從 GitHub Copilot 到 ChatGPT，再到 Claude，AI 工具已經深度融入我的日常開發。這篇文章分享我實際使用這些工具的心得與最佳實踐。',
    content: `## AI 工具已不可忽視

2023 年是 AI 工具爆發的元年，而 2024 年這些工具已經成為許多開發者工作流程中不可或缺的一部分。

## 我常用的 AI 工具

### GitHub Copilot

Copilot 最擅長的是補全重複性高的程式碼，大幅提升開發速度。

### Claude

我最常用 Claude 來做：

- 程式碼 review 和重構建議
- 解釋複雜的演算法
- 撰寫技術文件和 README
- debug 難以追蹤的邏輯錯誤

### ChatGPT

適合用來快速查詢、生成測試資料、以及處理非技術性寫作任務。

## 最佳實踐

- 不要盲目貼上 AI 生成的程式碼，務必理解每一行的意思
- 用 AI 做第一輪草稿，人工做最後審查
- 善用 AI 解釋你看不懂的程式碼或文件
- 把 AI 當成結對程式設計的夥伴，而非替代品

## 結語

AI 工具大幅提升了我的生產力，但最重要的是保持對程式碼的理解和掌控。AI 是工具，判斷力仍然在人。`
  },
  {
    title: '打造完美 UI/UX：設計師與工程師的橋樑',
    slug: 'perfect-ui-ux-design',
    cover_image: '/images/blog/ui-ux-design.png',
    summary: '身為一個兼具設計思維的工程師，我分享如何在 Figma 與程式碼之間搭起橋樑，打造既美觀又易用的介面。',
    content: `## 設計與開發的鴻溝

許多專案失敗的原因不是技術不好，而是設計與開發之間缺乏有效的溝通。作為一個同時懂設計和開發的人，我想分享一些實際心得。

## Figma 是工程師的好朋友

Figma 不只是設計師的工具，工程師也應該學會看懂 Figma：

- 直接從 Figma 複製 CSS 數值（padding、color、font-size）
- 使用 Dev Mode 快速取得設計規格
- 透過 Auto Layout 理解響應式設計邏輯

## CSS 變數讓設計系統落地

把設計 token 轉化為 CSS 變數，讓設計系統真正在程式碼中活起來。

## UX 原則在程式碼中的體現

- 反饋即時性：按鈕點擊後要有視覺反應（loading state）
- 容錯設計：表單錯誤訊息要清楚且有建設性
- 漸進揭露：複雜功能分步驟引導，不要一次全部丟給使用者
- 無障礙設計：確保 ARIA 標籤和鍵盤導航正確運作

## 結語

最好的 UI/UX 是那些讓使用者感覺不到設計存在的設計——自然、流暢、符合直覺。`
  },
  {
    title: '從零開始的 PostgreSQL：我學到的五件事',
    slug: 'postgresql-five-lessons',
    cover_image: '/images/blog/postgresql-lessons.png',
    summary: '從 MongoDB 轉向 PostgreSQL 的過程中，我踩過不少坑，也學到了許多寶貴的經驗。這篇文章整理了五個讓我印象最深刻的教訓。',
    content: `## 為什麼選 PostgreSQL？

在使用過 MongoDB 之後，我因為專案需求開始學習 PostgreSQL。關聯式資料庫的嚴謹結構讓我對資料設計有了全新的認識。

## 第一件事：Schema 設計要想清楚

不像 MongoDB 可以隨時加欄位，PostgreSQL 的 Schema 修改需要謹慎。一開始就設計好資料結構，能省下很多麻煩。

## 第二件事：善用索引

正確的索引可以讓查詢速度提升數十倍。建議在 WHERE 子句常用的欄位上建立索引。

## 第三件事：Transaction 是你的好朋友

多個相關的操作應該包在同一個 Transaction 裡，確保資料一致性。

## 第四件事：JOIN 比你想的強大

學會各種 JOIN（INNER、LEFT、RIGHT、FULL）可以讓你用更少的查詢完成複雜的資料需求。

## 第五件事：不要忽視 EXPLAIN ANALYZE

遇到慢查詢時，用 EXPLAIN ANALYZE 看查詢計畫，往往能找到效能瓶頸所在。

## 結語

PostgreSQL 是一個非常強大且可靠的資料庫系統。雖然學習曲線比 NoSQL 稍陡，但投資是值得的！`
  },

  // ── 以下為新增的 10 篇文章 ──────────────────────────────────────

  {
    title: 'React Server Components 實戰筆記',
    slug: 'react-server-components-in-practice',
    cover_image: '/images/blog/react-server-components.png',
    summary: 'React Server Components 改變了前端渲染的思維方式。本文從實際專案出發，整理使用 RSC 時常遇到的問題、資料獲取模式，以及與 Client Components 搭配的最佳實踐。',
    content: `## 什麼是 React Server Components？

React Server Components（RSC）是 React 18 引入的新架構，讓元件能在伺服器端執行並直接存取後端資源，同時不增加客戶端的 JavaScript bundle 大小。

## RSC 與傳統 SSR 的差異

傳統 SSR 是把整個頁面在伺服器渲染成 HTML 再送到瀏覽器，而 RSC 是讓部分元件永遠在伺服器執行，只把必要的互動邏輯送到客戶端。

\`\`\`jsx
// 這是 Server Component（預設）
// 可以直接用 async/await，可以直接查資料庫
async function PostList() {
  const posts = await db.query('SELECT * FROM blog_posts WHERE published = TRUE');
  return (
    <ul>
      {posts.rows.map(post => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  );
}
\`\`\`

## 何時用 Client Component？

加上 \`'use client'\` 指令，元件就會在客戶端執行：

- 需要 \`useState\`、\`useEffect\` 等 React hooks
- 需要監聽 DOM 事件（onClick、onChange 等）
- 需要存取瀏覽器 API（localStorage、window 等）

\`\`\`jsx
'use client';

import { useState } from 'react';

export function LikeButton({ postId }) {
  const [liked, setLiked] = useState(false);
  return (
    <button onClick={() => setLiked(!liked)}>
      {liked ? '已按讚' : '按讚'}
    </button>
  );
}
\`\`\`

## 常見的資料獲取模式

### 串聯獲取（Sequential）

\`\`\`jsx
async function PostPage({ slug }) {
  const post = await getPost(slug);          // 先取文章
  const author = await getUser(post.author_id); // 再取作者
  return <Article post={post} author={author} />;
}
\`\`\`

### 平行獲取（Parallel）

\`\`\`jsx
async function PostPage({ slug }) {
  const [post, relatedPosts] = await Promise.all([
    getPost(slug),
    getRelatedPosts(slug)
  ]);
  return <Article post={post} related={relatedPosts} />;
}
\`\`\`

## 實戰踩坑筆記

- **不能在 Server Component 使用 Context**：需要把 Provider 放到 Client Component 層
- **序列化限制**：Server Component 傳給 Client Component 的 props 必須能被序列化
- **注意 re-render**：Server Component 不會 re-render，資料更新需要透過 router refresh

## 結語

RSC 是前端開發的重要演進方向。理解 Server / Client 的邊界設計，能讓你的應用在效能和開發體驗上都有顯著提升。`
  },
  {
    title: '用 Figma Variables 建立設計系統',
    slug: 'figma-variables-design-system',
    cover_image: '/images/blog/figma-variables.png',
    summary: 'Figma Variables 讓設計 token 的管理進化到新的層次。從顏色、間距到文字樣式，本文示範如何建立一套可擴充、易維護的設計系統，並讓設計與工程真正同步。',
    content: `## 為什麼需要 Figma Variables？

在 Variables 功能推出之前，設計師通常用 Styles 管理顏色和文字。但 Styles 有一個缺點：它不支援模式切換（Mode），也就是說，要做亮色/暗色主題，得手動維護兩套樣式。Figma Variables 解決了這個問題。

## Variable 的基本概念

Variable 是一個具名的值，可以在設計中重複使用。它支援四種型別：

- **Color**：顏色值
- **Number**：數字（間距、圓角、字型大小等）
- **String**：文字（可用於顏色模式切換的語意命名）
- **Boolean**：布林值（控制元件的顯示/隱藏）

## 建立語意化顏色系統

好的設計系統分兩層：

**第一層：原始色盤（Primitive）**

\`\`\`
color/blue/100  → #e0f2fe
color/blue/500  → #3b82f6
color/blue/900  → #1e3a5f
\`\`\`

**第二層：語意化 Token（Semantic）**

\`\`\`
color/brand/primary    → {color/blue/500}
color/text/default     → {color/gray/900}  （Light mode）
                       → {color/gray/100}  （Dark mode）
color/background/page  → #ffffff           （Light mode）
                       → #0a0a0a           （Dark mode）
\`\`\`

語意層直接引用原始色盤的 Variable，切換 Mode 時只需一鍵，所有使用語意 token 的元件都會自動更新。

## 間距系統

\`\`\`
spacing/1  → 4
spacing/2  → 8
spacing/3  → 12
spacing/4  → 16
spacing/6  → 24
spacing/8  → 32
\`\`\`

這樣的命名方式讓間距有規律可循，工程師也能快速對應到程式碼中的數值。

## 從 Figma Variables 到 CSS Variables

設計完成後，工程師可以直接對應：

\`\`\`css
:root {
  --color-brand-primary: #3b82f6;
  --color-text-default: #111827;
  --color-bg-page: #ffffff;
  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-4: 16px;
}

[data-theme="dark"] {
  --color-text-default: #f9fafb;
  --color-bg-page: #0a0a0a;
}
\`\`\`

## 實際建立流程

1. 先定義原始色盤（品牌色、中性色、功能色）
2. 建立語意 token，引用原始色盤
3. 設定 Light / Dark 兩種 Mode
4. 為間距、圓角、字型大小建立 Number Variables
5. 在元件中套用語意 token（而非直接用原始色）

## 結語

Figma Variables 真正實現了「設計即規格」的願景。配合良好的命名規範，設計師和工程師能說同一種語言，大幅減少交接時的溝通成本。`
  },
  {
    title: 'TypeScript 泛型：從零到實用',
    slug: 'typescript-generics-practical-guide',
    cover_image: '/images/blog/typescript-generics.png',
    summary: 'TypeScript 泛型是許多開發者覺得難以掌握的概念，但它正是讓型別系統真正強大的關鍵。本文從基礎語法出發，逐步帶你理解泛型在實際專案中的應用場景。',
    content: `## 為什麼需要泛型？

假設你想寫一個通用的「取得陣列第一個元素」的函式：

\`\`\`typescript
// 沒有泛型時：只能用 any，失去型別安全
function first(arr: any[]): any {
  return arr[0];
}

// 有了泛型：保留輸入型別，回傳型別也正確
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

const num = first([1, 2, 3]);   // 型別是 number | undefined
const str = first(['a', 'b']);  // 型別是 string | undefined
\`\`\`

## 泛型的基本語法

使用角括號 \`<T>\` 宣告型別參數：

\`\`\`typescript
// 泛型函式
function identity<T>(value: T): T {
  return value;
}

// 泛型介面
interface Box<T> {
  value: T;
  label: string;
}

// 泛型型別別名
type Nullable<T> = T | null;
type ApiResponse<T> = {
  data: T;
  status: number;
  message: string;
};
\`\`\`

## 泛型約束（Constraints）

有時候你需要確保泛型參數具有某些屬性：

\`\`\`typescript
// T 必須有 id 屬性
function findById<T extends { id: number }>(items: T[], id: number): T | undefined {
  return items.find(item => item.id === id);
}

// 實際使用
interface User { id: number; name: string; }
interface Post { id: number; title: string; }

const user = findById<User>(users, 1);  // 正確
const post = findById<Post>(posts, 5);  // 正確
\`\`\`

## 實用工具型別（Utility Types）

TypeScript 內建了許多用泛型實現的工具型別：

\`\`\`typescript
interface User {
  id: number;
  name: string;
  email: string;
  password: string;
}

// Partial：所有屬性變為可選
type UpdateUser = Partial<User>;

// Pick：挑選部分屬性
type PublicUser = Pick<User, 'id' | 'name'>;

// Omit：排除部分屬性
type SafeUser = Omit<User, 'password'>;

// Record：建立物件型別
type UserMap = Record<string, User>;
\`\`\`

## 實戰案例：API 請求封裝

\`\`\`typescript
async function fetchApi<T>(url: string): Promise<ApiResponse<T>> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
  return res.json();
}

// 使用時有完整的型別推導
const { data } = await fetchApi<User[]>('/api/users');
// data 的型別是 User[]
\`\`\`

## 常見誤用

- **不要什麼都用泛型**：如果型別是固定的，直接寫死就好
- **避免過度約束**：約束太多會讓泛型失去靈活性
- **善用型別推導**：很多情況下 TypeScript 能自動推導泛型參數，不需要明確指定

## 結語

泛型是 TypeScript 型別系統的靈魂。掌握它之後，你會發現很多原本需要 \`any\` 的地方都能寫出更安全、更優雅的型別定義。`
  },
  {
    title: '前端效能優化的十個實戰技巧',
    slug: 'frontend-performance-optimization-tips',
    cover_image: '/images/blog/frontend-performance.png',
    summary: '網站載入速度直接影響使用者體驗和 SEO 排名。本文整理了十個在真實專案中驗證有效的前端效能優化技巧，從圖片優化、程式碼分割到快取策略，全面提升你的網站效能。',
    content: `## 為什麼效能優化很重要？

Google 的研究顯示，頁面載入時間每增加一秒，跳出率就增加 32%。Core Web Vitals 也已成為 SEO 排名的重要指標。

## 技巧一：圖片優化

圖片通常佔網頁資源的 60% 以上：

- 使用 WebP 或 AVIF 格式，比 JPEG 小 25-35%
- 實作 Lazy Loading：\`<img loading="lazy" />\`
- 提供正確的 srcset，讓瀏覽器選擇適合螢幕尺寸的圖片
- 使用 CDN 加速圖片分發

## 技巧二：程式碼分割（Code Splitting）

不要把所有 JavaScript 打包成一個大檔案：

\`\`\`jsx
// React lazy loading
const HeavyComponent = React.lazy(() => import('./HeavyComponent'));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <HeavyComponent />
    </Suspense>
  );
}
\`\`\`

## 技巧三：減少不必要的重新渲染

\`\`\`jsx
// 用 memo 避免不必要的重新渲染
const PostCard = React.memo(({ post }) => {
  return <div>{post.title}</div>;
});

// 用 useMemo 快取昂貴的計算
const sortedPosts = useMemo(
  () => posts.sort((a, b) => b.date - a.date),
  [posts]
);
\`\`\`

## 技巧四：字體優化

- 使用 \`font-display: swap\` 避免文字不可見（FOIT）
- 只載入需要的字重和字集
- 考慮使用系統字體堆疊

## 技巧五：CSS 動畫效能

只動畫 \`transform\` 和 \`opacity\`，避免動畫 \`width\`、\`height\`、\`top\`、\`left\`（會觸發 Layout）：

\`\`\`css
/* 好的做法 */
.card:hover { transform: translateY(-4px); }

/* 避免的做法 */
.card:hover { margin-top: -4px; }
\`\`\`

## 技巧六：預載關鍵資源

\`\`\`html
<!-- 預載關鍵字體 -->
<link rel="preload" href="/fonts/space-grotesk.woff2" as="font" crossorigin>

<!-- 預載重要圖片 -->
<link rel="preload" href="/hero.webp" as="image">
\`\`\`

## 技巧七：善用瀏覽器快取

在 HTTP 回應標頭設定適當的 Cache-Control，靜態資源（JS、CSS）可以快取很長時間，配合 content hash 做版本控制。

## 技巧八：減少 JavaScript 執行時間

- Tree shaking：確保打包工具移除未使用的程式碼
- 避免引入整個函式庫（用具名引入代替）
- 把重型計算移到 Web Worker

## 技巧九：資料庫查詢優化

- 只 SELECT 需要的欄位，避免 \`SELECT *\`
- 在 JOIN 和 WHERE 常用欄位建立索引
- 實作分頁，避免一次返回大量資料

## 技巧十：使用效能監測工具

- **Lighthouse**：全面的效能審計
- **Chrome DevTools Performance**：分析執行時效能
- **Web Vitals 擴充套件**：即時查看 Core Web Vitals

## 結語

效能優化是一個持續的過程，不是一次性的工作。建立監測機制，定期檢視指標，才能確保網站長期維持良好效能。`
  },
  {
    title: 'PostgreSQL 索引設計與查詢優化',
    slug: 'postgresql-index-and-query-optimization',
    cover_image: '/images/blog/postgresql-index.png',
    summary: '當資料量成長，沒有索引的資料庫查詢會讓應用程式慢到無法使用。本文深入探討 PostgreSQL 的索引類型、設計原則，以及用 EXPLAIN ANALYZE 診斷慢查詢的實戰方法。',
    content: `## 索引是什麼？

索引是資料庫用來加速查詢的資料結構。沒有索引，資料庫必須掃描整張表才能找到資料（Sequential Scan）；有了索引，它能快速定位（Index Scan）。

## PostgreSQL 常用索引類型

### B-Tree 索引（預設）

適用於等值查詢（=）和範圍查詢（<、>、BETWEEN）：

\`\`\`sql
-- 在 slug 欄位建立索引（常用於查詢特定文章）
CREATE INDEX idx_blog_posts_slug ON blog_posts(slug);

-- 複合索引（同時在多個欄位上）
CREATE INDEX idx_posts_author_date ON blog_posts(author_id, created_at DESC);
\`\`\`

### GIN 索引

適用於陣列、JSONB、全文搜尋：

\`\`\`sql
-- 在 JSONB 欄位建立 GIN 索引
CREATE INDEX idx_projects_stats ON projects USING GIN(language_stats);
\`\`\`

## 設計原則

### 選擇性（Selectivity）原則

索引在選擇性高的欄位上效果最好。布林欄位（只有兩種值）通常不適合建索引；UUID 主鍵則非常適合。

### 複合索引的欄位順序

複合索引遵循「最左前綴」原則：

\`\`\`sql
-- 這個索引能加速以下查詢
CREATE INDEX idx_posts_user_published ON blog_posts(author_id, published);

-- 能用到索引：
SELECT * FROM blog_posts WHERE author_id = $1;
SELECT * FROM blog_posts WHERE author_id = $1 AND published = TRUE;

-- 用不到索引（跳過了 author_id）：
SELECT * FROM blog_posts WHERE published = TRUE;
\`\`\`

## 用 EXPLAIN ANALYZE 診斷慢查詢

\`\`\`sql
EXPLAIN ANALYZE
SELECT bp.*, u.display_name
FROM blog_posts bp
JOIN users u ON bp.author_id = u.id
WHERE bp.published = TRUE
ORDER BY bp.created_at DESC
LIMIT 10;
\`\`\`

關鍵指標：
- **Seq Scan**：全表掃描，通常表示缺少索引
- **Index Scan**：使用了索引
- **actual rows vs estimated rows**：差距大表示統計資訊過舊，需要 ANALYZE

## 索引維護

索引不是免費的，它會增加寫入的負擔。幾個注意事項：

- 定期執行 \`ANALYZE\` 更新統計資訊
- 用 \`pg_stat_user_indexes\` 找出從未使用的索引並移除
- 大量資料插入前考慮暫時移除索引，完成後重建

## 局部索引（Partial Index）

只為符合條件的資料建立索引，節省空間：

\`\`\`sql
-- 只索引已發布的文章（大多數查詢只關心已發布的）
CREATE INDEX idx_published_posts ON blog_posts(created_at DESC)
WHERE published = TRUE;
\`\`\`

## 結語

索引設計是資料庫調效的核心技能。理解查詢模式，選擇正確的索引類型，搭配 EXPLAIN ANALYZE 驗證效果，就能讓 PostgreSQL 在大資料量下依然保持高效。`
  },
  {
    title: 'CSS Grid 完全指南：從入門到進階',
    slug: 'css-grid-complete-guide',
    cover_image: '/images/blog/css-grid.png',
    summary: 'CSS Grid 是現代網頁排版最強大的工具，能輕鬆實現複雜的二維佈局。本文從基礎語法開始，涵蓋響應式格線設計、區域命名、以及與 Flexbox 搭配使用的實戰技巧。',
    content: `## Grid vs Flexbox：各司其職

Flexbox 是一維的（只能控制一個方向），Grid 是二維的（同時控制橫向和縱向）。兩者不是競爭關係，而是互補：

- **用 Grid**：整體頁面佈局、卡片格子、複雜的表格型排版
- **用 Flexbox**：導航列、按鈕群組、單行/單列的元素對齊

## 基礎語法

\`\`\`css
.container {
  display: grid;
  grid-template-columns: 1fr 2fr 1fr; /* 三欄，比例 1:2:1 */
  grid-template-rows: auto 1fr auto;  /* 三列：header、內容、footer */
  gap: 24px;                          /* 欄與列的間距 */
}
\`\`\`

### repeat() 和 minmax()

\`\`\`css
.grid {
  /* 自動填滿欄位，每欄最小 280px，最大 1fr */
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
}
\`\`\`

這一行程式碼就能實現響應式卡片格子，不需要任何 media query！

## 區域命名（Grid Areas）

\`\`\`css
.layout {
  display: grid;
  grid-template-areas:
    "header header header"
    "sidebar main main"
    "footer footer footer";
  grid-template-columns: 240px 1fr 1fr;
  grid-template-rows: 64px 1fr 48px;
}

.header  { grid-area: header; }
.sidebar { grid-area: sidebar; }
.main    { grid-area: main; }
.footer  { grid-area: footer; }
\`\`\`

區域命名讓佈局語意更清晰，也更容易在不同螢幕尺寸下重新排列。

## 跨欄與跨列

\`\`\`css
.featured-card {
  grid-column: 1 / 3;  /* 從第 1 條線到第 3 條線（佔兩欄）*/
  grid-row: span 2;    /* 佔兩列 */
}
\`\`\`

## 響應式設計

\`\`\`css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

/* 在小螢幕上改為單欄 */
@media (max-width: 480px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
\`\`\`

## 對齊控制

\`\`\`css
.container {
  /* 控制所有子元素在格子內的對齊 */
  justify-items: center;  /* 水平對齊 */
  align-items: center;    /* 垂直對齊 */

  /* 控制整個格子在容器中的對齊 */
  justify-content: space-between;
  align-content: start;
}
\`\`\`

## 實用技巧：瀑布流佈局

\`\`\`css
.masonry {
  columns: 3 280px;  /* 這是 CSS Columns，不是 Grid，但效果類似 */
  gap: 16px;
}

.masonry-item {
  break-inside: avoid;  /* 避免元素被切斷 */
}
\`\`\`

## 結語

CSS Grid 學習曲線不算陡，但能力上限很高。建議用 [CSS Grid Garden](https://cssgridgarden.com/) 練習基礎，再用 Firefox DevTools 的 Grid Inspector 視覺化你的佈局，很快就能上手。`
  },
  {
    title: '用 Framer Motion 做出流暢動畫',
    slug: 'framer-motion-animation-guide',
    cover_image: '/images/blog/framer-motion.png',
    summary: 'Framer Motion 是 React 生態中最易用的動畫庫。本文從基礎的 animate prop 到進階的 AnimatePresence 和手勢動畫，帶你打造出既流暢又有質感的網頁互動體驗。',
    content: `## 為什麼選 Framer Motion？

在 React 生態中，做動畫有很多選擇：CSS 動畫、GSAP、React Spring，以及 Framer Motion。Framer Motion 的優勢在於它是為 React 設計的，語法非常直觀，且對 AnimatePresence（元件進出場動畫）的支援無與倫比。

## 快速開始

\`\`\`bash
npm install framer-motion
\`\`\`

\`\`\`jsx
import { motion } from 'framer-motion';

// 把 div 換成 motion.div，就能加動畫
function Card() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      內容
    </motion.div>
  );
}
\`\`\`

## Variants：讓動畫更有組織

\`\`\`jsx
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1  // 子元素依序出現
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

function List({ items }) {
  return (
    <motion.ul variants={containerVariants} initial="hidden" animate="visible">
      {items.map(item => (
        <motion.li key={item.id} variants={itemVariants}>
          {item.title}
        </motion.li>
      ))}
    </motion.ul>
  );
}
\`\`\`

## AnimatePresence：進出場動畫

\`\`\`jsx
import { AnimatePresence, motion } from 'framer-motion';

function Modal({ isOpen, onClose }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="modal"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2 }}
        >
          <button onClick={onClose}>關閉</button>
          {/* 內容 */}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
\`\`\`

## 手勢動畫

\`\`\`jsx
function Button({ children, onClick }) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      onClick={onClick}
    >
      {children}
    </motion.button>
  );
}
\`\`\`

## 滾動動畫

\`\`\`jsx
import { useInView } from 'framer-motion';
import { useRef } from 'react';

function FadeInSection({ children }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6 }}
    >
      {children}
    </motion.div>
  );
}
\`\`\`

## 效能注意事項

- 優先動畫 \`transform\` 和 \`opacity\`（GPU 加速）
- 避免動畫 \`width\`、\`height\`（觸發 Layout）
- 使用 \`layoutId\` 做共享元素動畫（Shared Layout）時要謹慎，確保 key 唯一

## 結語

Framer Motion 讓「做動畫」這件事在 React 中變得幾乎像是寫 CSS 一樣自然。從簡單的 fade in 到複雜的頁面切換，它都能優雅地處理。`
  },
  {
    title: 'Node.js 錯誤處理最佳實踐',
    slug: 'nodejs-error-handling-best-practices',
    cover_image: '/images/blog/node-error-handling.png',
    summary: '良好的錯誤處理是高品質後端服務的基石。本文整理 Node.js 錯誤處理的核心概念，涵蓋同步/非同步錯誤、自定義錯誤類別、Express 錯誤中介層，以及如何避免常見的錯誤處理陷阱。',
    content: `## Node.js 錯誤處理的挑戰

Node.js 的非同步本質讓錯誤處理比傳統同步語言更複雜。一個未被捕獲的 Promise rejection 可能悄悄讓你的資料不一致，甚至讓整個服務崩潰。

## 錯誤類型

### 操作型錯誤（Operational Errors）

可預期的錯誤，比如：
- 資料庫連線失敗
- 請求的資源不存在（404）
- 使用者輸入驗證失敗
- 外部 API 超時

這類錯誤應該被捕獲並以適當的 HTTP 狀態碼和訊息回應給客戶端。

### 程式設計錯誤（Programmer Errors）

程式碼的 bug，比如：
- 讀取 undefined 的屬性
- 傳入錯誤型別的參數
- 未處理的邊界條件

這類錯誤在開發環境應該讓程式崩潰，以便及早發現。

## 自定義錯誤類別

\`\`\`javascript
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class NotFoundError extends AppError {
  constructor(resource = '資源') {
    super(\`\${resource}不存在\`, 404, 'NOT_FOUND');
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}
\`\`\`

## 非同步錯誤處理

\`\`\`javascript
// 工具函式：包裝 async route handler
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// 在 controller 中使用
const getPost = asyncHandler(async (req, res) => {
  const post = await BlogPost.findBySlug(req.params.slug);
  if (!post) throw new NotFoundError('文章');
  res.json({ data: post });
});
\`\`\`

## Express 全域錯誤中介層

\`\`\`javascript
// 放在所有 route 之後
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const isOperational = err.isOperational || false;

  // 操作型錯誤：回傳清楚的錯誤訊息
  if (isOperational) {
    return res.status(statusCode).json({
      error: {
        code: err.code,
        message: err.message
      }
    });
  }

  // 程式設計錯誤：記錄完整錯誤，回傳通用訊息
  console.error('[UNHANDLED ERROR]', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: '伺服器發生錯誤，請稍後再試'
    }
  });
});
\`\`\`

## 捕獲未處理的 Promise Rejection

\`\`\`javascript
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // 給伺服器一點時間處理進行中的請求，然後關閉
  server.close(() => process.exit(1));
});
\`\`\`

## 常見陷阱

- **吞掉錯誤**：\`catch(err => {})\` 什麼都不做，問題就消失了
- **過度使用 try/catch**：在每個函式都包 try/catch 讓程式碼難以閱讀，使用 asyncHandler 更好
- **不記錄 stack trace**：在開發環境一定要記錄完整的 stack trace

## 結語

好的錯誤處理讓你的服務更穩健，也讓 debug 更容易。花時間建立一套統一的錯誤處理機制，長遠來看能省下大量排查問題的時間。`
  },
  {
    title: 'Web Accessibility：讓你的網站更包容',
    slug: 'web-accessibility-guide',
    cover_image: '/images/blog/web-accessibility.png',
    summary: '網頁無障礙設計不只是法規要求，更是對所有使用者的尊重。本文介紹 WCAG 核心原則、常見的無障礙問題，以及用 ARIA 標籤和鍵盤導航讓你的網站對每個人都友善。',
    content: `## 為什麼無障礙設計很重要？

全球約有 15% 的人口有某種形式的身心障礙。這包括視覺障礙（全盲或弱視）、聽覺障礙、運動障礙（無法使用滑鼠）、認知障礙等。一個無法被無障礙工具使用的網站，等於把這 15% 的使用者拒於門外。

更實際的原因：良好的無障礙設計也能提升 SEO，因為搜尋引擎的爬蟲很像螢幕閱讀器。

## WCAG 四大原則

WCAG（Web Content Accessibility Guidelines）定義了四個核心原則：

1. **可感知（Perceivable）**：資訊能被所有感官接收到
2. **可操作（Operable）**：所有功能都能用鍵盤操作
3. **可理解（Understandable）**：內容和操作都清楚易懂
4. **健壯（Robust）**：在各種輔助技術下都能正確運作

## 常見問題與修正

### 圖片缺少替代文字

\`\`\`html
<!-- 壞的做法 -->
<img src="chart.png">

<!-- 好的做法 -->
<img src="chart.png" alt="2024 年各季度銷售額長條圖，第三季最高達 150 萬">

<!-- 裝飾性圖片用空 alt -->
<img src="decoration.svg" alt="">
\`\`\`

### 色彩對比不足

WCAG AA 標準要求：
- 一般文字：對比度至少 4.5:1
- 大文字（18pt 以上）：對比度至少 3:1

使用 [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) 驗證你的色彩組合。

### 鍵盤導航

\`\`\`css
/* 永遠不要移除 focus 樣式，只能改善它 */
:focus-visible {
  outline: 2px solid var(--color-brand-primary);
  outline-offset: 2px;
  border-radius: 4px;
}
\`\`\`

### ARIA 標籤

\`\`\`html
<!-- 按鈕只有圖示時 -->
<button aria-label="關閉對話框">
  <svg>...</svg>
</button>

<!-- 動態內容更新時通知螢幕閱讀器 -->
<div role="status" aria-live="polite">
  表單已成功提交
</div>

<!-- 表單錯誤提示 -->
<input
  id="email"
  aria-describedby="email-error"
  aria-invalid="true"
>
<span id="email-error" role="alert">請輸入有效的 Email 格式</span>
\`\`\`

## 語意化 HTML

正確使用 HTML 標籤是最基礎的無障礙設計：

\`\`\`html
<!-- 使用語意標籤 -->
<header>
  <nav aria-label="主要導航">
    <ul>
      <li><a href="/">首頁</a></li>
    </ul>
  </nav>
</header>
<main>
  <article>
    <h1>文章標題</h1>
    <p>內容...</p>
  </article>
</main>
<footer>版權資訊</footer>
\`\`\`

## 測試工具

- **axe DevTools**（Chrome 擴充套件）：自動偵測無障礙問題
- **NVDA**（Windows）/ **VoiceOver**（macOS）：實際體驗螢幕閱讀器
- **鍵盤測試**：把滑鼠放下，只用 Tab / Enter / 方向鍵瀏覽你的網站

## 結語

無障礙設計不需要另起爐灶，從現在開始，在每個新元件中加入正確的 HTML 語意和 ARIA 標籤，就是對所有使用者最好的投資。`
  },
  {
    title: '從 REST 到 GraphQL：何時該切換？',
    slug: 'from-rest-to-graphql',
    cover_image: '/images/blog/rest-graphql.png',
    summary: 'REST 和 GraphQL 各有優劣，並非所有專案都適合切換到 GraphQL。本文從過度取用、版本管理、型別安全等角度，分析何時 GraphQL 能帶來真正的價值，何時 REST 才是更好的選擇。',
    content: `## REST 的侷限

REST API 在簡單的 CRUD 應用中非常好用，但隨著前端需求變複雜，幾個問題開始浮現：

### 過度取用（Over-fetching）

你要顯示一個文章列表，只需要 \`title\` 和 \`slug\`，但 REST API 返回了整篇文章的 \`content\`（可能很大）。

### 不足取用（Under-fetching）

顯示一個作者頁面需要：
1. \`GET /users/:id\`（取得使用者）
2. \`GET /posts?author=:id\`（取得文章列表）
3. \`GET /projects?owner=:id\`（取得作品列表）

三個請求串接，增加了延遲和複雜度。

## GraphQL 的解法

\`\`\`graphql
# 一個請求取得所有需要的資料，且只取需要的欄位
query AuthorPage($userId: ID!) {
  user(id: $userId) {
    name
    avatar
    posts(first: 10) {
      title
      slug
      publishedAt
    }
    projects(first: 6) {
      name
      description
      url
    }
  }
}
\`\`\`

## GraphQL 的優勢

1. **精確的資料獲取**：客戶端決定要什麼，不多不少
2. **強型別 Schema**：API 文件即程式碼，自帶型別安全
3. **單一端點**：不需要維護多個 REST endpoint
4. **Introspection**：工具（GraphiQL、Apollo Studio）能自動產生文件
5. **訂閱（Subscriptions）**：原生支援即時資料

## GraphQL 的代價

不是沒有缺點：

- **複雜度**：設定 resolver、N+1 問題（需要 DataLoader）
- **快取困難**：REST 能直接用 HTTP Cache，GraphQL 需要額外設定
- **安全性**：惡意的深度查詢可能讓伺服器負擔過大（需要 query depth 限制）
- **學習成本**：團隊需要學習新的思維模式

## 何時應該切換到 GraphQL？

**適合 GraphQL 的情境：**
- 有多個前端客戶端（Web、iOS、Android），各自需要不同欄位
- 資料關係複雜，常需要多層巢狀查詢
- 需要即時資料（Subscriptions）
- 有專門的後端團隊能維護 Schema

**繼續用 REST 的情境：**
- 簡單的 CRUD 應用
- 只有一個前端客戶端
- 團隊規模小，不想增加技術複雜度
- 需要簡單的 HTTP 快取策略

## 中間路線

不一定非得全部切換。可以考慮：

- **GraphQL 作為 BFF（Backend for Frontend）**：在前端和微服務之間加一層 GraphQL 閘道
- **REST + 彈性欄位**：在 REST API 中支援 \`?fields=title,slug\` 參數來部分解決 over-fetching

## 結語

GraphQL 不是銀彈，REST 也不是落伍的選擇。評估你的團隊規模、API 使用模式、前端客戶端數量，再決定是否切換。對大多數中小型專案來說，設計良好的 REST API 就已經足夠。`
  }
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert Wayne user
    await client.query(
      `INSERT INTO users (email, display_name, role, is_verified, is_active)
       VALUES ($1, $2, 'admin', TRUE, TRUE)
       ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role`,
      [WAYNE_EMAIL, 'Wayne']
    );
    console.log('[OK] Wayne user upserted');

    // Get author id
    const userResult = await client.query('SELECT id FROM users WHERE email = $1', [WAYNE_EMAIL]);
    const authorId = userResult.rows[0].id;

    // Insert blog posts
    for (const post of POSTS) {
      await client.query(
        `INSERT INTO blog_posts (title, slug, summary, content, cover_image, published, author_id)
         VALUES ($1, $2, $3, $4, $5, TRUE, $6)
         ON CONFLICT (slug) DO UPDATE SET cover_image = EXCLUDED.cover_image`,
        [post.title, post.slug, post.summary, post.content, post.cover_image || null, authorId]
      );
      console.log('[OK]', post.slug);
    }

    await client.query('COMMIT');
    console.log('\nSeed 完成！');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed 失敗:', err.message);
  } finally {
    client.release();
    process.exit(0);
  }
}

seed().catch(err => { console.error(err); process.exit(1); });
