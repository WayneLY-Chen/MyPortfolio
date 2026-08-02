// Base64 編解碼(FEAT-09)—— 零 React 依賴的純函式模組,全部運算在瀏覽器端完成。
// Source: 04-CONTEXT.md D-18(中文 / UTF-8 往返不得走樣)、D-19 / D-25(超過上限就停止
//         運算並明講數值)、04-UI-SPEC.md §Per-Tool Specification 的 Base64 那一列。
//
// 【為什麼不直接用 btoa / atob】
// 這兩個函式只認 Latin1(每個字元必須落在 0-255)。`btoa('你好')` 會當場丟
// InvalidCharacterError,而本站以繁體中文為主 —— 中文不是邊界案例,是常態輸入。
// 因此所有路徑一律先用 TextEncoder 把字串轉成 UTF-8 位元組、再把位元組逐一組成
// Latin1 範圍內的 binary string 交給 btoa;解碼則反過來走 atob → 位元組 → TextDecoder。
// 這是 D-18 正確性的唯一保證,任何「簡化」都會讓中文與 emoji 壞掉。
//
// 【base64url】
// toBase64Url / fromBase64Url 是給 04-04 的 JWT 工具共用的。JWT 的三段是 base64url:
// `+` → `-`、`/` → `_`、去掉尾端 padding。兩個工具各寫一份很容易在字元替換上分岔,
// 所以在這裡寫一次、兩邊共用。

// D-25:文字側單一輸入上限鎖定 200 KB。
// 注意:jsonFormatter.js(04-02)有同語意的常數,兩處數值必須一致但各自維護,
// 比照 typingEngine.js 對 SCORE_CAP / SPEED_CAP 的處理方式,不跨模組互相 import。
export const MAX_TEXT_BYTES = 204800

// D-25:檔案側上限 5 MB。Base64 會膨脹約 33%,5 MB 的檔案會產生約 6.7 MB 的字串,
// 仍在單一分頁可承受的範圍內;再往上就會在讀取階段就把主執行緒卡住。
// 這個值必須在 FileReader 開始讀之前就檢查(D-19:提示,而不是硬算)。
export const MAX_FILE_BYTES = 5242880

// btoa 的輸入是一整條 binary string。200 KB 的輸入會產生 20 萬個位元組,
// String.fromCharCode(...bytes) 一次展開會超過引數數量上限直接爆掉,
// 所以分塊組裝。32768 是各家引擎都安全的塊大小。
const CHUNK_SIZE = 0x8000

// 標準 Base64 字元集(不含 base64url 的 - 與 _)。padding 另外處理。
const BASE64_BODY = /^[A-Za-z0-9+/]*$/

/**
 * 剝掉所有空白字元。
 * 貼上長 Base64 時被自動折行是常態(郵件、終端機、PEM 形狀的文字都會折),
 * 而各家引擎對「atob 遇到空白」的行為並不一致 —— 與其賭引擎,不如自己先剝乾淨。
 */
function stripWhitespace(text) {
  return text.replace(/\s+/g, '')
}

/**
 * 量測 UTF-8 位元組數。
 * 長度已經超過上限時直接回傳 length 當作下界,不再實際編碼 —— UTF-8 的每個
 * UTF-16 code unit 至少佔 1 位元組,所以 length 超標就代表位元組數必定超標。
 * 這一步是為了避免使用者貼上超大內容時,光是「為了量測」就先配置一整份巨大的
 * Uint8Array 把主執行緒卡住(做法沿用 jsonFormatter.js 的 measureBytes)。
 */
export function measureBytes(text) {
  if (typeof text !== 'string' || text.length === 0) return 0
  if (text.length > MAX_TEXT_BYTES) return text.length
  return new TextEncoder().encode(text).length
}

/**
 * D-18:文字 → 標準 Base64。
 * 路徑固定為 TextEncoder → binary string → btoa,不得改成裸的 btoa(text)。
 * 非字串輸入回傳保護值(空字串)而不丟例外,呼叫端一律不必包 try/catch。
 */
export function textToBase64(text) {
  if (typeof text !== 'string' || text.length === 0) return ''
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE))
  }
  try {
    return btoa(binary)
  } catch {
    // 走到這裡代表上面的位元組轉換出了問題,理論上不可能。
    // 一律回保護值,不把引擎的英文訊息端到畫面上。
    return ''
  }
}

/**
 * D-18:標準 Base64 → 文字。
 * 不合法的輸入回傳保護值(空字串)而不丟例外 —— 呼叫端用 isValidBase64 判斷要不要
 * 顯示錯誤文案,這個函式只負責「能解就解」。
 * 會先剝掉空白並補回 padding,所以貼上被折行或省略 padding 的 Base64 也解得開。
 */
export function base64ToText(b64) {
  if (typeof b64 !== 'string' || b64.length === 0) return ''
  if (!isValidBase64(b64)) return ''
  const normalized = padBase64(stripWhitespace(b64).replace(/=+$/, ''))
  try {
    const binary = atob(normalized)
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return ''
  }
}

/**
 * 補 padding 至長度為 4 的倍數。
 * 餘數為 1 是不可能出現的 Base64 長度(補 3 個 `=` 並不會讓它變成合法值),
 * 這種情況原樣回傳,交給 isValidBase64 去擋。
 */
function padBase64(body) {
  const remainder = body.length % 4
  if (remainder === 0 || remainder === 1) return body
  return body + '='.repeat(4 - remainder)
}

/**
 * 標準 Base64 → base64url(JWT 用)。
 * `+` → `-`、`/` → `_`,並去掉尾端的 padding。
 */
export function toBase64Url(b64) {
  if (typeof b64 !== 'string' || b64.length === 0) return ''
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * base64url → 標準 Base64(JWT 用)。
 * `-` → `+`、`_` → `/`,並補回 padding 至長度為 4 的倍數。
 * fromBase64Url(toBase64Url(b64)) 對任何合法的 b64 都會回到原值。
 */
export function fromBase64Url(b64url) {
  if (typeof b64url !== 'string' || b64url.length === 0) return ''
  return padBase64(b64url.replace(/-/g, '+').replace(/_/g, '/'))
}

/**
 * 判斷字串是不是可解碼的 Base64。
 *
 * 刻意用字元集 + 長度檢查,而不是 try/catch 一次 atob:各家引擎對含空白、
 * 省略 padding 的字串行為並不一致,拿例外當判斷依據等於把判斷邏輯外包給引擎。
 *
 * 判斷規則:
 *   - 非字串、或剝掉空白後是空的 → false(空輸入是「尚未輸入」,不是「合法」)
 *   - 出現字元集以外的字元、或 `=` 出現在中間 → false
 *   - 長度除以 4 餘 1 → false(不存在這種長度的 Base64)
 *   - 帶 padding 時,總長必須正好是 4 的倍數
 * 省略尾端 padding 視為合法 —— 這在實務上很常見(JWT 的每一段都是這樣),
 * 而且它確實解得開。
 */
export function isValidBase64(b64) {
  if (typeof b64 !== 'string') return false
  const stripped = stripWhitespace(b64)
  if (stripped.length === 0) return false

  const match = stripped.match(/^([A-Za-z0-9+/]*)(={0,2})$/)
  if (!match) return false

  const [, body, padding] = match
  if (body.length === 0) return false
  if (!BASE64_BODY.test(body)) return false

  if (padding.length > 0) return (body.length + padding.length) % 4 === 0
  return body.length % 4 !== 1
}
