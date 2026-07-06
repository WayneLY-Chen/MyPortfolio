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
  try {
    await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS language_stats JSONB DEFAULT '{}'::jsonb;`);
    await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS image_url TEXT;`);
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
  } catch (err) {
    console.error('[DB] 資料庫遷移失敗:', err.message);
  }
};

setTimeout(runMigrations, 500);

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

module.exports = { pool, query };
