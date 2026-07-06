-- Seed: Wayne user
INSERT INTO users (email, display_name, role, is_verified, is_active)
VALUES ('qweasd226410@gmail.com', 'Wayne', 'admin', TRUE, TRUE)
ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name, role = EXCLUDED.role;

-- Seed: Blog posts
INSERT INTO blog_posts (title, slug, summary, content, published, author_id)
VALUES (
  'GSAP 動畫指南：讓你的網站活起來',
  'gsap-animation-guide',
  '深入探討 GSAP（GreenSock Animation Platform）的核心功能，從基礎 tween 到 ScrollTrigger，讓靜態網頁搖身一變成為互動體驗。',
  E'## 什麼是 GSAP？\n\nGSAP（GreenSock Animation Platform）是目前最強大的 JavaScript 動畫庫之一。它不僅效能卓越，API 設計也極為直觀，是前端工程師製作複雜動畫的首選工具。\n\n## 基礎 Tween\n\n最簡單的動畫只需要幾行程式碼：\n\n```js\ngsap.to(\'.box\', {\n  x: 200,\n  duration: 1,\n  ease: \'power3.out\'\n});\n```\n\n## ScrollTrigger 的魔法\n\nScrollTrigger 插件讓你能根據滾動位置觸發動畫：\n\n```js\ngsap.from(\'.card\', {\n  opacity: 0,\n  y: 60,\n  stagger: 0.12,\n  scrollTrigger: {\n    trigger: \'.grid\',\n    start: \'top 80%\'\n  }\n});\n```\n\n## 實用技巧\n\n- 使用 `will-change: transform` 提升 GPU 加速效能\n- 善用 `stagger` 製造錯落有致的入場效果\n- 配合 `ScrollTrigger.refresh()` 處理動態內容\n- 用 `gsap.context()` 做好清理，避免記憶體洩漏\n\n## 結語\n\nGSAP 的學習曲線相對平緩，但能做出的效果卻非常豐富。建議從官方文件的 Getting Started 開始，搭配 CodePen 練習，很快就能上手！',
  TRUE,
  (SELECT id FROM users WHERE email = 'qweasd226410@gmail.com')
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO blog_posts (title, slug, summary, content, published, author_id)
VALUES (
  'Next.js 14 vs Vite：2024 該如何選擇？',
  'nextjs-vs-vite-2024',
  '隨著 Next.js 14 帶來 App Router 和 Server Actions，以及 Vite 持續以極速著稱，這兩個工具各有千秋。本文從實際開發角度分析如何做出最佳選擇。',
  E'## 前言\n\n2024 年前端生態系百花齊放，Next.js 14 和 Vite 都是備受開發者推崇的工具，但它們的設計哲學卻截然不同。\n\n## Next.js 14 的強項\n\n### Server Components\n\nNext.js 14 的 App Router 帶來了真正的 React Server Components 支援：\n\n```jsx\n// 這個元件在伺服器端執行，不會增加客戶端 bundle\nasync function BlogList() {\n  const posts = await fetchPosts();\n  return <ul>{posts.map(p => <li key={p.id}>{p.title}</li>)}</ul>;\n}\n```\n\n### Server Actions\n\n表單處理變得前所未有地簡潔，完全不需要手寫 API endpoint。\n\n## Vite 的強項\n\n- 極速的開發伺服器啟動（HMR 幾乎即時）\n- 設定簡單，幾乎零配置就能跑起來\n- 非常適合純 SPA 或客戶端渲染專案\n- 打包產物乾淨，易於部署\n\n## 如何選擇？\n\n- **需要 SEO / SSR / 全端功能** → 選 Next.js\n- **純前端 SPA / 工具類網站** → 選 Vite\n- **企業級專案 / 需要 ISR** → 選 Next.js\n- **學習 React 基礎 / 快速原型** → 選 Vite\n\n## 結論\n\n兩者都是優秀的工具，沒有絕對的好壞之分。關鍵在於了解你的專案需求，選擇最適合的工具！',
  TRUE,
  (SELECT id FROM users WHERE email = 'qweasd226410@gmail.com')
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO blog_posts (title, slug, summary, content, published, author_id)
VALUES (
  'AI 工具如何徹底改變我的開發流程',
  'ai-tools-changed-my-workflow',
  '從 GitHub Copilot 到 ChatGPT，再到 Claude，AI 工具已經深度融入我的日常開發。這篇文章分享我實際使用這些工具的心得與最佳實踐。',
  E'## AI 工具已不可忽視\n\n2023 年是 AI 工具爆發的元年，而 2024 年這些工具已經成為許多開發者工作流程中不可或缺的一部分。\n\n## 我常用的 AI 工具\n\n### GitHub Copilot\n\nCopilot 最擅長的是補全重複性高的程式碼：\n\n```js\n// 只要打出函式名稱，Copilot 就能猜出你想做什麼\nfunction formatDate(date) {\n  // Copilot 會自動補全格式化邏輯\n}\n```\n\n### Claude\n\n我最常用 Claude 來做：\n\n- 程式碼 review 和重構建議\n- 解釋複雜的演算法\n- 撰寫技術文件和 README\n- debug 難以追蹤的邏輯錯誤\n\n### ChatGPT\n\n適合用來快速查詢、生成測試資料、以及處理非技術性寫作任務。\n\n## 最佳實踐\n\n- **不要盲目貼上 AI 生成的程式碼**，務必理解每一行的意思\n- 用 AI 做第一輪草稿，人工做最後審查\n- 善用 AI 解釋你看不懂的程式碼或文件\n- 把 AI 當成結對程式設計的夥伴，而非替代品\n\n## 結語\n\nAI 工具大幅提升了我的生產力，但最重要的是保持對程式碼的理解和掌控。AI 是工具，判斷力仍然在人。',
  TRUE,
  (SELECT id FROM users WHERE email = 'qweasd226410@gmail.com')
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO blog_posts (title, slug, summary, content, cover_image, published, author_id)
VALUES (
  '打造完美 UI/UX：設計師與工程師的橋樑',
  'perfect-ui-ux-design',
  '身為一個兼具設計思維的工程師，我分享如何在 Figma 與程式碼之間搭起橋樑，打造既美觀又易用的介面。',
  E'## 設計與開發的鴻溝\n\n許多專案失敗的原因不是技術不好，而是設計與開發之間缺乏有效的溝通。作為一個同時懂設計和開發的人，我想分享一些實際心得。\n\n## Figma 是工程師的好朋友\n\nFigma 不只是設計師的工具，工程師也應該學會看懂 Figma：\n\n- 直接從 Figma 複製 CSS 數值（padding、color、font-size）\n- 使用 Dev Mode 快速取得設計規格\n- 透過 Auto Layout 理解響應式設計邏輯\n\n## CSS 變數讓設計系統落地\n\n```css\n:root {\n  --color-primary: #d4f029;\n  --color-bg: #080808;\n  --font-sans: \'Space Grotesk\', sans-serif;\n  --spacing-base: 8px;\n}\n```\n\n把設計 token 轉化為 CSS 變數，讓設計系統真正在程式碼中活起來。\n\n## UX 原則在程式碼中的體現\n\n- **反饋即時性**：按鈕點擊後要有視覺反應（loading state）\n- **容錯設計**：表單錯誤訊息要清楚且有建設性\n- **漸進揭露**：複雜功能分步驟引導，不要一次全部丟給使用者\n- **無障礙設計**：確保 ARIA 標籤和鍵盤導航正確運作\n\n## 結語\n\n最好的 UI/UX 是那些讓使用者感覺不到「設計」存在的設計——自然、流暢、符合直覺。',
  'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=800&q=80',
  TRUE,
  (SELECT id FROM users WHERE email = 'qweasd226410@gmail.com')
) ON CONFLICT (slug) DO UPDATE SET cover_image = EXCLUDED.cover_image;

INSERT INTO blog_posts (title, slug, summary, content, published, author_id)
VALUES (
  '從零開始的 PostgreSQL：我學到的五件事',
  'postgresql-five-lessons',
  '從 NoSQL 轉戰 PostgreSQL，我踩過不少坑也學到了很多。這篇文章整理了五個讓我對關聯式資料庫改觀的關鍵概念。',
  E'## 為什麼選 PostgreSQL？\n\n在使用過 MongoDB 之後，我因為專案需求開始學習 PostgreSQL。剛開始覺得 SQL 很繁瑣，但用久了才發現它的強大之處。\n\n## 第一件事：Schema 設計很重要\n\n好的資料庫設計可以省去大量後端邏輯。花時間設計正規化的 schema 是值得的投資：\n\n```sql\nCREATE TABLE blog_posts (\n  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),\n  title      VARCHAR(255) NOT NULL,\n  slug       VARCHAR(255) UNIQUE NOT NULL,\n  content    TEXT,\n  published  BOOLEAN NOT NULL DEFAULT FALSE,\n  author_id  UUID REFERENCES users(id),\n  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()\n);\n```\n\n## 第二件事：索引是效能的關鍵\n\n沒有索引的查詢在資料量大時會慢到讓人崩潰：\n\n```sql\nCREATE INDEX IF NOT EXISTS idx_posts_slug ON blog_posts(slug);\nCREATE INDEX IF NOT EXISTS idx_posts_author ON blog_posts(author_id);\n```\n\n## 第三件事：JSONB 讓 PostgreSQL 也能做 NoSQL\n\nPostgreSQL 的 JSONB 類型讓你在需要靈活結構時不用犧牲關聯式資料庫的優點。\n\n## 第四件事：Transaction 是你的安全網\n\n涉及多個表格的寫入操作，務必使用 Transaction 確保資料一致性。\n\n## 第五件事：EXPLAIN ANALYZE 是 debug 神器\n\n當查詢變慢，`EXPLAIN ANALYZE` 能告訴你問題出在哪裡，比盲目猜測有效多了。\n\n## 結語\n\nPostgreSQL 是一個功能極其豐富的資料庫系統，越深入越覺得它的設計精妙。如果你還在猶豫要不要學，我的答案是：絕對值得！',
  TRUE,
  (SELECT id FROM users WHERE email = 'qweasd226410@gmail.com')
) ON CONFLICT (slug) DO NOTHING;
