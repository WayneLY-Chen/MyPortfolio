require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const http = require('http');

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

// CORS 定義
const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
    credentials: true,
  })
);

// 解析 JSON 請求 body
app.use(express.json());

// 解析 Cookie
app.use(cookieParser());

// Session（僅用於 OAuth state 交換，不做持久 session）
app.use(session({
  secret: process.env.SESSION_SECRET || process.env.JWT_ACCESS_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 10 * 60 * 1000  // 10 分鐘，只用於 OAuth state 交換
  }
}));

// 初始化 Passport
app.use(passport.initialize());

// 請求 logging（開發用）
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

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

initSockets(server);

server.listen(PORT, () => {
  console.log('========================================');
  console.log(`  Portfolio Backend 啟動成功 (Socket.io Enabled)`);
  console.log(`  Port    : ${PORT}`);
  console.log(`  環境    : ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Health  : http://localhost:${PORT}/health`);
  console.log('========================================');
});

module.exports = app;
