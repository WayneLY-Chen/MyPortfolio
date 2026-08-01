require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const http = require('http');
const { migrationsReady } = require('./db');

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

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Middleware

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

// API Routes

app.use('/api/projects', projectsRouter);
app.use('/api/profile', profileRouter);
app.use('/api/blog', blogRouter);
app.use('/auth', authRoutes);
app.use('/api/comments', commentsRoutes);
app.use('/api/ai', aiRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/reactions', reactionsRouter);
app.use('/api/faction', factionRouter);
app.use('/api/boss', bossRouter);

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
