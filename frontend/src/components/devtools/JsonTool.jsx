// JSON 格式化與驗證(FEAT-07)—— 全部運算在瀏覽器端完成,無任何對外通訊。
// Source: 04-CONTEXT.md D-06(即時運算,沒有「轉換」按鈕)、D-11(範例資料必須明顯虛構)、
//         D-19 / D-25(超過 200 KB 就停止運算並明講上限)、D-22(錯誤要指出行列);
//         04-UI-SPEC.md §Per-Tool Specification 的 JSON 那一列(空狀態、範例形狀、錯誤文案)。
//
// 所有 .dt-* 樣式都住在 DevToolsTab.jsx 的 scoped <style> 內(全工具箱共用一份樣式表),
// 這個檔案不自己開 <style>,也不重新定義 04-01 已交付的共用 class。
import { useMemo, useRef, useState } from 'react'
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

// 計數器文案。未滿 1 KB 時直接講位元組數,避免小輸入永遠顯示「0.0 KB」。
function formatByteLabel(bytes) {
  if (bytes < 1024) return `${bytes} 位元組`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export default function JsonTool() {
  // D-07:只存在 React state,離開分頁即消失,不寫任何瀏覽器端儲存,也不進網址(D-27)。
  const [input, setInput] = useState('')

  // D-06:onChange 直接觸發運算,沒有「轉換」按鈕。formatJson 內部已經先量位元組數
  // 再決定要不要 parse,超過 200 KB 時它根本不會呼叫 JSON.parse(D-25 的實際防線)。
  const result = useMemo(() => formatJson(input), [input])
  const overLimit = result.overLimit === true
  const isEmpty = result.empty === true

  // 最後一次成功的格式化結果。輸入打到一半必然會經過大量不合法的中間狀態,
  // 這時右欄保留上一份成功結果,比每敲一個字就把輸出清空要好讀得多。
  // 這裡在 render 期間寫 ref:寫入值完全由本次 render 的 input 推導而來且冪等,
  // 重複執行不會產生不同結果。
  const lastFormattedRef = useRef('')
  if (result.ok) lastFormattedRef.current = result.formatted
  else if (isEmpty || overLimit) lastFormattedRef.current = ''

  const outputText = result.ok ? result.formatted : lastFormattedRef.current

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
          <textarea
            className={`dt-textarea${overLimit ? ' dt-textarea--error' : ''}`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            aria-label="JSON 輸入"
            placeholder='{"貼上或輸入 JSON": true}'
          />

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
//   - 沒有 localStorage / sessionStorage(D-07)
//   - 沒有 dangerouslySetInnerHTML:輸出與錯誤訊息一律以 JSX 文字節點渲染
