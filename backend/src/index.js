require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const http = require('http');
const { migrationsReady, pool } = require('./db');

const projectsRouter = require('./routes/projects');
const profileRouter = require('./routes/profile');
const blogRouter = require('./routes/blog');
const authRoutes = require('./routes/auth');
const commentsRoutes = require('./routes/comments');
const passport = require('./config/passport');
const aiRouter = require('./routes/ai');
const leaderboardRouter = require('./routes/leaderboard');
const reactionsRouter = require('./routes/reactions');
const factionRouter = require('./routes/faction');
const bossRouter = require('./routes/boss');

const { initSockets } = require('./sockets');
const { guardRouter } = require('./middlewares/asyncGuard');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Middleware

// 安全標頭。掛在最前面，讓所有回應（含 CORS 預檢與錯誤回應）都帶上。
//
// crossOriginResourcePolicy 明確設為 cross-origin：helmet 預設是 same-origin，
// 而本服務是公開 API，前端在另一個網域（Vercel）。目前 /ai/tts 的音訊是用
// fetch + res.blob() 取回的（CORS 模式，不受 CORP 約束），所以預設值今天不會
// 出問題；但只要哪天改成用 <audio src> 直接載入就會變成 no-cors 請求而被擋，
// 且症狀難以追查。對公開 API 而言 same-origin 也換不到實質保護，故明確放寬。
//
// 其餘預設值（CSP、X-Content-Type-Options、Referrer-Policy、HSTS 等）維持
// helmet 的預設。本服務只回傳 JSON 與二進位音訊、不產生 HTML 頁面，預設 CSP
// 不會影響任何既有行為，但能保護框架自動產生的錯誤頁。
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS
const frontendUrls = (process.env.FRONTEND_URL || '').split(',').map(u => u.trim()).filter(Boolean);

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...frontendUrls
];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
  credentials: true,
}));

// 部署平台為 Render（D-12），單層 edge proxy，信任一跳 —— 讓 req.ip 反映真實
// client IP 而非 proxy 位址。必須在任何以 IP 計量的 rate limiter 掛載之前生效
// （02-04 會在 auth.js / comments.js / projects.js 掛上限流器，D-09）。
app.set('trust proxy', 1);

// 解析 JSON 請求 body
app.use(express.json());

// 解析 Cookie
app.use(cookieParser());

// [Startup] SESSION_SECRET 為必要環境變數：缺少即中止啟動。不再與
// JWT 存取權杖的密鑰共用備援 —— 兩者屬於不同信任域，共用正是 D-01
// 要消滅的問題。
if (!process.env.SESSION_SECRET) {
  console.error('[Startup] 缺少 SESSION_SECRET 環境變數，伺服器中止啟動');
  process.exit(1);
}

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 10 * 60 * 1000
  }
}));

// 初始化 Passport
app.use(passport.initialize());

if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });
}

// Health Check

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// GET /health/db — REL-07 / D-13：讓「production 的 DATABASE_URL 指向哪個
// 主機」與「資料庫是否可連線」變成一次可讀的請求。host 只取 hostname，
// 回應中絕不含帳號或密碼。實際的 production 判定（hostname 是否結尾為
// .neon.tech）是人工動作，見 user_setup 與 D-14。
app.get('/health/db', async (_req, res) => {
  let host = '';
  try {
    host = new URL(process.env.DATABASE_URL || '').hostname;
  } catch {
    host = '';
  }

  try {
    await pool.query('SELECT 1');
    res.json({ success: true, host, connected: true });
  } catch (err) {
    res.status(503).json({ success: false, host, connected: false, message: err.message });
  }
});

// API Routes
//
// 每個 router 掛載前都先過 guardRouter：Express 4 不會接住 async handler 的
// rejection，那類例外會變成 unhandledRejection，Node 24 預設中止行程 ——
// 也就是一個未驗證身分就能觸發的遠端 DoS（本輪已在 /api/ai/generate-image
// 實測到一個實例）。guardRouter 把每個 handler 的 rejection 導向 next()，
// 交給下方的全域錯誤中介層。詳見 middlewares/asyncGuard.js。

app.use('/api/projects', guardRouter(projectsRouter));
app.use('/api/profile', guardRouter(profileRouter));
app.use('/api/blog', guardRouter(blogRouter));
app.use('/auth', guardRouter(authRoutes));
app.use('/api/comments', guardRouter(commentsRoutes));
app.use('/api/ai', guardRouter(aiRouter));
app.use('/api/leaderboard', guardRouter(leaderboardRouter));
app.use('/api/reactions', guardRouter(reactionsRouter));
app.use('/api/faction', guardRouter(factionRouter));
app.use('/api/boss', guardRouter(bossRouter));

// 404 Handler

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: '找不到指定的路由',
  });
});

// Global Error Handler

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Error]', err.stack || err.message);

  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message:
      process.env.NODE_ENV === 'production'
        ? '伺服器內部錯誤'
        : err.message || '未知錯誤',
  });
});

// Start Server
// server.listen() 只能經由 migrationsReady.then() 抵達 —— migration 尚未成功前，
// 行程不綁定連接埠、不接受任何請求（REL-01, D-10/D-11）。失敗原因已在
// db/index.js 的 catch 記錄過，這裡不重複輸出。

migrationsReady.then(() => {
  initSockets(server);

  server.listen(PORT, () => {
    console.log('========================================');
    console.log(`  Portfolio Backend 啟動成功 (Socket.io Enabled)`);
    console.log(`  Port    : ${PORT}`);
    console.log(`  環境    : ${process.env.NODE_ENV || 'development'}`);
    console.log(`  Health  : http://localhost:${PORT}/health`);
    console.log('========================================');
  });
}).catch(() => process.exit(1));

module.exports = app;
