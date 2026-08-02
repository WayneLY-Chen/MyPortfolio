// JSON 格式化 / 驗證 / 錯誤定位 —— 零 React 依賴的純函式模組,可用 node --test 直接驗證。
// Source: 04-CONTEXT.md D-19(超大輸入只提示、不硬算)、D-22(錯誤必須指出行列並以繁體
//         中文說明,且位置一律來自自寫掃描器)、D-25(單一輸入上限 200 KB);
//         04-RESEARCH.md「JSON 錯誤定位」與 Common Pitfalls #2。
//
// 【本模組最重要的一條規則,請勿「簡化」掉】
// 錯誤位置絕對不從 JSON.parse 丟出的例外物件解析。V8 / SpiderMonkey / JavaScriptCore
// 三個引擎的訊息格式互不相同,而且近期 V8 已經把 position 數字整個拿掉 —— 去解析它,
// 會在某次瀏覽器更新後悄悄失效,而且是「顯示錯誤的行號」這種不會噴錯的失效。
// 因此本模組只把 JSON.parse 當成「合不合法」的判定器(它是 spec-compliant 且經引擎
// 最佳化的正確實作,沒有理由重寫),失敗後改由 scanForFirstError 這個自寫掃描器負責
// 找出出錯的位置。整個檔案不讀取任何例外物件的任何欄位,catch 一律不綁定變數。
//
// 掃描器只需要「找到第一個違反 JSON 文法的字元」,不需要真的把 JSON 建構成物件 ——
// 建構的工作已經由 JSON.parse 做掉了。

// D-25:單一輸入上限鎖定 200 KB。這是 JSON 工具唯一的防線 —— D-21 只讓正則進 Worker,
// JSON 的 parse 與掃描都跑在主執行緒上,沒有 terminate 可以救。
// 注意:base64Utils.js(04-03)有同語意的常數,兩處數值必須一致但各自維護,
// 比照 typingEngine.js 對 SCORE_CAP / SPEED_CAP 的處理方式,不跨模組互相 import。
export const MAX_TEXT_BYTES = 204800

// 格式化縮排寬度。UI-SPEC 的 Code role 以 13px 等寬字呈現,2 空格在兩欄版型下
// 最不容易讓深層結構撞到欄寬。
export const INDENT_SIZE = 2

// 掃描器的巢狀深度上限。純粹是遞迴堆疊的保險:200 KB 的 "[[[[[..." 會有十萬層,
// 遞迴下去必然爆堆疊。JSON.parse 對這種輸入本來就會失敗,所以在這裡停下並回報
// 「巢狀層數過深」比讓整個分頁丟 RangeError 好。正常人手寫的 JSON 不會超過個位數層。
const MAX_DEPTH = 1000

// D-22:錯誤類別代碼 → 繁體中文說明。使用者看到的文案只會從這張表來,
// 因此這裡的每一個字串都不得含有拉丁字母(測試會逐條檢查)。
export const ERROR_REASONS = {
  'missing-comma': '缺少逗號',
  'unexpected-comma': '多餘的逗號',
  'missing-colon': '缺少冒號',
  'missing-value': '缺少值',
  'unterminated-string': '字串未閉合,缺少結尾的引號',
  'unclosed-bracket': '未閉合的括號',
  'unexpected-char': '非預期的字元',
  'key-must-be-string': '物件的鍵必須是用雙引號包住的字串',
  'invalid-escape': '不合法的跳脫序列',
  'invalid-number': '數字格式不正確',
  'control-char': '字串內含未跳脫的控制字元',
  'trailing-content': '結尾出現多餘的內容',
  'too-deep': '巢狀層數過深',
  unknown: '格式不正確,請再檢查一次整體結構',
}

// JSON 規格只認這四個空白字元(不含全形空白、不含 Unicode 的其他空白)。
function isWhitespace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'
}

function isDigit(ch) {
  return ch >= '0' && ch <= '9'
}

/**
 * 量測 UTF-8 位元組數。
 * 長度已經超過上限時直接回傳 length 當作下界,不再實際編碼 —— UTF-8 的每個
 * UTF-16 code unit 至少佔 1 位元組,所以 length 超標就代表位元組數必定超標。
 * 這一步是為了避免使用者貼上 50MB 時,光是「為了量測」就先配置一整份巨大的
 * Uint8Array 把主執行緒卡住。此時回傳值是下界而非精確值,但畫面上唯一會用到它的
 * 情境就是「已經超過上限」的提示,不影響正確性。
 */
export function measureBytes(text) {
  if (typeof text !== 'string' || text.length === 0) return 0
  if (text.length > MAX_TEXT_BYTES) return text.length
  return new TextEncoder().encode(text).length
}

/**
 * D-22:index → 行列換算。全站唯一的行列來源,不接受任何外部提供的位置數字。
 * 空輸入、index 為 0、index 落在換行字元上、index 超出範圍,一律回傳保護值而非丟例外
 * (既有慣例:typingEngine.js 的除零 / 空輸入處理)。
 * 欄數以 UTF-16 code unit 計算,對本站語料(CJK 基本區 + ASCII)等同字元數;
 * 這正是「不能用位元組數當欄數」的原因 —— 一個中文字在 UTF-8 是 3 位元組,
 * 但在編輯器裡只佔一欄。
 */
export function indexToLineCol(text, index) {
  const source = typeof text === 'string' ? text : ''
  const raw = Number(index)
  const safe = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 0), source.length) : 0
  const lines = source.slice(0, safe).split('\n')
  return { line: lines.length, column: lines[lines.length - 1].length + 1 }
}

/**
 * D-22:自寫的診斷用掃描器。逐字元走過整個字串,追蹤
 *   (a) 是否位於字串常值內、(b) 前一個字元是不是跳脫符、
 *   (c) 物件 / 陣列的巢狀堆疊、(d) 目前期待的是鍵、冒號、值還是分隔符,
 * 在第一個違反 JSON 文法的字元處停下,回報它的 index 與錯誤類別代碼。
 *
 * 回傳 { index, code };若整段掃完都合法則回傳 null。
 * 這個函式不做任何文案處理,也不認識行列號 —— 那是 validateJson 的工作。
 */
export function scanForFirstError(text) {
  const source = typeof text === 'string' ? text : ''
  const n = source.length
  let i = 0
  let depth = 0

  // 用丟出純資料物件的方式從深層遞迴一次跳出。這是模組內部的控制流,
  // 不是對外的錯誤介面 —— 外面看到的永遠是 return 值。
  const fail = (code, at) => {
    throw { scanError: true, code, index: Math.min(at === undefined ? i : at, n) }
  }

  const skipWhitespace = () => {
    while (i < n && isWhitespace(source[i])) i += 1
  }

  const scanString = () => {
    const open = i
    i += 1
    while (i < n) {
      const ch = source[i]
      if (ch === '\\') {
        i += 1
        if (i >= n) fail('unterminated-string', open)
        const esc = source[i]
        if (esc === '"' || esc === '\\' || esc === '/' || esc === 'b' || esc === 'f'
          || esc === 'n' || esc === 'r' || esc === 't') {
          i += 1
          continue
        }
        if (esc === 'u') {
          i += 1
          for (let k = 0; k < 4; k += 1) {
            const hex = source[i]
            const isHex = hex !== undefined
              && (isDigit(hex) || (hex >= 'a' && hex <= 'f') || (hex >= 'A' && hex <= 'F'))
            if (!isHex) fail('invalid-escape', i)
            i += 1
          }
          continue
        }
        fail('invalid-escape', i)
      }
      if (ch === '"') {
        i += 1
        return
      }
      // JSON 字串不得直接包含控制字元。換行是最常見的情況,而它幾乎一定代表
      // 「引號忘了收」,所以指回起始引號比指著換行本身有用得多。
      if (ch === '\n' || ch === '\r') fail('unterminated-string', open)
      if (ch < ' ') fail('control-char', i)
      i += 1
    }
    fail('unterminated-string', open)
  }

  const scanNumber = () => {
    const start = i
    if (source[i] === '-') i += 1
    if (i >= n) fail('invalid-number', start)
    if (source[i] === '0') {
      i += 1
    } else if (isDigit(source[i])) {
      while (i < n && isDigit(source[i])) i += 1
    } else {
      fail('invalid-number', start)
    }
    if (source[i] === '.') {
      i += 1
      if (!(i < n && isDigit(source[i]))) fail('invalid-number', i)
      while (i < n && isDigit(source[i])) i += 1
    }
    if (source[i] === 'e' || source[i] === 'E') {
      i += 1
      if (source[i] === '+' || source[i] === '-') i += 1
      if (!(i < n && isDigit(source[i]))) fail('invalid-number', i)
      while (i < n && isDigit(source[i])) i += 1
    }
  }

  const scanKeyword = (word) => {
    if (source.slice(i, i + word.length) === word) {
      i += word.length
      return true
    }
    return false
  }

  const scanValue = () => {
    if (depth > MAX_DEPTH) fail('too-deep', i)
    skipWhitespace()
    if (i >= n) fail('missing-value', n)
    const ch = source[i]
    if (ch === '"') return scanString()
    if (ch === '{') return scanObject()
    if (ch === '[') return scanArray()
    if (ch === '-' || isDigit(ch)) return scanNumber()
    if (ch === 't' && scanKeyword('true')) return undefined
    if (ch === 'f' && scanKeyword('false')) return undefined
    if (ch === 'n' && scanKeyword('null')) return undefined
    // 該出現值的地方卻直接遇到結構符號 —— 例如 {"a": } 或 [1, ]
    if (ch === '}' || ch === ']' || ch === ',' || ch === ':') fail('missing-value', i)
    return fail('unexpected-char', i)
  }

  function scanObject() {
    const open = i
    depth += 1
    i += 1
    skipWhitespace()
    if (i >= n) fail('unclosed-bracket', open)
    if (source[i] === '}') {
      i += 1
      depth -= 1
      return
    }
    for (;;) {
      skipWhitespace()
      if (i >= n) fail('unclosed-bracket', open)
      // 走到這裡代表「該出現一組鍵值了」。此時遇到 } 或 , 只有一種可能:
      // 前面那顆逗號是多餘的(例如 {"a":1,})。
      if (source[i] === '}' || source[i] === ',') fail('unexpected-comma', i)
      if (source[i] !== '"') fail('key-must-be-string', i)
      scanString()
      skipWhitespace()
      if (i >= n) fail('missing-colon', n)
      if (source[i] !== ':') fail('missing-colon', i)
      i += 1
      scanValue()
      skipWhitespace()
      if (i >= n) fail('unclosed-bracket', open)
      if (source[i] === ',') {
        i += 1
        continue
      }
      if (source[i] === '}') {
        i += 1
        depth -= 1
        return
      }
      fail('missing-comma', i)
    }
  }

  function scanArray() {
    const open = i
    depth += 1
    i += 1
    skipWhitespace()
    if (i >= n) fail('unclosed-bracket', open)
    if (source[i] === ']') {
      i += 1
      depth -= 1
      return
    }
    for (;;) {
      skipWhitespace()
      if (i >= n) fail('unclosed-bracket', open)
      if (source[i] === ']') fail('unexpected-comma', i)
      scanValue()
      skipWhitespace()
      if (i >= n) fail('unclosed-bracket', open)
      if (source[i] === ',') {
        i += 1
        continue
      }
      if (source[i] === ']') {
        i += 1
        depth -= 1
        return
      }
      fail('missing-comma', i)
    }
  }

  try {
    skipWhitespace()
    if (i >= n) return { index: 0, code: 'missing-value' }
    scanValue()
    skipWhitespace()
    if (i < n) return { index: i, code: 'trailing-content' }
    return null
  } catch (thrown) {
    // 只認得自己丟出來的資料物件。其他例外(例如極端輸入撞到 RangeError)
    // 一律降級成保底代碼,而不是把引擎的訊息端出去。
    if (thrown && thrown.scanError === true) {
      return { index: thrown.index, code: thrown.code }
    }
    return { index: 0, code: 'unknown' }
  }
}

/**
 * D-22:驗證並定位。
 * 合法 → { valid: true }
 * 空輸入 → { valid: false, empty: true }(語意是「尚未輸入」,不是語法錯誤,
 *          畫面上要顯示空狀態文案而不是紅色錯誤框)
 * 不合法 → { valid: false, index, line, column, code, reason, message }
 */
export function validateJson(text) {
  const source = typeof text === 'string' ? text : ''
  if (source.trim() === '') return { valid: false, empty: true }
  try {
    JSON.parse(source)
    return { valid: true }
  } catch {
    // 這裡刻意不綁定例外變數 —— 沒有變數可讀,就不可能不小心讀了 message。
    const found = scanForFirstError(source) || { index: 0, code: 'unknown' }
    const { line, column } = indexToLineCol(source, found.index)
    const reason = ERROR_REASONS[found.code] || ERROR_REASONS.unknown
    return {
      valid: false,
      index: found.index,
      line,
      column,
      code: found.code,
      reason,
      message: `第 ${line} 行第 ${column} 欄:${reason}`,
    }
  }
}

/**
 * D-19 / D-25:格式化。
 * 順序是硬性的:先量位元組數,超過上限直接回傳 overLimit 且不進 JSON.parse。
 * 這一步就是 200 KB 上限的實際防線,對調順序等於沒有防線。
 *
 * 回傳:
 *   { ok: true, formatted, byteLength }
 *   { ok: false, overLimit: true, byteLength }
 *   { ok: false, empty: true, byteLength }
 *   { ok: false, byteLength, index, line, column, code, reason, message }
 */
export function formatJson(text) {
  const source = typeof text === 'string' ? text : ''
  const byteLength = measureBytes(source)
  if (byteLength > MAX_TEXT_BYTES) return { ok: false, overLimit: true, byteLength }
  if (source.trim() === '') return { ok: false, empty: true, byteLength }
  try {
    const parsed = JSON.parse(source)
    return { ok: true, formatted: JSON.stringify(parsed, null, INDENT_SIZE), byteLength }
  } catch {
    const { valid, ...info } = validateJson(source)
    return { ok: false, byteLength, ...info }
  }
}
