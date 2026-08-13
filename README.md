<div align="center">

# Wayne's Portfolio

**一個可以動手玩的個人作品集網站。**
遊戲、開發者工具、AI 模擬面試都能直接在站上操作 —— 不只是一頁往下捲的靜態履歷。

### [→ 前往網站](https://my-portfolio-waynely-chens-projects.vercel.app)

[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?logo=postgresql&logoColor=white)](https://neon.tech/)
[![Socket.io](https://img.shields.io/badge/Socket.io-即時通訊-010101?logo=socket.io&logoColor=white)](https://socket.io/)
[![Gemini](https://img.shields.io/badge/Gemini-AI-8E75B2?logo=google&logoColor=white)](https://ai.google.dev/)
[![Vercel](https://img.shields.io/badge/Vercel-部署中-000000?logo=vercel&logoColor=white)](https://vercel.com/)

<br>

<img src="docs/screenshots/fun.png" alt="功能頁:六個互動分頁" width="88%">

</div>

<br>

## 為什麼做成這樣

作品集網站最常見的下場,是訪客捲到底、關掉、忘記。

所以這個站把重心放在 **功能頁 (`/fun`)** —— 六個分頁,每一個都要真的動手才有東西發生:玩一場卡牌 Boss 戰、跟人搶格子、比打字速度、用工具箱處理一段 JSON,或者讓 AI 面你五題再給你逐題的改進建議。

首頁動畫、專案展示、部落格、會員系統這些都做得完整,但它們是基礎,不是差異化。**差異化是「訪客願意留下來操作」。**

<br>

## 主要功能

### AI 模擬面試官

<img src="docs/screenshots/interview.png" alt="模擬面試的評分結果頁" width="100%">

選一個職缺方向與語言,AI 出五題、逐題語音朗讀、文字作答,最後給總分與**逐題的具體改進建議**。

- **四個方向** — 前端 / 後端 / 全端 / 新鮮人,題目由 Gemini 依方向生成(3–4 題技術 + 1–2 題行為)
- **中英雙語** — 切換語言時題目、AI 回饋與整個介面都跟著換,語音也換聲線
- **語音朗讀** — 每題自動朗讀,可重聽 / 停止 / 靜音,語速三段可調
- **結果頁** — 總分、評等、逐題摺疊回饋,可複製純文字或直接列印成 PDF
- **評分失敗時保住作答** — 五段作答全文留在畫面上,重試送出的請求與第一次逐位元組相同

### Wobot AI 助理

站內右下角的常駐助理,由 Google Gemini 驅動。

- **三種人格** — 正常(專業友善)、傲嬌(毒舌吐槽)、崇拜(極度誇讚)
- **語音雙向** — Edge TTS 輸出 + 瀏覽器原生語音辨識輸入
- **表情動畫** — 依對話情境切換(說話、大笑、眨眼、思考)
- **AI 繪圖** — 整合 Stability AI 即時生成畫像

> 助理對本站的知識目前以系統提示注入([`ai.js`](backend/src/routes/ai.js));`schema.sql` 內已備妥 pgvector 的資料表結構,尚未接入檢索流程。

### 互動遊戲

| 遊戲 | 說明 |
|---|---|
| **尾刀爭奪戰** | 卡牌制 Boss 戰。魔王是 WebGL 即時光線行進算出來的 3D 骷髏,沒有模型檔 |
| **陣營大戰** | Socket.io 即時同步的雙人搶格子對戰 |
| **打字競速** | 中英文題庫,即時計算速度與正確率,附排行榜 |
| **經典重構** | 貪食蛇、恐龍避障、2048 |

### 開發者工具箱

七個純前端、零上傳的小工具:JSON 格式化、Base64、JWT 解碼、時間戳轉換、雜湊、UUID、URL 編碼。全部在瀏覽器本機完成,貼進去的內容不會離開你的電腦。

### 其他

- **技術部落格** — Markdown 渲染(GFM + 語法高亮),前端 `sessionStorage` 快取層
- **會員系統** — Google / GitHub / Facebook / LINE OAuth 2.0 + 本地註冊,JWT 雙 Token
- **社群互動** — 留言、表情反應、個人待辦清單
- **視覺** — GSAP ScrollTrigger 滾動動畫、Lenis 平滑滾動、自定義動態游標

<img src="docs/screenshots/home.png" alt="首頁 About 區段" width="100%">

<br>

## 幾段值得一看的程式碼

如果你只想抽幾段來看,我會推薦這幾處 —— 它們都是踩過坑之後才長成現在的樣子。

**[`backend/src/routes/ai.js`](backend/src/routes/ai.js)**

- *不採信模型自報的題號。* Gemini 回傳的 `questionIndex` 實測是 1-based,照它對齊會讓兩題拿到同一則評語 —— 而整份回饋看起來格式完全正常,只有逐字讀才會發現錯位。改成只用陣列位置對齊。
- *語速白名單用 `Map` 而非物件字面值。* `rate` 最終會被內插進 `<prosody rate="...">`;用物件查表時 `'constructor'`、`'__proto__'` 這類鍵會查到 `Object.prototype` 上的東西(truthy,所以 `?? 1` 不會觸發),整包被塞進 SSML。
- *逾時是每次嘗試各自計時。* 原本把逾時包在整個重試迴圈外面,上游一變慢就直接失敗,重試等於沒有作用。

**[`frontend/src/components/interview/InterviewTab.jsx`](frontend/src/components/interview/InterviewTab.jsx)**
評分失敗時保住五段作答。使用者打完五段字最後什麼都沒拿到,是這個功能唯一不可接受的失敗,所以錯誤卡與作答保留區是同一次渲染,重試也不清空。

**[`frontend/src/components/boss-skull/BossSkull.jsx`](frontend/src/components/boss-skull/BossSkull.jsx)**
用 SDF 組合出頭骨形狀並即時光線行進,沒有任何模型檔。依賴只有約 10KB 的 OGL,而不是整包 Three.js。

**[`frontend/src/index.css`](frontend/src/index.css)**
CSS 分層的坑:沒有分層的 `*` reset 永遠贏過 `@layer utilities`,跟具體度無關。這曾讓全站的 Tailwind 間距工具類靜默失效 —— `.p-5` 實測是 0px。

<br>

## 技術棧

| | |
|---|---|
| **前端** | React 18 · Vite 5 · Zustand · React Router v6 · Tailwind CSS 4 · Radix UI |
| **動畫 / 圖形** | GSAP (ScrollTrigger, SplitType) · Framer Motion · Lenis · Matter.js · OGL (WebGL) |
| **後端** | Node.js · Express · Socket.io · Passport.js · JWT + bcrypt · Nodemailer |
| **資料** | PostgreSQL (Neon) |
| **AI / 語音** | Google Gemini · Stability AI · Edge TTS (`msedge-tts`) |
| **測試** | Vitest（後端 369 個測試） |
| **部署** | Vercel(前端 + serverless proxy)· Render(後端 + WebSocket)· Neon(資料庫) |

<br>

## 本地開發

<details>
<summary><b>展開安裝、環境變數與部署步驟</b></summary>

<br>

**前置需求:** Node.js >= 18、PostgreSQL 資料庫(推薦 [Neon](https://neon.tech/) 免費方案)、Gemini / Stability AI / GitHub Token 三組 API Key。

```bash
git clone https://github.com/WayneLY-Chen/MyPortfolio.git
cd MyPortfolio

# 安裝依賴
cd frontend && npm install
cd ../backend && npm install

# 設定環境變數
cp .env.example .env      # 在 backend/ 底下,編輯後填入實際值
```

### 環境變數

| 變數 | 說明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 連線字串（Neon） |
| `GEMINI_API_KEY` | Google Gemini AI API Key |
| `STABILITY_API_KEY` | Stability AI 繪圖 API Key |
| `GITHUB_TOKEN` | GitHub Personal Access Token（讀取 Repo 資訊） |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | JWT 密鑰 |
| `GOOGLE_CLIENT_*` / `GITHUB_CLIENT_*` | Google、GitHub OAuth 2.0 憑證 |
| `LINE_CHANNEL_*` / `FACEBOOK_APP_*` | LINE Login、Facebook Login 憑證 |
| `SMTP_*` | SMTP 寄信設定（Gmail App Password） |

完整清單見 [`backend/.env.example`](backend/.env.example)。

### 初始化資料庫

```bash
cd backend
psql $DATABASE_URL -f src/db/schema.sql   # 建立資料表
node src/db/seed_blog.js                  # 部落格種子資料
node src/db/seed_knowledge.js             # Wobot 知識庫
```

### 啟動

```bash
cd backend && npm run dev     # port 3001
cd frontend && npm run dev    # port 5173，另開一個終端
```

開啟 `http://localhost:5173`。跑測試:`cd backend && npm test`。

### 部署

- **前端 → Vercel**:Root Directory 設為 `frontend`,Build Command `npm run build`,Output Directory `dist`
- **後端 → Render**:Root Directory 設為 `backend`,Build Command `npm install`,Start Command `npm start`,並設定所有環境變數
- **資料庫 → Neon**:建立免費 PostgreSQL,複製連線字串到 `DATABASE_URL`,執行 `schema.sql` 與 seed 腳本

</details>

<details>
<summary><b>展開專案結構</b></summary>

<br>

```text
MyPortfolio/
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── AIAssistant.jsx      # Wobot AI 助理
│       │   ├── Hero.jsx             # 首頁滾動動畫
│       │   ├── About.jsx            # 關於我
│       │   ├── Projects.jsx         # 專案展示
│       │   ├── Blog.jsx             # 部落格
│       │   ├── WorkTimeline.jsx     # 工作經歷時間軸
│       │   ├── Certificates.jsx     # 證照展示
│       │   ├── Comments.jsx         # 留言系統
│       │   ├── YorkieDog.jsx        # 約克夏互動角色
│       │   ├── boss-skull/          # WebGL 3D 骷髏魔王
│       │   ├── devtools/            # 開發者工具箱
│       │   ├── interview/           # AI 模擬面試官
│       │   ├── typing-race/         # 打字競速
│       │   └── ui/                  # 通用元件
│       ├── pages/
│       │   ├── FunPage.jsx          # 功能頁（六個互動分頁）
│       │   ├── BlogPage.jsx         # 部落格
│       │   ├── ProjectsPage.jsx     # 專案
│       │   └── Login.jsx            # 登入 / 註冊
│       ├── hooks/  store/  services/  utils/  config/
│
├── backend/
│   ├── .env.example
│   └── src/
│       ├── index.js                 # 伺服器入口
│       ├── routes/
│       │   ├── ai.js                # AI 對話 / TTS / 繪圖 / 模擬面試
│       │   ├── auth.js              # 認證（OAuth + JWT）
│       │   ├── blog.js  projects.js  boss.js  faction.js
│       │   └── leaderboard.js  comments.js  reactions.js
│       ├── interview/               # 面試的提示詞、schema 與評測
│       ├── sockets/                 # WebSocket 即時通訊
│       ├── db/                      # schema.sql、種子腳本、連線池
│       ├── controllers/  services/  middlewares/  config/  utils/
│
└── docs/screenshots/
```

</details>

<br>

---

<div align="center">

### 陳林淯 (Wayne)

Creative Developer · Full-Stack Explorer

[![GitHub](https://img.shields.io/badge/GitHub-WayneLY--Chen-181717?logo=github)](https://github.com/WayneLY-Chen)
[![Instagram](https://img.shields.io/badge/Instagram-@mr.w__1022-E4405F?logo=instagram&logoColor=white)](https://www.instagram.com/mr.w_1022/?hl=zh-tw)
[![Email](https://img.shields.io/badge/Email-qweasd226410@gmail.com-EA4335?logo=gmail&logoColor=white)](mailto:qweasd226410@gmail.com)

<br>

歡迎到站上右下角找 **Wobot** 問問關於我的事

</div>
