// backend/src/config/registrationValidation.js
//
// POST /auth/register 的欄位驗證。沿用本專案既有慣例：規則集中在 config/ 下的
// 獨立模組，路由層只負責接收與回應。
//
// 修補前 register 的檢查只有「三個欄位都有值」與「密碼至少 8 字」。也就是：
//   - email 可以是任何字串（包含非字串型別，`!email` 對數字 123 為 false），
//     直接寫進 users.email。之後 GET /auth/verify 會拿它跟 ADMIN_EMAIL 比對，
//     忘記密碼會拿它去寄信。
//   - display_name 沒有長度上限。express.json() 的預設 body 上限是 100kb，
//     因此可以註冊一個顯示名稱將近十萬字的帳號 —— 那個字串會出現在留言區。
//   - password 沒有長度上限。bcrypt 只取前 72 bytes，超長密碼不會拖慢雜湊，
//     但也沒有理由收下一份十萬字的字串。

// users.email 是 VARCHAR(255)。
const EMAIL_MAX_LEN = 255;

// 顯示名稱長度上限。與 config/commentValidation.js 的 AUTHOR_NAME_MAX_LEN
// 一致 —— display_name 最終就是以留言者名稱的形式出現在公開頁面上。
const DISPLAY_NAME_MAX_LEN = 50;

// 密碼長度。下限 8 與修補前相同；上限取 200，遠高於任何真人密碼或密碼管理器
// 產生的字串，僅用於擋掉異常大的輸入。
const PASSWORD_MIN_LEN = 8;
const PASSWORD_MAX_LEN = 200;

// email 格式。刻意用寬鬆的形狀檢查而不是嘗試實作 RFC 5322：
// 「本地部分 @ 網域 . 頂級網域，中間不含空白」已經足以擋掉明顯不是 email
// 的輸入，而真正確認信箱可用的手段是本專案已經有的驗證信流程，不是正規表示式。
// 過度嚴格的 email 正規表示式擋掉合法信箱的機率，遠高於它擋下的攻擊。
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {unknown} email
 * @returns {boolean}
 */
const isValidEmail = (email) =>
  typeof email === 'string' &&
  email.length <= EMAIL_MAX_LEN &&
  EMAIL_SHAPE.test(email.trim());

/**
 * @param {unknown} displayName
 * @returns {boolean}
 */
const isValidDisplayName = (displayName) => {
  if (typeof displayName !== 'string') return false;
  const trimmed = displayName.trim();
  return trimmed.length > 0 && trimmed.length <= DISPLAY_NAME_MAX_LEN;
};

/**
 * @param {unknown} password
 * @returns {boolean}
 */
const isValidPassword = (password) =>
  typeof password === 'string' &&
  password.length >= PASSWORD_MIN_LEN &&
  password.length <= PASSWORD_MAX_LEN;

// ---------------------------------------------------------------------------
// Email 大小寫
//
// 修補前，a@example.com 與 A@example.com 是兩個不同的帳號：註冊時的唯一性
// 檢查、登入（config/localVerify.js）、忘記密碼、重寄驗證信、OAuth 帳號連結
// （config/oauthAccountLink.js）、以及對 ADMIN_EMAIL 的比對，六處全部是逐字
// 比對。實務上所有主流信箱服務都把本地部分視為不分大小寫，因此那六處等於把
// 「同一個信箱」當成不同的人。
//
// 修法分兩半：
//
//   寫入時（此處的 normalizeEmail）一律轉小寫，讓新資料從此只有一種形式。
//
//   查詢時一律用 LOWER(email) = LOWER($1)，而不是先把資料庫裡的值改掉。
//   這一點是刻意的：資料庫裡可能已經存在大寫形式的既有帳號，若改成「只查
//   小寫」，那些帳號會在部署的瞬間全部登不進去。用 LOWER() 比對則對新舊資料
//   同時正確，不需要任何資料遷移，也就沒有「遷移撞上唯一鍵衝突」的風險 ——
//   而那個風險我無法事先確認，因為我沒有這個資料庫的內容。
//
//   db/index.js 的 runMigrations 一併建立 users(LOWER(email)) 的函式索引，
//   讓 LOWER() 比對仍然走得到索引。CREATE INDEX IF NOT EXISTS 是累加式的，
//   不動任何既有資料。
//
// 若資料庫裡已經存在「只差大小寫」的重複帳號，本次修補不會自動合併或刪除
// 任何一筆 —— 那是不可逆操作。db/report_duplicate_emails.sql 是一支唯讀的
// 診斷查詢，可以先看看有沒有這種情況。

/**
 * 寫入用的 email 正規化。只在 INSERT 時使用；查詢一律用 LOWER() 比對，
 * 不依賴呼叫端有沒有先正規化。
 *
 * @param {string} email
 * @returns {string}
 */
const normalizeEmail = (email) => String(email).trim().toLowerCase();

/**
 * 兩個 email 是否指向同一個信箱（不分大小寫、忽略前後空白）。
 *
 * 用於與 ADMIN_EMAIL 的比對。把這個比對也改成不分大小寫是安全的，不是放寬：
 * 要靠它取得 admin，仍然必須先收到寄往該信箱的驗證信並點擊連結（本地註冊
 * 路徑），或由 provider 明確聲明該 email 已驗證（OAuth 路徑）—— 也就是必須
 * 真的控制那個信箱。而既然主流信箱服務不分大小寫，控制 a@example.com 的人
 * 本來就控制 A@example.com。
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean} 任一方缺少或非字串時一律為 false（不會讓 undefined 相等）
 */
const isSameEmail = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.trim().length === 0 || b.trim().length === 0) return false;
  return normalizeEmail(a) === normalizeEmail(b);
};

module.exports = {
  EMAIL_MAX_LEN,
  DISPLAY_NAME_MAX_LEN,
  PASSWORD_MIN_LEN,
  PASSWORD_MAX_LEN,
  isValidEmail,
  isValidDisplayName,
  isValidPassword,
  normalizeEmail,
  isSameEmail,
};
