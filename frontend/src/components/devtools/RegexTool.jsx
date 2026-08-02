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
import { REGEX_TIMEOUT_MS, parsePatternInput } from './regexMatcher'

// D-11:明顯虛構的日期範例,形狀取自 04-UI-SPEC.md 正則那一列。
const EXAMPLE_PATTERN = '\\d{4}-\\d{2}-\\d{2}'
const EXAMPLE_TEXT =
  '這個網站在 2026-01-15 上線,最近一次改版是 2026-08-02,下一次預計排在 2027-03-01。'

// 04-UI-SPEC.md §Copywriting Contract / §Per-Tool Specification 的鎖定文案,逐字使用。
const EMPTY_HINT = '輸入正則表達式與測試文字,符合的片段會即時標示出來。'
const SYNTAX_ERROR_NOTICE = '正則語法錯誤,請檢查括號與跳脫字元是否配對正確。'
const TIMEOUT_NOTICE = '這個正則式比對超過 1 秒,已自動停止(可能是過於複雜的樣式導致大量回溯)。'
const WORKER_ERROR_NOTICE = '比對執行緒發生非預期錯誤,請調整正則後再試一次。'
const UNSUPPORTED_NOTICE = '這個瀏覽器不支援背景執行緒,為了避免頁面卡住,正則比對已停用。'

export default function RegexTool() {
  // D-07:只存在 React state,離開分頁即消失,不寫任何瀏覽器端儲存,也不進網址(D-27)。
  const [patternInput, setPatternInput] = useState('')
  const [text, setText] = useState('')
  // Worker 回傳的純資料。null 代表這一輪還沒有結果。
  const [result, setResult] = useState(null)
  // 'ready' | 'timeout' | 'worker-error' | 'unsupported'
  const [status, setStatus] = useState('ready')

  const workerRef = useRef(null)
  const timerRef = useRef(null)
  // 遞增請求序號,擋掉上一輪 Worker 的 late resolve(形狀沿用 HashTool.jsx)。
  const requestIdRef = useRef(0)

  // D-23:不做旗標勾選框。旗標由使用者寫進式子裡,這裡把 `/pattern/flags` 拆開。
  const { pattern, flags } = useMemo(() => parsePatternInput(patternInput), [patternInput])

  useEffect(() => {
    // 每一輪都先把上一輪的計時器與 Worker 收乾淨(effect 的 cleanup 已經做過一次,
    // 這裡只處理 pattern 為空、提早 return 的那條路徑)。
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

  const hasInput = pattern !== '' && text !== ''
  const compileError = result && result.ok === false ? result.error : null
  const segments = result && result.ok && hasInput ? result.segments : null

  const renderResult = () => {
    if (status === 'unsupported') return errorBanner(UNSUPPORTED_NOTICE)
    if (status === 'timeout') return errorBanner(TIMEOUT_NOTICE)
    if (status === 'worker-error') return errorBanner(WORKER_ERROR_NOTICE)
    if (compileError) return errorBanner(SYNTAX_ERROR_NOTICE)
    if (!hasInput) return <p className="dt-empty">{EMPTY_HINT}</p>
    if (!segments) return <p className="dt-empty">{EMPTY_HINT}</p>
    return (
      <p className="dt-code dt-regex-highlight">
        {/* D-23 的「上底色」。片段一律以 JSX 文字節點渲染 —— React 會自動 escape,
            測試文字裡的 HTML 片段只會原樣顯示,不會被當成標記執行。 */}
        {segments.map((segment, i) =>
          segment.matched ? (
            <mark key={i} className="dt-regex-mark">{segment.text}</mark>
          ) : (
            <span key={i}>{segment.text}</span>
          )
        )}
      </p>
    )
  }

  return (
    <div className="dt-regex-tool">
      <h3 className="dt-tool-heading">正則表達式測試</h3>

      <div className="dt-layout-split">
        <div className="dt-regex-pane">
          <input
            type="text"
            className="dt-regex-input"
            value={patternInput}
            onChange={(e) => setPatternInput(e.target.value)}
            spellCheck={false}
            aria-label="正則表達式"
            placeholder="\d{4}-\d{2}-\d{2}(需要旗標時寫成 /pattern/gi)"
          />
          <textarea
            className="dt-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            aria-label="測試文字"
            placeholder="貼上要測試的文字"
          />
          <button type="button" className="dt-btn dt-example-btn" onClick={() => {
            setPatternInput(EXAMPLE_PATTERN)
            setText(EXAMPLE_TEXT)
          }}>
            <span>載入範例</span>
          </button>
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
