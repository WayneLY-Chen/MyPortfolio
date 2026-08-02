// 正則表達式測試(FEAT-10)—— 全部運算在瀏覽器端完成,無任何對外通訊。
// Source: 04-CONTEXT.md D-06(即時運算,沒有「比對」按鈕)、D-11(範例資料明顯虛構)、
//         D-19 / D-20 / D-24(比對進 Worker,主執行緒計時器於 1000ms 呼叫 terminate)、
//         D-23(命中上底色 + 逐筆列出 match 與捕獲群組,不做旗標勾選框與快選範本);
//         04-UI-SPEC.md §Per-Tool Specification 正則那一列與 §Copywriting Contract。
//
// 所有 .dt-* 樣式都住在 DevToolsTab.jsx 的 scoped <style> 內(全工具箱共用一份樣式表),
// 這個檔案不自己開 <style>,也不重新定義 04-01 已交付的共用 class。
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import {
  ClearButton,
  CopyButton,
  ExampleButton,
  PasteButton,
  ToolActions,
} from './DevToolsActions'
import { MAX_MATCHES, REGEX_TIMEOUT_MS, parsePatternInput } from './regexMatcher'

// D-11:明顯虛構的日期範例,形狀取自 04-UI-SPEC.md 正則那一列
//(pattern 為 ISO 日期,測試文字是一段包含幾個 ISO 日期的句子)。
const EXAMPLE_PATTERN = '(\\d{4})-(\\d{2})-(\\d{2})'
const EXAMPLE_TEXT =
  '這個網站在 2026-01-15 上線,最近一次改版是 2026-08-02,下一次預計排在 2027-03-01。'

// 04-UI-SPEC.md §Copywriting Contract / §Per-Tool Specification 的鎖定文案,逐字使用。
const EMPTY_HINT = '輸入正則表達式與測試文字,符合的片段會即時標示出來。'
const NO_MATCH_HINT = '沒有符合的片段。'
const SYNTAX_ERROR_NOTICE = '正則語法錯誤,請檢查括號與跳脫字元是否配對正確。'
const TIMEOUT_NOTICE = '這個正則式比對超過 1 秒,已自動停止(可能是過於複雜的樣式導致大量回溯)。'
const WORKER_ERROR_NOTICE = '比對執行緒發生非預期錯誤,請調整正則後再試一次。'
const UNSUPPORTED_NOTICE = '這個瀏覽器不支援背景執行緒,為了避免頁面卡住,正則比對已停用。'

// 沿用 04-02 建立、04-03 / 04-04 兩度落地的不對稱防抖:錯誤進場延遲、出場即時。
// 這裡只套在 pattern 的編譯錯誤上 —— 使用者打 `(\d+)` 的過程中必然會經過 `(`、`(\`、
// `(\d` 這些不合法的中間狀態,不防抖的話等於每敲一個字閃一次紅。
// 比對結果本身不需要再防抖:它已經隔了一次 Worker 的非同步往返。
const ERROR_DEBOUNCE_MS = 500

// 畫面上最多列出幾筆 match。模組層的 MAX_MATCHES(5000)是防止記憶體與運算失控,
// 這一層是防止 DOM 失控 —— 一次渲染五千列的清單,捲動與版面計算都會很吃力,
// 而且沒有人會逐列看完五千筆。超過就只列前面幾筆並明說總數。
const MAX_DISPLAY_MATCHES = 200

/** 複製鈕拿到的文字化結果 —— 與畫面上那份清單同構。 */
function buildMatchReport(matches) {
  if (matches.length === 0) return NO_MATCH_HINT
  return matches
    .map((m, i) => {
      const lines = [`#${i + 1}  位置 ${m.index}  長度 ${m.length}  ${m.value}`]
      if (m.groups.length === 0) {
        lines.push('      (此 match 無捕獲群組)')
      } else {
        m.groups.forEach((g, gi) => {
          lines.push(`      群組 ${gi + 1}:${g === null ? '(未參與比對)' : g}`)
        })
      }
      if (m.namedGroups) {
        Object.keys(m.namedGroups).forEach((name) => {
          const v = m.namedGroups[name]
          lines.push(`      具名群組 ${name}:${v === null ? '(未參與比對)' : v}`)
        })
      }
      return lines.join('\n')
    })
    .join('\n')
}

export default function RegexTool() {
  // D-07:只存在 React state,離開分頁即消失,不寫任何瀏覽器端儲存,也不進網址(D-27)。
  const [patternInput, setPatternInput] = useState('')
  const [text, setText] = useState('')
  // Worker 回傳的純資料。null 代表這一輪還沒有結果。
  const [result, setResult] = useState(null)
  // 'ready' | 'timeout' | 'worker-error' | 'unsupported'
  const [status, setStatus] = useState('ready')
  // 已通過防抖、真正要顯示的編譯錯誤原始訊息。
  const [shownErrorRaw, setShownErrorRaw] = useState(null)

  const workerRef = useRef(null)
  const timerRef = useRef(null)
  const errorTimerRef = useRef(null)
  // 遞增請求序號,擋掉上一輪 Worker 的 late resolve(形狀沿用 HashTool.jsx)。
  const requestIdRef = useRef(0)

  // D-23:不做旗標勾選框。旗標由使用者寫進式子裡,這裡把 `/pattern/flags` 拆開。
  const { pattern, flags } = useMemo(() => parsePatternInput(patternInput), [patternInput])

  useEffect(() => {
    // 每一輪都先把上一輪的計時器收乾淨(Worker 由 effect 的 cleanup 負責,
    // 這裡處理的是 pattern 為空、提早 return 的那幾條路徑)。
    clearTimeout(timerRef.current)
    timerRef.current = null

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (pattern === '') {
      setResult(null)
      setStatus('ready')
      return undefined
    }

    if (typeof Worker === 'undefined') {
      // Worker 取不到時刻意**不**退回主執行緒同步比對 —— 那正是 D-20 排除的做法,
      // 使用者貼上一個災難性回溯的 pattern 就會把整個分頁鎖死。寧可停用這個工具。
      setResult(null)
      setStatus('unsupported')
      return undefined
    }

    let worker
    try {
      // 這一行的形狀是硬性的:相對路徑字串常數 + import.meta.url + type: 'module'。
      // 只有這個語法會被 Vite 的靜態分析認出來並打包成獨立的 worker chunk;
      // 換成變數拼接或字串路徑,dev 會過而 production 會 404。
      worker = new Worker(new URL('./regexWorker.js', import.meta.url), { type: 'module' })
    } catch {
      setResult(null)
      setStatus('worker-error')
      return undefined
    }
    workerRef.current = worker

    const settle = () => {
      clearTimeout(timerRef.current)
      timerRef.current = null
      // 收到結果就回收執行緒,不留著重用 —— 每一輪都是全新的 Worker,
      // 不可能帶著上一輪的殘留狀態或還沒跑完的計算。
      worker.terminate()
      if (workerRef.current === worker) workerRef.current = null
    }

    worker.onmessage = (event) => {
      if (requestId !== requestIdRef.current) return
      settle()
      setResult(event.data)
      setStatus('ready')
    }

    worker.onerror = (event) => {
      if (event && typeof event.preventDefault === 'function') event.preventDefault()
      if (requestId !== requestIdRef.current) return
      settle()
      setResult(null)
      setStatus('worker-error')
    }

    // ── D-19 / D-20 / D-24:這個計時器不是「等逾時之後放棄」,而是執行緒層級的中斷開關。
    // 它唯一要做的事就是呼叫 terminate()。請不要把這段「優化」成主執行緒上的逾時判斷:
    // 同步的 RegExp 回溯不會讓出執行緒,主執行緒上的計時器在它跑完之前根本不會被觸發,
    // 那樣寫出來的東西看起來像保護,實際上一次都不會生效。
    // (實測:主執行緒上排定 100ms 的計時器,在 `(a+)+b` 配 28 個 a 的情況下延到
    //  8267ms、也就是比對結束的那一刻才觸發;搬進 Worker 之後計時器準時在 1003ms 觸發,
    //  執行緒被殺掉,主執行緒全程沒有被阻塞。)
    // 門檻讀 REGEX_TIMEOUT_MS 常數,不在這裡另寫數字。
    timerRef.current = setTimeout(() => {
      if (requestId !== requestIdRef.current) return
      worker.terminate()
      if (workerRef.current === worker) workerRef.current = null
      timerRef.current = null
      setResult(null)
      setStatus('timeout')
    }, REGEX_TIMEOUT_MS)

    worker.postMessage({ pattern, flags, text })

    // 輸入再次變更或元件卸載時:計時器與 Worker 兩者都要清掉,絕不讓多個 Worker 並存。
    return () => {
      clearTimeout(timerRef.current)
      timerRef.current = null
      worker.terminate()
      if (workerRef.current === worker) workerRef.current = null
    }
  }, [pattern, flags, text])

  // 編譯錯誤的原始引擎訊息(尚未經過防抖)。
  const pendingErrorRaw = result && result.ok === false ? result.error.raw : null

  useEffect(() => {
    clearTimeout(errorTimerRef.current)
    if (pendingErrorRaw === null) {
      // 出場不防抖:改對的那一瞬間立刻換回結果。
      setShownErrorRaw(null)
      return undefined
    }
    errorTimerRef.current = setTimeout(() => setShownErrorRaw(pendingErrorRaw), ERROR_DEBOUNCE_MS)
    return () => clearTimeout(errorTimerRef.current)
  }, [pendingErrorRaw])

  // 最後一份成功的比對結果。錯誤防抖的那 500ms 之內畫面上顯示的就是它 ——
  // 清空輸出等於用另一種閃爍換掉紅色閃爍(沿用 JsonTool.jsx 的處理)。
  // 這裡在 render 期間寫 ref:寫入值完全由本次 render 的 result 推導而來且冪等。
  const lastOkRef = useRef(null)
  if (result && result.ok) lastOkRef.current = result
  else if (pattern === '') lastOkRef.current = null

  const hasInput = pattern !== '' && text !== ''
  const shown = result && result.ok ? result : lastOkRef.current
  const matches = shown && hasInput ? shown.matches : []
  const visibleMatches = matches.slice(0, MAX_DISPLAY_MATCHES)
  const matchReport = useMemo(() => buildMatchReport(matches), [matches])

  // 只有在真的有命中、而且使用者明確寫了不含 g 的旗標時才提示 —— 裸 pattern 已經
  // 自動補上 g,提示會變成噪音。
  const missingGlobalHint =
    patternInput.startsWith('/') && !flags.includes('g') && matches.length > 0

  const renderResult = () => {
    if (status === 'unsupported') return errorBanner(UNSUPPORTED_NOTICE)
    if (status === 'timeout') return errorBanner(TIMEOUT_NOTICE)
    if (status === 'worker-error') return errorBanner(WORKER_ERROR_NOTICE)
    if (shownErrorRaw !== null) {
      return (
        <div className="dt-error-banner">
          <AlertCircle size={16} className="dt-error-icon" />
          <div className="dt-regex-error-body">
            <span>{SYNTAX_ERROR_NOTICE}</span>
            {/* 這裡刻意顯示引擎原文,與 D-22 對 JSON 的判斷不同:寫正則的人看得懂
                "Unterminated group" 指的是什麼,那句話比任何我們自己寫的中文都精準。
                預設收合,不想看的人不會被英文訊息干擾。用原生 details 而不是自寫
                展開狀態 —— 鍵盤操作與 aria 展開語意都是免費的。 */}
            <details className="dt-regex-detail">
              <summary>顯示詳細錯誤</summary>
              <pre className="dt-code dt-regex-detail-raw">{shownErrorRaw}</pre>
            </details>
          </div>
        </div>
      )
    }
    if (!hasInput || !shown) return <p className="dt-empty">{EMPTY_HINT}</p>

    return (
      <>
        {/* ── 上半:highlight ── */}
        <div className="dt-code dt-regex-highlight">
          {/* D-23 的「上底色」。片段一律以 JSX 文字節點渲染 —— React 會自動 escape,
              測試文字裡的 HTML 片段只會原樣顯示,不會被當成標記執行,
              因此不需要(也不該有)任何自寫的 HTML escape 邏輯。 */}
          {shown.segments.map((segment, i) =>
            segment.matched ? (
              <mark key={i} className="dt-regex-mark">{segment.text}</mark>
            ) : (
              <span key={i}>{segment.text}</span>
            )
          )}
        </div>

        <p className="dt-regex-count" aria-live="polite">
          {`共 ${matches.length} 筆符合`}
        </p>

        {shown.truncated && (
          <p className="dt-regex-note">
            {`符合筆數超過 ${MAX_MATCHES} 筆,已停在前 ${MAX_MATCHES} 筆。`}
          </p>
        )}
        {missingGlobalHint && (
          <p className="dt-regex-note">
            這個式子沒有帶 g 旗標,所以只會標出第一筆;想標出全部請寫成
            {' '}
            <code className="dt-code">/{pattern}/{flags}g</code>。
          </p>
        )}

        {/* ── 下半:逐筆列出 match 與捕獲群組(D-23)──
            只有底色看不出「第一組抓到什麼」,而那往往才是寫正則時真正要確認的事。 */}
        {matches.length === 0 ? (
          <p className="dt-empty">{NO_MATCH_HINT}</p>
        ) : (
          <ol className="dt-regex-matches">
            {visibleMatches.map((m, i) => (
              <li className="dt-regex-match" key={`${m.index}-${i}`}>
                <div className="dt-regex-match-head">
                  <span className="dt-regex-match-no">{`#${i + 1}`}</span>
                  <span className="dt-regex-match-meta">{`位置 ${m.index} · 長度 ${m.length}`}</span>
                </div>
                <div className="dt-code dt-regex-match-value">
                  {m.length === 0 ? '(零寬匹配,沒有實際字元)' : m.value}
                </div>

                {m.groups.length === 0 ? (
                  <div className="dt-regex-group dt-regex-group--empty">此 match 無捕獲群組</div>
                ) : (
                  m.groups.map((g, gi) => (
                    <div className="dt-regex-group" key={gi}>
                      <span className="dt-regex-group-name">{`群組 ${gi + 1}`}</span>
                      <span className="dt-code dt-regex-group-value">
                        {g === null ? '(未參與比對)' : g}
                      </span>
                    </div>
                  ))
                )}

                {/* 具名群組另外列一組並標出名稱。刻意不硬把名稱塞回上面的編號清單 ——
                    要正確做出「編號 → 名稱」的對應必須自己剖析 pattern 的括號結構
                    (還得處理跳脫與字元類別),猜錯的代價是顯示一個看起來很像真的
                    錯誤對應,比分開列還糟。 */}
                {m.namedGroups &&
                  Object.keys(m.namedGroups).map((name) => (
                    <div className="dt-regex-group" key={`named-${name}`}>
                      <span className="dt-regex-group-name dt-regex-group-name--named">{name}</span>
                      <span className="dt-code dt-regex-group-value">
                        {m.namedGroups[name] === null ? '(未參與比對)' : m.namedGroups[name]}
                      </span>
                    </div>
                  ))}
              </li>
            ))}
          </ol>
        )}

        {matches.length > MAX_DISPLAY_MATCHES && (
          <p className="dt-regex-note">
            {`只列出前 ${MAX_DISPLAY_MATCHES} 筆(共 ${matches.length} 筆),按「複製」會取得完整清單。`}
          </p>
        )}
      </>
    )
  }

  return (
    <div className="dt-regex-tool">
      <h3 className="dt-tool-heading">正則表達式測試</h3>

      {/* D-04:DOM 順序為輸入在前、輸出在後,768px 以下自然塌成上下堆疊。 */}
      <div className="dt-layout-split">
        <div className="dt-regex-pane">
          <label className="dt-regex-label" htmlFor="dt-regex-pattern">
            正則表達式
          </label>
          <input
            id="dt-regex-pattern"
            type="text"
            className={`dt-regex-input${shownErrorRaw !== null ? ' dt-regex-input--error' : ''}`}
            value={patternInput}
            onChange={(e) => setPatternInput(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            placeholder="\d{4}-\d{2}-\d{2}"
          />
          {/* D-23 排除旗標勾選框,所以「旗標要怎麼給」必須在畫面上講清楚,
              否則使用者只會覺得少了功能。 */}
          <p className="dt-regex-hint">
            預設會標出全部符合的片段。需要其他旗標時,把式子寫成
            {' '}
            <code className="dt-code">/pattern/gi</code>
            {' '}的形式即可。
          </p>

          <label className="dt-regex-label" htmlFor="dt-regex-text">
            測試文字
          </label>
          <textarea
            id="dt-regex-text"
            className="dt-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder="貼上要測試的文字"
          />

          {/* 載入範例排最左(本階段唯一的 primary CTA),其餘沿用 ghost 家族。 */}
          <ToolActions>
            <ExampleButton
              onLoad={() => {
                setPatternInput(EXAMPLE_PATTERN)
                setText(EXAMPLE_TEXT)
              }}
            />
            {matches.length > 0 && <CopyButton text={matchReport} label="複製比對結果" />}
            <ClearButton
              onClear={() => {
                setPatternInput('')
                setText('')
              }}
            />
            <PasteButton onPaste={setText} />
          </ToolActions>
        </div>

        <div className="dt-regex-pane">{renderResult()}</div>
      </div>
    </div>
  )
}

function errorBanner(message) {
  return (
    <div className="dt-error-banner">
      <AlertCircle size={16} className="dt-error-icon" />
      <span>{message}</span>
    </div>
  )
}

// 這個工具刻意沒有的東西,列在這裡避免日後被「補上」:
//   - 沒有「比對」按鈕(D-06:即時運算)
//   - 沒有 g/i/m/s 旗標勾選框、沒有常用正則快選範本(D-23 明文排除)
//   - 沒有分享連結、沒有把輸入寫進網址(D-27)
//   - 沒有任何瀏覽器端的持久化儲存(D-07)
//   - 沒有任何繞過 JSX 直接塞 HTML 的渲染方式:highlight 一律是文字節點
//   - 沒有主執行緒上的比對路徑,連 Worker 不可用時的「降級」都沒有(D-20)
// (前四項都有靜態閘門逐一把關,所以這段註解刻意不寫出那些 API 的名字 ——
//  寫出來會讓 grep 閘門在自己的註解上誤報。)
