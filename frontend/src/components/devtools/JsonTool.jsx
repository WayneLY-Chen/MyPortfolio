// JSON 格式化與驗證(FEAT-07)—— 全部運算在瀏覽器端完成,無任何對外通訊。
// Source: 04-CONTEXT.md D-06(即時運算,沒有「轉換」按鈕)、D-11(範例資料必須明顯虛構)、
//         D-19 / D-25(超過 200 KB 就停止運算並明講上限)、D-22(錯誤要指出行列並標出出錯行);
//         04-UI-SPEC.md §Per-Tool Specification 的 JSON 那一列(空狀態、範例形狀、錯誤文案)。
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
// 只取 formatJson:它已經在內部先量位元組數(超限就不 parse)、再驗證、再格式化,
// 回傳值同時帶著 overLimit 旗標與 validateJson 的完整錯誤資訊。元件另外再呼叫一次
// validateJson / measureBytes 只會讓每一次按鍵多掃一遍同一份輸入。
import { formatJson } from './jsonFormatter'

// D-11:明顯虛構的小型巢狀物件,含中文值、陣列與布林,形狀取自 04-UI-SPEC.md。
// 刻意不含 email、電話、token、金鑰或任何可被誤認為真實憑證的字串。
// 寫成單行是刻意的 —— 按下「載入範例」後,右欄縮排開來的落差就是這個工具的示範本身。
const EXAMPLE_JSON =
  '{"name":"訪客","tags":["portfolio","demo"],"active":true,"profile":{"city":"台北","visits":3}}'

// 04-UI-SPEC.md §Copywriting Contract 的鎖定文案,逐字使用。
const EMPTY_HINT = '尚未輸入內容 —— 點選「載入範例」或直接貼上 JSON 開始。'
const OVER_LIMIT_NOTICE = '輸入內容超過 200 KB 上限,已停止即時運算,請縮短內容。'

// D-06 授權由實作決定的部分:錯誤狀態的進出刻意不對稱。
// 【進場】延遲 500ms —— 使用者手打 JSON 時,幾乎每一個中間狀態都是不合法的
// (打完 `{` 的那一瞬間就已經不合法了),不防抖的話會變成每敲一個字閃一次紅色,
// 比 D-06 想消除的摩擦更糟。
// 【出場】完全不防抖 —— 一改對就立刻換回結果,保住「邊打邊出」的手感。成功狀態
// 沒有中間態閃爍的問題,沒有理由讓它慢半拍。
const ERROR_DEBOUNCE_MS = 500

// 計數器文案。未滿 1 KB 時直接講位元組數,避免小輸入永遠顯示「0.0 KB」。
function formatByteLabel(bytes) {
  if (bytes < 1024) return `${bytes} 位元組`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function joinRange(from, to) {
  if (to < from) return ''
  let out = ''
  for (let i = from; i <= to; i += 1) out += (i === from ? '' : '\n') + i
  return out
}

// D-22:行號槽的內容。刻意切成「錯誤行之前 / 錯誤行 / 錯誤行之後」三段而不是
// 每行一個元素 —— 200 KB 的 JSON 可能有上萬行,一行一個 DOM 節點會讓每一次按鍵
// 都重繪上萬個元素。三段之後,不論幾行都只有三個節點。
function buildGutterSegments(lineCount, errorLine) {
  const marked = Number.isInteger(errorLine) && errorLine >= 1 && errorLine <= lineCount
  if (!marked) return { before: joinRange(1, lineCount), error: '', after: '' }
  return {
    before: joinRange(1, errorLine - 1),
    error: String(errorLine),
    after: joinRange(errorLine + 1, lineCount),
  }
}

export default function JsonTool() {
  // D-07:只存在 React state,離開分頁即消失,不寫任何瀏覽器端儲存,也不進網址(D-27)。
  const [input, setInput] = useState('')
  // 真正顯示在畫面上的錯誤(已經過防抖),與下方即時算出來的 pendingError 不同。
  const [shownError, setShownError] = useState(null)
  const errorTimerRef = useRef(null)
  const gutterRef = useRef(null)

  // D-06:onChange 直接觸發運算,沒有「轉換」按鈕。formatJson 內部已經先量位元組數
  // 再決定要不要 parse,超過 200 KB 時它根本不會呼叫 JSON.parse(D-25 的實際防線)。
  const result = useMemo(() => formatJson(input), [input])
  const overLimit = result.overLimit === true
  const isEmpty = result.empty === true

  // 即時算出來的錯誤。超限與空輸入都不算「語法錯誤」,不進錯誤路徑。
  const pendingError = useMemo(() => {
    if (result.ok || isEmpty || overLimit || !result.message) return null
    return { line: result.line, column: result.column, message: result.message }
  }, [result, isEmpty, overLimit])

  useEffect(() => {
    clearTimeout(errorTimerRef.current)
    if (!pendingError) {
      setShownError(null)
      return undefined
    }
    errorTimerRef.current = setTimeout(() => setShownError(pendingError), ERROR_DEBOUNCE_MS)
    // 卸載時清掉還沒觸發的 timer,避免對已卸載的元件 setState。
    return () => clearTimeout(errorTimerRef.current)
  }, [pendingError])

  // 最後一次成功的格式化結果。輸入打到一半必然會經過大量不合法的中間狀態,
  // 這時右欄保留上一份成功結果,比每敲一個字就把輸出清空要好讀得多 —— 這也正是
  // 錯誤防抖那 500ms 之內畫面上會看到的東西。
  // 這裡在 render 期間寫 ref:寫入值完全由本次 render 的 input 推導而來且冪等,
  // 重複執行不會產生不同結果。
  const lastFormattedRef = useRef('')
  if (result.ok) lastFormattedRef.current = result.formatted
  else if (isEmpty || overLimit) lastFormattedRef.current = ''

  const outputText = result.ok ? result.formatted : lastFormattedRef.current
  const hasError = overLimit || shownError !== null

  const lineCount = useMemo(() => input.split('\n').length, [input])
  const gutter = useMemo(
    () => buildGutterSegments(lineCount, shownError?.line),
    [lineCount, shownError]
  )

  // 行號槽自己不捲動(overflow: hidden),完全跟著 textarea 的捲動位置走。
  const handleScroll = (e) => {
    if (gutterRef.current) gutterRef.current.scrollTop = e.target.scrollTop
  }

  const renderOutput = () => {
    // D-19:超限時是「明確告訴你上限並停止運算」,不是把結果藏起來繼續硬算。
    if (overLimit) {
      return (
        <div className="dt-error-banner">
          <AlertCircle size={16} className="dt-error-icon" />
          <span>{OVER_LIMIT_NOTICE}</span>
        </div>
      )
    }
    if (isEmpty) return <p className="dt-empty">{EMPTY_HINT}</p>
    if (result.ok) return <pre className="dt-code dt-json-output">{result.formatted}</pre>
    // D-22:錯誤是即時運算下的常態,不是例外事件 —— 就地渲染在輸出面板內取代結果,
    // 不用 Toast、不用 modal、不用原生對話框。訊息一律來自自寫掃描器。
    if (shownError) {
      return (
        <div className="dt-error-banner">
          <AlertCircle size={16} className="dt-error-icon" />
          <span>{shownError.message}</span>
        </div>
      )
    }
    if (outputText) return <pre className="dt-code dt-json-output">{outputText}</pre>
    return <p className="dt-empty">{EMPTY_HINT}</p>
  }

  return (
    <div className="dt-json-tool">
      <h3 className="dt-tool-heading">JSON 格式化與驗證</h3>

      {/* D-04:DOM 順序為輸入在前、輸出在後,768px 以下自然塌成上下堆疊,
          不需要任何 order 屬性。 */}
      <div className="dt-layout-split">
        <div className="dt-json-pane">
          <div className={`dt-json-input-row${hasError ? ' dt-json-input-row--error' : ''}`}>
            {/* D-22:原生 textarea 無法替個別字元上色,所以「標出出錯那一行」改由
                左側行號槽達成。刻意不換成 contentEditable 或第三方編輯器 —— 前者要
                自己重做游標與 IME 行為,後者違反本階段零新依賴的硬性約束。 */}
            <div className="dt-line-gutter" ref={gutterRef} aria-hidden="true">
              {gutter.before && <pre className="dt-gutter-seg">{gutter.before}</pre>}
              {gutter.error && (
                <pre className="dt-gutter-seg dt-gutter-seg--error">{gutter.error}</pre>
              )}
              {gutter.after && <pre className="dt-gutter-seg">{gutter.after}</pre>}
            </div>

            {/* wrap="off" 是行號槽正確性的前提:開著軟換行的話,一行超長的 JSON 在
                輸入區會佔掉好幾個視覺列,行號就會從那裡開始整片對不齊。關掉之後
                一個邏輯行永遠等於一個視覺列,改以橫向捲動處理長行(等同一般編輯器)。 */}
            <textarea
              className={`dt-textarea dt-json-textarea${hasError ? ' dt-textarea--error' : ''}`}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onScroll={handleScroll}
              wrap="off"
              spellCheck={false}
              aria-label="JSON 輸入"
              placeholder='{"貼上或輸入 JSON": true}'
            />
          </div>

          <span className={`dt-counter${overLimit ? ' dt-counter--over' : ''}`}>
            {`${formatByteLabel(result.byteLength)} / 200 KB`}
          </span>

          {/* 載入範例排最左(本階段唯一的 primary CTA),其餘三顆沿用 ghost 家族。 */}
          <ToolActions>
            <ExampleButton onLoad={() => setInput(EXAMPLE_JSON)} />
            {outputText && <CopyButton text={outputText} />}
            <ClearButton onClear={() => setInput('')} />
            <PasteButton onPaste={setInput} />
          </ToolActions>
        </div>

        <div className="dt-json-pane">{renderOutput()}</div>
      </div>
    </div>
  )
}

// 這個工具刻意沒有的東西,列在這裡避免日後被「補上」:
//   - 沒有「格式化 / 轉換」按鈕(D-06:即時運算)
//   - 沒有分享連結、沒有把輸入寫進網址(D-27)
//   - 沒有任何瀏覽器端的持久化儲存(D-07)
//   - 沒有任何繞過 JSX 直接塞 HTML 的渲染方式:輸出與錯誤訊息一律是文字節點
//   - 錯誤訊息內沒有任何瀏覽器引擎的原始英文字串(D-22)
// (以上四項都有靜態閘門逐一把關,所以這段註解刻意不寫出那些 API 的名字 ——
//  寫出來會讓 grep 閘門在自己的註解上誤報。)
