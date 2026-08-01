const { Pool } = require('pg');
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL || '';
const isHostedDb = dbUrl.includes('supabase.co') || dbUrl.includes('supabase.com') || dbUrl.includes('neon.tech');

const pool = new Pool({
  connectionString: dbUrl,
  ssl: isHostedDb || process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('connect', () => {
  console.log('[DB] PostgreSQL 連線成功');
});

// 自動執行資料庫欄位遷移，確保新增欄位存在
const runMigrations = async () => {
  await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS language_stats JSONB DEFAULT '{}'::jsonb;`);
  await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_url TEXT;`);
  await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS readme TEXT;`);
  // Email 驗證欄位
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ;`);
  // 忘記密碼欄位
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ;`);

  // Profile 擴充欄位 (Wobot 知識庫)
  await pool.query(`ALTER TABLE profile ADD COLUMN IF NOT EXISTS birthplace TEXT;`);
  await pool.query(`ALTER TABLE profile ADD COLUMN IF NOT EXISTS family TEXT;`);
  await pool.query(`ALTER TABLE profile ADD COLUMN IF NOT EXISTS education TEXT;`);
  await pool.query(`ALTER TABLE profile ADD COLUMN IF NOT EXISTS patents TEXT;`);
  await pool.query(`ALTER TABLE profile ADD COLUMN IF NOT EXISTS certificates TEXT;`);
  await pool.query(`ALTER TABLE profile ADD COLUMN IF NOT EXISTS experience TEXT;`);

  console.log('[DB] 資料庫欄位遷移完成');
};

// backend/src/index.js 的 server.listen() 只能經由這個 promise 的 .then() 抵達 ——
// 只要上面任何一條 migration 失敗，這個 promise 就會 reject（記錄後 re-throw），
// 讓行程中止啟動，而不是對著半遷移的 schema 提供服務（REL-01, D-10/D-11）。
// 絕不可在此吞掉錯誤：catch 若不 re-throw，這個 promise 永遠 resolve，
// index.js 的 gate 就永遠不會被觸發。
const migrationsReady = runMigrations().catch((err) => {
  console.error('[DB] 資料庫遷移失敗，伺服器將中止啟動:', err.stack || err.message);
  throw err;
});

pool.on('error', (err) => {
  console.error('[DB] PostgreSQL 連線錯誤:', err.message);
});

/**
 * 執行 SQL 查詢的輔助函式
 * @param {string} text - SQL 查詢語句
 * @param {Array} params - 查詢參數
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`[DB] 查詢完成 (${duration}ms):`, text.substring(0, 60));
    return result;
  } catch (err) {
    console.error('[DB] 查詢失敗:', err.message);
    throw err;
  }
};

module.exports = { pool, query, runMigrations, migrationsReady };
