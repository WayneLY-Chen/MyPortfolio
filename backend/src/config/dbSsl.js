// backend/src/config/dbSsl.js
//
// 決定 pg Pool 的 ssl 選項，並在啟動時檢查 DATABASE_URL 的 sslmode。
// 從 db/index.js 抽出來，是因為那個檔案在 import 當下就會建立連線池並跑
// migration，原地測不動：
//
//   npx vitest run src/config/dbSsl.test.js
//
// ---------------------------------------------------------------------------
// 先說清楚這裡「不是」什麼問題，避免日後誤讀
//
// db/index.js 先前寫的是 `ssl: { rejectUnauthorized: false }`。單看那一行會
// 以為資料庫連線的憑證驗證被關掉了 —— 實測證明並非如此。
//
// pg 8.20.0 的 lib/connection-parameters.js 第 60 行：
//
//   config = Object.assign({}, config, parse(config.connectionString))
//
// 連線字串解析出來的值「覆蓋」程式明確傳入的值。實測（用假的連線字串，
// 不需要任何真實憑證）：
//
//   URL 有 sslmode=require + 程式寫 rejectUnauthorized: false → 解析後 ssl = {}
//   URL 有 sslmode=require + 程式寫 rejectUnauthorized: true  → 解析後 ssl = {}
//   URL 沒有 sslmode      + 程式寫 rejectUnauthorized: true  → 解析後 ssl = {rejectUnauthorized: true}
//
// 也就是只要 DATABASE_URL 帶了 sslmode，程式這一側寫什麼都會被丟掉。`{}` 交給
// Node 的 tls.connect 時，rejectUnauthorized 的預設值是 true —— 憑證驗證一直
// 都是開著的。那行 `rejectUnauthorized: false` 是死碼。
//
// ---------------------------------------------------------------------------
// 真正的問題：這是一個「等著發生」的 fail-open
//
// pg 在啟動時會印出這段警告（實際觀察到）：
//
//   SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are
//   treated as aliases for 'verify-full'. In the next major version
//   (pg-connection-string v3.0.0 and pg v9.0.0), these modes will adopt
//   standard libpq semantics, which have weaker security guarantees.
//
// libpq 的語意裡，sslmode=require 是「一定要加密，但不驗證伺服器身分」。
// 也就是說 pg 升到 v9 的那一天，這個連線的憑證驗證會直接消失 —— 而且：
//
//   1. 沒有任何程式碼變更會伴隨它發生，一次例行的 npm update 就夠。
//   2. 程式這一側擋不住，因為連線字串永遠覆蓋程式的設定（上面實測過）。
//   3. 沒有任何錯誤或行為變化，連線照常成功，只是不再驗證對方是誰。
//
// 這條連線上流動的是密碼雜湊、refresh token、驗證與重設密碼的 token，以及
// 全部使用者資料。
//
// 因此修補分兩半：
//
//   程式這一側改成 fail-closed（resolveDbSslOption）。它在「DATABASE_URL 沒有
//   帶 sslmode」時才會真正生效，但那正是需要它的情況 —— 例如日後有人從別處
//   複製一份不含 sslmode 的連線字串過來。表達正確的意圖本身就有價值，何況
//   死碼會誤導下一個讀它的人。
//
//   真正的解法在連線字串：DATABASE_URL 應該明確寫 sslmode=verify-full。
//   describeSslMode() 會在啟動時檢查並在不符時印出警告，把一個未來會無聲
//   發生的退化變成現在就看得見的東西。

/**
 * @param {string} dbUrl DATABASE_URL
 * @returns {boolean} 這個連線目的地是否為託管資料庫
 */
const isHostedDb = (dbUrl) => {
  const u = String(dbUrl || '');
  return u.includes('supabase.co') || u.includes('supabase.com') || u.includes('neon.tech');
};

/**
 * 產生要交給 new Pool({ ssl }) 的值。
 *
 * 注意：只有在 DATABASE_URL 不含 sslmode 時，這個回傳值才會真正生效
 * （見檔頭的實測結果）。
 *
 * @param {string} dbUrl
 * @param {NodeJS.ProcessEnv} [env] 預設 process.env，測試可注入
 * @returns {false|{rejectUnauthorized: boolean}}
 *   false 代表完全不使用 TLS（本機的純文字連線），維持修補前的既有行為。
 */
const resolveDbSslOption = (dbUrl, env = process.env) => {
  const needsSsl = isHostedDb(dbUrl) || env.NODE_ENV === 'production';
  if (!needsSsl) return false;

  // 逃生門與 utils/mailer.js 同一套：必須明確設定，而且即使被誤設到正式環境
  // 也不會生效。關閉憑證驗證這種事不該只靠一道開關。
  const allowSelfSigned =
    env.DB_ALLOW_SELF_SIGNED === 'true' && env.NODE_ENV !== 'production';

  return { rejectUnauthorized: !allowSelfSigned };
};

// pg 目前把這三個值都當成 verify-full，但 pg v9 起會改成 libpq 語意
// （加密但不驗證身分）。也就是這三個值現在安全、將來不安全。
const MODES_WEAK_IN_PG_V9 = ['prefer', 'require', 'verify-ca'];

/**
 * 讀出連線字串裡的 sslmode。
 *
 * 刻意用正規表示式而不是 new URL()：Postgres 的連線字串在密碼含有特殊字元時
 * 未必是合法的 URL，而這個函式只是為了印一行警告，不該因為解析失敗就拋錯。
 *
 * @param {string} dbUrl
 * @returns {string|null} 沒有指定時回 null
 */
const readSslMode = (dbUrl) => {
  const m = String(dbUrl || '').match(/[?&]sslmode=([^&\s]+)/i);
  return m ? m[1].toLowerCase() : null;
};

/**
 * 檢查 sslmode 的設定，回傳一段給人看的結論。
 *
 * @param {string} dbUrl
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{level: 'ok'|'warn'|'none', sslMode: string|null, message: string}}
 *   level 為 'none' 表示這個連線本來就不用 TLS（本機），無須檢查。
 */
const describeSslMode = (dbUrl, env = process.env) => {
  if (resolveDbSslOption(dbUrl, env) === false) {
    return { level: 'none', sslMode: null, message: '未使用 TLS（本機連線）' };
  }
  const sslMode = readSslMode(dbUrl);
  if (sslMode === 'verify-full') {
    return { level: 'ok', sslMode, message: 'sslmode=verify-full，憑證與主機名皆驗證' };
  }
  if (sslMode === null) {
    // 沒有 sslmode 時，程式傳入的 ssl 物件會生效，而它是 fail-closed 的。
    return {
      level: 'ok',
      sslMode: null,
      message: 'DATABASE_URL 未指定 sslmode，改由 config/dbSsl.js 決定（預設驗證憑證）',
    };
  }
  if (MODES_WEAK_IN_PG_V9.includes(sslMode)) {
    return {
      level: 'warn',
      sslMode,
      message:
        `DATABASE_URL 使用 sslmode=${sslMode}。pg 8.x 仍把它當成 verify-full，` +
        '但 pg v9 起會改用 libpq 語意（加密但不驗證伺服器身分），屆時憑證驗證' +
        '會在沒有任何程式碼變更的情況下消失，而程式這一側擋不住（連線字串永遠' +
        '覆蓋程式的 ssl 設定）。請改成 sslmode=verify-full。',
    };
  }
  return {
    level: 'warn',
    sslMode,
    message: `DATABASE_URL 使用未預期的 sslmode=${sslMode}，請確認其語意，建議改成 verify-full。`,
  };
};

module.exports = {
  isHostedDb,
  resolveDbSslOption,
  readSslMode,
  describeSslMode,
  MODES_WEAK_IN_PG_V9,
};
