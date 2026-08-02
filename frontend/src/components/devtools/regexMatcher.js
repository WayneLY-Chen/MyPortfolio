// 正則比對的純函式核心(FEAT-10)—— 零 React 依賴,可直接用 node:test 驗證。
//
// Source:
//   04-CONTEXT.md D-19:正則比對放進 Web Worker,超過約一秒即終止 Worker。
//   04-CONTEXT.md D-20:上面那條的技術前提 —— JavaScript 的 RegExp 比對是同步且
//     不可搶佔的。主執行緒被災難性回溯佔滿時,排進佇列的計時器 callback 永遠不會
//     執行,所謂「主執行緒逾時保護」在這個形狀上完全無效。唯一真正能中斷的手段是
//     worker.terminate(),它是執行緒層級的中斷,不需要被中斷的程式碼配合。
//   04-CONTEXT.md D-23:命中片段上底色,下方逐筆列出每一筆 match 與它的捕獲群組;
//     不做 g/i/m/s 旗標勾選框(旗標直接寫在正則式子裡,見 parsePatternInput)。
//   04-CONTEXT.md D-24:逾時門檻鎖定為 1000ms 整數,不得自行改成緩衝值。
//
// 【這個檔案的執行位置】
// 實際跑起來的地方是 Worker 執行緒(regexWorker.js 匯入本檔),不是主執行緒。
// 因此這裡不得出現任何 DOM、React 或 window 相依,回傳值也必須是能通過
// postMessage 結構化複製的純資料 —— 不含 RegExp 物件、不含函式、不含 undefined
// 以外難以辨識的空值(選擇性群組一律正規化成 null)。

/**
 * D-24 的裁決值。RegexTool.jsx 的計時器必須讀這個常數,不得另寫 1000 這個字面值 ——
 * 兩處各寫一份的話,日後調整門檻只會改到其中一邊,而另一邊不會有任何錯誤訊息。
 */
export const REGEX_TIMEOUT_MS = 1000

/**
 * 單次比對的命中筆數上限。
 *
 * 這不是效能微調,是 D-19 那道防線的第二半:Worker 的逾時只擋得住「算很久」,
 * 擋不住「算很快但吐出天文數字筆結果」。`x*` 這種零寬 pattern 配上一段長文字,
 * 每個字元位置都會命中一筆 —— 比對本身在幾毫秒內就結束(所以 1000ms 逾時不會觸發),
 * 但主執行緒接著要渲染同等數量的節點,分頁照樣凍結,只是死在另一個位置。
 */
export const MAX_MATCHES = 5000

/**
 * 把「文字 + 命中位置」切成可直接渲染的片段陣列。
 *
 * @param {string} text 原始測試文字
 * @param {Array<{index: number, length: number}>} matches 依 index 遞增、互不重疊
 * @returns {Array<{text: string, matched: boolean}>}
 *
 * 這個函式的正確性直接決定 highlight 會不會漏字或重複顯示,所以它唯一不可違反的
 * 性質是:所有片段的 text 依序串接必須等於原始 text(測試中以 property 形式驗證)。
 *
 * 零寬命中(length 為 0)刻意不產生 matched 片段 —— 那會是一個空的標記元素,
 * 畫面上看不見任何東西,卻要付出一個 DOM 節點。命中本身仍會出現在下方的 match 清單裡,
 * 那才是零寬匹配唯一看得到的地方。
 */
export function buildSegments(text, matches) {
  const source = typeof text === 'string' ? text : ''
  const segments = []
  let cursor = 0
  for (const m of matches || []) {
    if (m.index > cursor) segments.push({ text: source.slice(cursor, m.index), matched: false })
    if (m.length > 0) {
      segments.push({ text: source.slice(m.index, m.index + m.length), matched: true })
      cursor = m.index + m.length
    } else if (m.index > cursor) {
      cursor = m.index
    }
  }
  if (cursor < source.length) segments.push({ text: source.slice(cursor), matched: false })
  return segments
}

/**
 * D-23:本階段不做旗標勾選框,旗標由使用者直接寫進正則式子裡。
 *
 * 注意 JavaScript 的 RegExp **不支援** `(?i)` 這類行內旗標語法(Python / Java 有,
 * JS 沒有),所以「寫在式子裡」在 JS 的世界只有一種寫法:完整的 `/pattern/flags`
 * 字面值形式。這個函式就是在解析那個形式。
 *
 * 裸 pattern(沒有前後斜線)一律補上 g —— 這是個「測試」工具,預設要標出全部符合的
 * 片段而不是只標第一筆。反之,使用者若明確寫了 `/x/i`,就逐字照他寫的來,即使那代表
 * 只有第一筆會被標出;那是他自己的選擇,元件會另外提示這件事。
 */
export function parsePatternInput(raw) {
  const input = typeof raw === 'string' ? raw : ''
  if (input.length >= 2 && input.startsWith('/')) {
    // 從尾端往回找收尾斜線,並確認它沒有被反斜線跳脫。從尾端找是必要的:
    // `/a\/b/g` 裡面有三條斜線,從前面找會切在中間那條上。
    const closing = input.lastIndexOf('/')
    if (closing > 0 && input[closing - 1] !== '\\') {
      return { pattern: input.slice(1, closing), flags: input.slice(closing + 1) }
    }
  }
  return { pattern: input, flags: 'g' }
}

/**
 * 執行比對並回傳可直接渲染的純資料。
 *
 * @returns {{
 *   ok: boolean,
 *   empty?: boolean,
 *   truncated: boolean,
 *   matches: Array<{index: number, length: number, value: string, groups: Array<string|null>, namedGroups: object|null}>,
 *   segments: Array<{text: string, matched: boolean}>,
 *   error: {kind: string, raw: string}|null
 * }}
 */
export function runRegexMatch(pattern, flags, text) {
  const source = typeof text === 'string' ? text : ''
  const patternText = typeof pattern === 'string' ? pattern : ''
  const flagText = typeof flags === 'string' ? flags : ''

  if (patternText === '') {
    return { ok: true, empty: true, truncated: false, matches: [], segments: [], error: null }
  }

  let regex
  try {
    regex = new RegExp(patternText, flagText)
  } catch (err) {
    // 這裡刻意綁定例外變數,與 jsonFormatter.js 的做法相反 —— 那邊是 D-22 明文禁止
    // 回顯引擎訊息(JSON 工具的使用者不一定是工程師),這邊則是計畫明文要求提供
    // 「顯示詳細錯誤」的展開內容。寫正則的人看得懂 "Unterminated group",那句話
    // 比任何我們自己寫的中文都更能指出是哪裡壞掉。訊息一律以 JSX 文字節點渲染,
    // 不進網址、不進主控台。
    return {
      ok: false,
      truncated: false,
      matches: [],
      segments: buildSegments(source, []),
      error: { kind: 'invalid-pattern', raw: String(err && err.message ? err.message : err) },
    }
  }

  const matches = []
  let truncated = false

  try {
    if (!regex.global) {
      // 非全域比對:exec 不會推進 lastIndex,再跑第二次會永遠拿到同一筆 ——
      // 這是「用 while 迴圈跑非全域正則」最經典的當機方式。只取一筆就結束。
      const m = regex.exec(source)
      if (m) matches.push(toMatchRecord(m))
    } else {
      regex.lastIndex = 0
      let m = regex.exec(source)
      while (m !== null) {
        matches.push(toMatchRecord(m))
        if (matches.length >= MAX_MATCHES) {
          truncated = true
          break
        }
        // 零寬匹配的必要處置:命中長度為 0 時 lastIndex 不會前進,下一次 exec 會在
        // 同一個位置再命中一次,永遠跑不完。手動加一才能讓游標往前走。
        // (卡死的位置在 Worker 裡,只會表現成「每次都逾時」,幾乎無法從畫面上追。)
        if (regex.lastIndex === m.index) regex.lastIndex += 1
        if (regex.lastIndex > source.length) break
        m = regex.exec(source)
      }
    }
  } catch (err) {
    // 比對階段的例外(例如某些引擎對極端 pattern 的內部限制)一律降級成錯誤結果,
    // 不讓例外穿出 Worker 的 onmessage。
    return {
      ok: false,
      truncated: false,
      matches: [],
      segments: buildSegments(source, []),
      error: { kind: 'match-failed', raw: String(err && err.message ? err.message : err) },
    }
  }

  return {
    ok: true,
    truncated,
    matches,
    segments: buildSegments(source, matches),
    error: null,
  }
}

/**
 * 把引擎回傳的 match 陣列轉成純資料。
 * 選擇性群組沒有參與比對時 exec 給的是 undefined —— 正規化成 null,否則結構化複製
 * 之後在畫面上會分不出「群組沒對到」與「群組不存在」。
 */
function toMatchRecord(m) {
  const groups = []
  for (let i = 1; i < m.length; i += 1) groups.push(m[i] === undefined ? null : m[i])

  let namedGroups = null
  if (m.groups) {
    namedGroups = {}
    for (const key of Object.keys(m.groups)) {
      namedGroups[key] = m.groups[key] === undefined ? null : m.groups[key]
    }
  }

  return { index: m.index, length: m[0].length, value: m[0], groups, namedGroups }
}
