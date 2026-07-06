# 🚀 Wayne's Portfolio & Editorial Studio

<div align="center">

**不只是個人網站，是一座結合 AI 深度整合、即時多人遊戲、與電影級動畫的作品集展示平台。**

[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?logo=postgresql&logoColor=white)](https://neon.tech/)
[![Socket.io](https://img.shields.io/badge/Socket.io-即時通訊-010101?logo=socket.io&logoColor=white)](https://socket.io/)
[![Gemini](https://img.shields.io/badge/Gemini-AI%20整合-8E75B2?logo=google&logoColor=white)](https://ai.google.dev/)
[![Deploy](https://img.shields.io/badge/Vercel-部署中-000000?logo=vercel&logoColor=white)](https://vercel.com/)

</div>

---

## 📋 目錄

- [核心特色](#-核心特色)
- [技術棧](#-技術棧)
- [專案結構](#-專案結構)
- [本地開發](#-本地開發)
- [環境變數](#-環境變數)
- [部署](#-部署)
- [聯繫我](#-聯繫我)

---

## 🌟 核心特色

### 🤖 Wobot AI 創意助理
- **RAG 智能對話**：整合 Google Gemini API + pgvector 向量搜尋，讓助理精準掌握作品集所有資訊
- **三種人格模式**：正常模式（專業友善）、傲嬌模式（毒舌吐槽）、崇拜模式（極度誇讚）
- **語音互動**：支援 Edge TTS 語音輸出 + STT 語音辨識
- **表情動畫系統**：情境感應的即時表情（說話、大笑、眨眼、思考）
- **AI 繪圖**：整合 Stability AI 實現即時畫像生成

### 🎨 極致視覺體驗
- **電影級滾動動畫**：GSAP ScrollTrigger + SplitType 打造無縫捲動
- **流暢物理滾動**：Lenis 平滑滑動引擎
- **現代美學 UI**：玻璃擬態 (Glassmorphism)、粒子背景、光束特效
- **自定義動態游標**：磁吸效果 + 互動回饋
- **Preloader 動畫**：品牌級載入畫面

### 🎮 即時互動遊戲系統
- **多人魔王群戰 (Boss Raid)**：Socket.io 即時同步、全域傷害排行榜、陣營系統
- **經典遊戲重構**：2048、貪食蛇、小恐龍跑酷、打磚塊、坦克大戰
- **薪水計算機**：趣味互動小工具

### ✍️ 技術部落格
- **前端快取層**：sessionStorage 智能快取，切換分頁不重複請求
- **AI 主題封面**：每篇文章自動生成精美封面圖
- **Markdown 渲染**：支援 GFM、程式碼語法高亮、圖片嵌入

### 🔐 完整會員系統
- **多元登入**：Google / GitHub / Facebook / LINE OAuth 2.0 + 本地註冊
- **JWT 雙 Token**：Access Token + Refresh Token 安全機制
- **信箱驗證 & 密碼重設**：SMTP 寄信流程完整實現

### 💬 社群互動
- **留言系統**：即時留言與回覆
- **表情反應**：文章 Emoji 反應功能
- **待辦清單**：個人化 Todo List

---

## 🛠 技術棧

### 前端

| 類別 | 技術 |
|------|------|
| 框架 | React 18 + Vite 5 |
| 狀態管理 | Zustand |
| 動畫 | GSAP (ScrollTrigger, SplitType) + Framer Motion |
| 滾動引擎 | Lenis |
| 樣式 | Tailwind CSS 4 |
| 路由 | React Router v6 |
| UI 元件 | Radix UI (Dialog, Tooltip, Progress) |
| 即時通訊 | Socket.io Client |
| 物理引擎 | Matter.js（遊戲用） |
| Markdown | react-markdown + remark-gfm + rehype-raw |

### 後端

| 類別 | 技術 |
|------|------|
| 框架 | Node.js + Express |
| 資料庫 | PostgreSQL (Neon) + pgvector |
| 即時通訊 | Socket.io |
| AI | Google Gemini API + Stability AI |
| 語音 | Edge TTS (msedge-tts) |
| 認證 | Passport.js (Google, GitHub, Facebook, LINE, Local) |
| 安全 | JWT (Access + Refresh Token) + bcrypt |
| 寄信 | Nodemailer (SMTP) |

### 部署

| 服務 | 用途 |
|------|------|
| Vercel | 前端靜態部署 |
| Render / Railway | 後端 API + WebSocket |
| Neon | Serverless PostgreSQL |

---

## 📂 專案結構

```text
MyPortfolio/
├── frontend/                    # 🎨 前端（Vite + React）
│   ├── src/
│   │   ├── components/          # UI 元件
│   │   │   ├── AIAssistant.jsx  #   Wobot AI 助理
│   │   │   ├── Hero.jsx         #   首頁 Hero 滾動動畫
│   │   │   ├── About.jsx        #   關於我
│   │   │   ├── Projects.jsx     #   專案展示
│   │   │   ├── Blog.jsx         #   部落格列表
│   │   │   ├── Marquee.jsx      #   跑馬燈
│   │   │   ├── WorkTimeline.jsx #   工作經歷時間軸
│   │   │   ├── Certificates.jsx #   證照展示
│   │   │   ├── Comments.jsx     #   留言系統
│   │   │   ├── Reactions.jsx    #   表情反應
│   │   │   ├── YorkieDog.jsx    #   約克夏互動角色
│   │   │   ├── Preloader.jsx    #   載入動畫
│   │   │   ├── TopNav.jsx       #   導航列
│   │   │   ├── Footer.jsx       #   頁尾
│   │   │   └── ui/              #   通用 UI 元件
│   │   ├── pages/               # 頁面路由
│   │   │   ├── BlogPage.jsx     #   部落格頁
│   │   │   ├── BlogPostPage.jsx #   文章詳情頁
│   │   │   ├── ProjectsPage.jsx #   專案頁
│   │   │   ├── FunPage.jsx      #   遊戲娛樂頁
│   │   │   ├── Login.jsx        #   登入/註冊
│   │   │   └── ...              #   其他頁面
│   │   ├── hooks/               # 自定義 Hooks
│   │   ├── store/               # Zustand 狀態管理
│   │   ├── services/            # API 服務層
│   │   ├── utils/               # 工具函式
│   │   └── config/              # 設定檔
│   └── public/                  # 靜態資源
│
├── backend/                     # ⚙️ 後端（Node.js + Express）
│   └── src/
│       ├── index.js             # 伺服器入口
│       ├── routes/              # API 路由
│       │   ├── ai.js            #   AI 對話 / TTS / 繪圖
│       │   ├── auth.js          #   認證 (OAuth + JWT)
│       │   ├── blog.js          #   部落格 CRUD
│       │   ├── projects.js      #   專案（GitHub API）
│       │   ├── boss.js          #   Boss Raid 遊戲
│       │   ├── faction.js       #   陣營系統
│       │   ├── leaderboard.js   #   排行榜
│       │   ├── comments.js      #   留言
│       │   └── reactions.js     #   表情反應
│       ├── controllers/         # 控制器層
│       ├── services/            # 服務層（GitHub 整合）
│       ├── sockets/             # WebSocket 即時通訊
│       ├── db/                  # 資料庫
│       │   ├── schema.sql       #   完整資料表結構
│       │   ├── seed_blog.js     #   部落格種子資料
│       │   ├── seed_knowledge.js#   RAG 知識庫種子
│       │   └── index.js         #   DB 連線池
│       ├── middlewares/         # 中間件
│       ├── config/              # Passport 設定
│       └── utils/               # JWT / Mailer 工具
│
├── .env.example                 # 環境變數範本
├── .gitignore
└── README.md
```

---

## 🚀 本地開發

### 前置需求

- **Node.js** >= 18
- **PostgreSQL** 資料庫（推薦使用 [Neon](https://neon.tech/) 免費方案）
- **API Keys**：Gemini API、Stability AI、GitHub Token

### 1. Clone 專案

```bash
git clone https://github.com/WayneLY-Chen/MyPortfolio.git
cd MyPortfolio
```

### 2. 安裝依賴

```bash
# 前端
cd frontend && npm install

# 後端
cd ../backend && npm install
```

### 3. 設定環境變數

```bash
# 後端
cp backend/.env.example backend/.env
# 編輯 .env 填入你的實際值
```

### 4. 初始化資料庫

```bash
cd backend

# 建立資料表
psql $DATABASE_URL -f src/db/schema.sql

# 匯入部落格種子資料
node src/db/seed_blog.js

# 匯入 RAG 知識庫
node src/db/seed_knowledge.js
```

### 5. 啟動開發伺服器

```bash
# 後端 (port 3001)
cd backend && npm run dev

# 前端 (port 5173)，開另一個終端
cd frontend && npm run dev
```

開啟瀏覽器前往 `http://localhost:5173` 🎉

---

## 🔑 環境變數

參考 [`backend/.env.example`](backend/.env.example) 設定所有必要的環境變數：

| 變數 | 說明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 連線字串（Neon） |
| `GEMINI_API_KEY` | Google Gemini AI API Key |
| `STABILITY_API_KEY` | Stability AI 繪圖 API Key |
| `GITHUB_TOKEN` | GitHub Personal Access Token（讀取 Repo 資訊） |
| `JWT_ACCESS_SECRET` | JWT Access Token 密鑰 |
| `JWT_REFRESH_SECRET` | JWT Refresh Token 密鑰 |
| `GOOGLE_CLIENT_*` | Google OAuth 2.0 憑證 |
| `GITHUB_CLIENT_*` | GitHub OAuth 2.0 憑證 |
| `LINE_CHANNEL_*` | LINE Login 憑證 |
| `FACEBOOK_APP_*` | Facebook Login 憑證 |
| `SMTP_*` | SMTP 寄信設定（Gmail App Password） |

---

## ☁️ 部署

### 前端 → Vercel

1. Import GitHub Repo 到 [Vercel](https://vercel.com/)
2. Root Directory 設為 `frontend`
3. Build Command: `npm run build`
4. Output Directory: `dist`

### 後端 → Render / Railway

1. Root Directory 設為 `backend`
2. Build Command: `npm install`
3. Start Command: `npm start`
4. 設定所有環境變數（同 `.env.example`）

### 資料庫 → Neon

1. 在 [Neon](https://neon.tech/) 建立免費的 PostgreSQL 資料庫
2. 複製連線字串到 `DATABASE_URL`
3. 執行 `schema.sql` 初始化資料表
4. 執行 seed 腳本匯入初始資料

---

## 👨‍💻 聯繫我

**陳林淯 (Wayne)**
*Creative Developer | Full-Stack Explorer*

[![GitHub](https://img.shields.io/badge/GitHub-WayneLY--Chen-181717?logo=github)](https://github.com/WayneLY-Chen)
[![Instagram](https://img.shields.io/badge/Instagram-@mr.w__1022-E4405F?logo=instagram&logoColor=white)](https://www.instagram.com/mr.w_1022/?hl=zh-tw)
[![Email](https://img.shields.io/badge/Email-qweasd226410@gmail.com-EA4335?logo=gmail&logoColor=white)](mailto:qweasd226410@gmail.com)

---

<div align="center">

> 💡 歡迎 ⭐ Star 此專案，或透過右下角的 **Wobot 助理**了解更多關於我的細節！

</div>

