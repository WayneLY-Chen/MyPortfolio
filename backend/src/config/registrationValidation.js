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
// 這裡刻意「沒有」做的事：email 正規化（轉小寫）。
//
// 現況是 Wayne@example.com 與 wayne@example.com 會是兩個不同的帳號，因為
// 註冊時的唯一性檢查、登入（config/localVerify.js）、忘記密碼、重寄驗證信、
// 以及 GET /auth/verify 對 ADMIN_EMAIL 的比對，全部都是逐字比對。
//
// 沒有一併修的理由，不是漏看：
//   1. 只在註冊時轉小寫、登入時不轉，會讓用大寫信箱註冊的人再也登不進去
//      —— 那正是這兩輪一直在修的「同一段邏輯只改一邊」的錯誤本身。
//   2. 五處全部轉小寫，會讓資料庫裡「已經以大寫形式存在」的帳號從此查不到。
//      那需要一次資料遷移（UPDATE users SET email = lower(email)）並先確認
//      不會撞上唯一鍵衝突，而我沒有這個資料庫的內容可以確認。
//
// 也就是說這是一個需要人先看過正式資料的變更，不該在一次資安修補裡順手做掉。
// 目前的影響是「同一個信箱可以註冊出兩個帳號」，屬於資料一致性問題，不構成
// 權限或機密性的漏洞。

module.exports = {
  EMAIL_MAX_LEN,
  DISPLAY_NAME_MAX_LEN,
  PASSWORD_MIN_LEN,
  PASSWORD_MAX_LEN,
  isValidEmail,
  isValidDisplayName,
  isValidPassword,
};
