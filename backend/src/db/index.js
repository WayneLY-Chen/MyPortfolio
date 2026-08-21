const { Pool } = require('pg');
require('dotenv').config();
const { resolveDbSslOption, describeSslMode } = require('../config/dbSsl');

const dbUrl = process.env.DATABASE_URL || '';

// TLS 憑證驗證改為 fail-closed。先前這裡是 `{ rejectUnauthorized: false }`。
//
// 重要的前提，別誤讀：那行其實是死碼。pg 的 connection-parameters.js 讓連線
// 字串解析出來的值覆蓋程式傳入的值，因此只要 DATABASE_URL 帶了 sslmode，
// 程式這一側寫什麼都會被丟掉（已實測）。憑證驗證一直都是開著的。
//
// 改它的理由有二：一是 DATABASE_URL 若哪天換成不含 sslmode 的版本，那行就
// 會活過來並真的關掉驗證；二是死碼會誤導下一個讀它的人。
// 完整的實測結果與 pg v9 的行為變更詳見 config/dbSsl.js。
const pool = new Pool({
  connectionString: dbUrl,
  ssl: resolveDbSslOption(dbUrl),
});

pool.on('connect', () => {
  console.log('[DB] PostgreSQL 連線成功');
});

// REL-07 / D-13：把「這個部署連到哪個資料庫主機」變成一行可讀證據。只印
// hostname —— 絕不可印出完整連線字串、使用者名稱、密碼或 query string。
// dbUrl 為空字串或格式錯誤時 new URL 會拋錯，因此包在 try/catch 內做無害
// 處理，不得影響啟動流程。
try {
  console.log(`[DB] Target host: ${new URL(dbUrl).hostname}`);
} catch {
  console.log('[DB] Target host: (無法解析 DATABASE_URL)');
}

// 把「這條連線到底會不會驗證伺服器身分」變成啟動時看得見的一行。
//
// 這一段存在的理由是 pg v9 的行為變更：sslmode=require/prefer/verify-ca 屆時
// 會改成「加密但不驗證身分」，而程式碼擋不住（連線字串永遠覆蓋程式設定）。
// 沒有這行警告的話，那次退化不會有任何錯誤、任何行為變化，只是從某次
// npm update 起就不再驗證對方是誰。詳見 config/dbSsl.js。
const sslStatus = describeSslMode(dbUrl);
if (sslStatus.level === 'warn') {
  console.warn(`[DB] TLS 設定警告: ${sslStatus.message}`);
} else if (sslStatus.level === 'ok') {
  console.log(`[DB] TLS: ${sslStatus.message}`);
}

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

  // Email 大小寫：查詢一律用 LOWER(email) = LOWER($1) 比對（見
  // config/registrationValidation.js），這個函式索引讓那些查詢仍然走得到索引。
  // CREATE INDEX IF NOT EXISTS 是累加式的，不動任何既有資料，重複執行安全。
  await pool.query('CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));');

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
