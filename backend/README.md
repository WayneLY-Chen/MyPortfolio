# Portfolio Backend

個人作品集網站後端服務，使用 Node.js + Express + PostgreSQL 建構。

---

## 環境需求

| 工具 | 版本建議 |
|------|----------|
| Node.js | v18 以上 |
| npm | v9 以上 |
| PostgreSQL | v14 以上 |

---

## 安裝步驟

**1. 進入後端目錄**

```bash
cd backend
```

**2. 安裝相依套件**

```bash
npm install
```

**3. 設定環境變數**

```bash
cp .env.example .env
```

開啟 `.env` 並填入實際設定值：

```env
PORT=3001
DATABASE_URL=postgresql://your_user:your_password@localhost:5432/portfolio_db
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx   # 選填，設定後可提高 API rate limit
```

---

## 資料庫設定

**1. 建立資料庫**

```bash
createdb portfolio_db
```

或在 psql 中執行：

```sql
CREATE DATABASE portfolio_db;
```

**2. 執行 Schema 建立資料表**

```bash
npm run db:init
```

此指令會執行 `src/db/schema.sql`，建立以下三張資料表：

- `projects` — 儲存從 GitHub 同步的專案資料
- `blog_posts` — 部落格文章
- `profile` — 個人資料

---

## 啟動方式

**開發模式（使用 nodemon 自動重啟）**

```bash
npm run dev
```

**正式模式**

```bash
npm start
```

服務啟動後，預設監聽 `http://localhost:3001`。

---

## API 文件

### Health Check

#### `GET /health`

確認服務是否正常運行。

**回應範例**

```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

### 專案列表

#### `GET /api/projects`

取得 GitHub 公開專案列表。

**快取機制：** 首次請求會呼叫 GitHub API 並將結果存入資料庫；1 小時內的後續請求直接從資料庫回傳（不再呼叫 GitHub API）。

**回應範例**

```json
{
  "success": true,
  "source": "cache",
  "data": [
    {
      "id": 1,
      "name": "repo-name",
      "description": "專案描述",
      "url": "https://github.com/WayneLY-Chen/repo-name",
      "homepage": "https://example.com",
      "language": "JavaScript",
      "stars": 5,
      "forks": 2,
      "topics": ["react", "typescript"],
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

| 欄位 | 說明 |
|------|------|
| `source` | `"cache"` 表示來自資料庫快取；`"github"` 表示剛從 GitHub API 即時取得；`"error"` 表示查詢失敗並回傳空陣列 |

---

### 個人資料

#### `GET /api/profile`

取得個人資料。若資料庫尚未設定，回傳預設值。

**回應範例**

```json
{
  "success": true,
  "source": "default",
  "data": {
    "name": "陳林淯",
    "title": "Creative Developer",
    "bio": null,
    "github": "https://github.com/WayneLY-Chen",
    "instagram": "https://www.instagram.com/mr.w_1022/?hl=zh-tw",
    "email": "qweasd226410@gmail.com"
  }
}
```

| 欄位 | 說明 |
|------|------|
| `source` | `"database"` 表示來自資料庫；`"default"` 表示回傳預設值 |

---

### 部落格

#### `GET /api/blog`

取得所有**已發布**的部落格文章清單（不含完整內文）。無文章時回傳空陣列。

**回應範例**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "文章標題",
      "slug": "article-slug",
      "summary": "文章摘要",
      "published": true,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### `GET /api/blog/:slug`

取得單篇文章的完整內容。

**路徑參數**

| 參數 | 說明 |
|------|------|
| `slug` | 文章的唯一識別碼（slug） |

**回應範例（成功）**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "title": "文章標題",
    "slug": "article-slug",
    "content": "完整文章內容...",
    "summary": "文章摘要",
    "published": true,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

**回應範例（找不到）**

```json
{
  "success": false,
  "message": "找不到指定的文章"
}
```

---

## 目錄結構

```
backend/
├── src/
│   ├── index.js                    # Express 入口點、middleware、路由掛載
│   ├── routes/
│   │   ├── projects.js             # GET /api/projects
│   │   ├── profile.js              # GET /api/profile
│   │   └── blog.js                 # GET /api/blog, GET /api/blog/:slug
│   ├── controllers/
│   │   ├── projectsController.js   # 快取邏輯、GitHub 資料寫入
│   │   ├── profileController.js    # 個人資料查詢與預設值
│   │   └── blogController.js       # 文章列表與單篇查詢
│   ├── db/
│   │   ├── index.js                # pg Pool 連線設定
│   │   └── schema.sql              # 資料表定義
│   └── services/
│       └── githubService.js        # GitHub API 呼叫封裝
├── .env.example                    # 環境變數範本
├── package.json
└── README.md
```
