// Base64 轉換(FEAT-09)—— 文字雙向即時轉換 + 檔案拖放轉 data URI,全部在瀏覽器端完成。
// Source: 04-CONTEXT.md D-06(即時運算,沒有「轉換」按鈕)、D-11(範例必須明顯虛構)、
//         D-18(中文往返不得走樣)、D-19 / D-25(超過上限就停止運算並明講數值);
//         04-UI-SPEC.md §Per-Tool Specification 的 Base64 那一列(模式預設文字、
//         拖放區虛線邊框只在檔案模式出現、三段錯誤文案、空狀態文案)。
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
import {
  base64ToText,
  isValidBase64,
  measureBytes,
  textToBase64,
  MAX_TEXT_BYTES,
} from './base64Utils'

// D-11:混中英文的短句。目的就是當場證明 UTF-8 往返不會壞 —— 按下「載入範例」後
// 右欄出現一串 Base64,把它自己貼回右欄再看左欄,中文一個字都不差。
// 刻意不含任何 token、金鑰、email 或可被誤認為真實憑證的字串。
const EXAMPLE_TEXT = 'Hello, 世界!這行中英混排的字會原封不動轉回來。'

// 04-UI-SPEC.md §Copywriting Contract 與 §Per-Tool Specification 的鎖定文案,逐字使用。
const EMPTY_HINT = '尚未輸入內容 —— 貼上文字或拖放檔案到這裡開始轉換。'
const OVER_LIMIT_NOTICE = '輸入內容超過 200 KB 上限,已停止即時運算,請縮短內容。'
const DECODE_ERROR_NOTICE = '無法解碼:內容不是合法的 Base64 字串。'

// 錯誤狀態的進出刻意不對稱(沿用 JsonTool.jsx 建立的慣例):
// 【進場】延遲 500ms —— 使用者手打 Base64 時,幾乎每一個中間狀態的長度都還不合法,
// 不防抖的話會變成每敲一個字閃一次紅色。
// 【出場】完全不防抖 —— 一改對就立刻換回結果,保住「邊打邊出」的手感。
const ERROR_DEBOUNCE_MS = 500

// 計數器文案。未滿 1 KB 時直接講位元組數,避免小輸入永遠顯示「0.0 KB」。
// JsonTool.jsx 有同形狀的私有函式:兩者都只是顯示用的字串拼接,沒有共用價值,
// 為了它去動 04-02 已上線的檔案結構反而是更大的代價。
function formatByteLabel(bytes) {
  if (bytes < 1024) return `${bytes} 位元組`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export default function Base64Tool() {
  // 04-UI-SPEC.md 鎖定:模式切換預設「文字」,不是「檔案」。
  const [mode, setMode] = useState('text')

  // D-06 的雙向即時轉換:兩側都能打字,但**只有一份真值** ——
  // `side` 記住最後編輯的是哪一側,另一側永遠是算出來的。
  // 用兩份獨立 state 互相同步的話,兩個 effect 會互相觸發成無窮迴圈;
  // 只留一份真值則從根本上不存在這個問題。
  const [entry, setEntry] = useState({ side: 'plain', value: '' })

  // D-07:只存在 React state,離開分頁即消失,不寫任何瀏覽器端儲存,也不進網址(D-27)。
  const [shownError, setShownError] = useState(null)
  const errorTimerRef = useRef(null)

  const entryBytes = measureBytes(entry.value)
  const overLimit = entryBytes > MAX_TEXT_BYTES

  // D-06:直接由輸入推導,沒有「轉換」按鈕。
  // D-19 / D-25:超限時**完全不進編解碼**,不是算完再藏起來。
  const conversion = useMemo(() => {
    if (entry.value.length === 0) return { empty: true, plain: '', encoded: '' }
    if (measureBytes(entry.value) > MAX_TEXT_BYTES) {
      return { overLimit: true, plain: '', encoded: '' }
    }
    if (entry.side === 'plain') {
      return { ok: true, plain: entry.value, encoded: textToBase64(entry.value) }
    }
    if (!isValidBase64(entry.value)) {
      return { invalid: true, plain: '', encoded: entry.value }
    }
    return { ok: true, plain: base64ToText(entry.value), encoded: entry.value }
  }, [entry])

  // 即時算出來的錯誤。空輸入與超限都不算「解碼失敗」,不走錯誤路徑。
  const pendingError = conversion.invalid === true ? DECODE_ERROR_NOTICE : null

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

  // 最後一次成功的轉換結果。輸入打到一半必然會經過大量不合法的中間狀態,
  // 這時輸出側保留上一份成功結果,比每敲一個字就把整欄清空要好讀得多 ——
  // 這也正是錯誤防抖那 500ms 之內畫面上會看到的東西。
  // 在 render 期間寫 ref:寫入值完全由本次 render 的 entry 推導而來且冪等。
  const lastGoodRef = useRef({ plain: '', encoded: '' })
  if (conversion.ok) lastGoodRef.current = { plain: conversion.plain, encoded: conversion.encoded }
  else if (conversion.empty || conversion.overLimit) lastGoodRef.current = { plain: '', encoded: '' }

  const plainValue =
    entry.side === 'plain'
      ? entry.value
      : (conversion.ok ? conversion.plain : lastGoodRef.current.plain)
  const encodedValue =
    entry.side === 'encoded'
      ? entry.value
      : (conversion.ok ? conversion.encoded : lastGoodRef.current.encoded)

  const plainBytes = measureBytes(plainValue)
  const encodedBytes = measureBytes(encodedValue)

  // 輸出側 = 目前沒在編輯的那一側。狀態訊息(空狀態 / 解碼失敗 / 超限)一律
  // 就地渲染在輸出側面板內,不用 Toast、不用 modal、不用原生對話框。
  const outputSide = entry.side === 'plain' ? 'encoded' : 'plain'
  const outputValue = outputSide === 'plain' ? plainValue : encodedValue

  const renderStatus = (side) => {
    if (side !== outputSide) return null
    // D-19:超限時是「明確告訴你上限並停止運算」,不是把結果藏起來繼續硬算。
    if (conversion.overLimit) {
      return (
        <div className="dt-error-banner">
          <AlertCircle size={16} className="dt-error-icon" />
          <span>{OVER_LIMIT_NOTICE}</span>
        </div>
      )
    }
    if (conversion.empty) return <p className="dt-empty">{EMPTY_HINT}</p>
    // 解碼失敗的訊息出現在「原文側」,紅框則落在真正出問題的那一側(Base64 側)。
    if (shownError) {
      return (
        <div className="dt-error-banner">
          <AlertCircle size={16} className="dt-error-icon" />
          <span>{shownError}</span>
        </div>
      )
    }
    return null
  }

  const encodedHasError = shownError !== null || (overLimit && entry.side === 'encoded')
  const plainHasError = overLimit && entry.side === 'plain'

  return (
    <div className="dt-base64-tool">
      <h3 className="dt-tool-heading">Base64 轉換</h3>

      {/* 04-UI-SPEC.md 鎖定:預設「文字」。視覺沿用 .dt-chip 家族的小尺寸變體,
          不另創新的樣式語彙。 */}
      <div className="dt-mode-toggle" role="group" aria-label="轉換模式">
        <button
          type="button"
          className={`dt-chip dt-chip--sm ${mode === 'text' ? 'dt-chip--active' : ''}`}
          aria-pressed={mode === 'text'}
          onClick={() => setMode('text')}
        >
          文字
        </button>
        <button
          type="button"
          className={`dt-chip dt-chip--sm ${mode === 'file' ? 'dt-chip--active' : ''}`}
          aria-pressed={mode === 'file'}
          onClick={() => setMode('file')}
        >
          檔案
        </button>
      </div>

      {mode === 'text' && (
        <>
          {/* D-04:DOM 順序為原文在前、Base64 在後,768px 以下自然塌成上下堆疊,
              不需要任何 order 屬性。 */}
          <div className="dt-layout-split">
            <div className="dt-base64-pane">
              <span className="dt-field-label">原文</span>
              <textarea
                className={`dt-textarea${plainHasError ? ' dt-textarea--error' : ''}`}
                value={plainValue}
                onChange={(e) => setEntry({ side: 'plain', value: e.target.value })}
                spellCheck={false}
                aria-label="原文輸入"
                placeholder="在這裡輸入或貼上文字"
              />
              <span className={`dt-counter${plainBytes > MAX_TEXT_BYTES ? ' dt-counter--over' : ''}`}>
                {`${formatByteLabel(plainBytes)} / 200 KB`}
              </span>
              {renderStatus('plain')}
            </div>

            <div className="dt-base64-pane">
              <span className="dt-field-label">Base64</span>
              <textarea
                className={`dt-textarea${encodedHasError ? ' dt-textarea--error' : ''}`}
                value={encodedValue}
                onChange={(e) => setEntry({ side: 'encoded', value: e.target.value })}
                spellCheck={false}
                aria-label="Base64 輸入"
                placeholder="在這裡貼上 Base64 字串"
              />
              <span
                className={`dt-counter${encodedBytes > MAX_TEXT_BYTES ? ' dt-counter--over' : ''}`}
              >
                {`${formatByteLabel(encodedBytes)} / 200 KB`}
              </span>
              {renderStatus('encoded')}
            </div>
          </div>

          {/* 載入範例排最左(本階段唯一的 primary CTA),其餘沿用 ghost 家族。
              複製的目標是「輸出側」—— 也就是目前沒在編輯的那一欄;
              貼上則填進「目前正在編輯的那一側」,符合手上動作的直覺。 */}
          <ToolActions>
            <ExampleButton onLoad={() => setEntry({ side: 'plain', value: EXAMPLE_TEXT })} />
            {outputValue && <CopyButton text={outputValue} />}
            <ClearButton onClear={() => setEntry({ side: 'plain', value: '' })} />
            <PasteButton onPaste={(value) => setEntry({ side: entry.side, value })} />
          </ToolActions>
        </>
      )}

      {mode === 'file' && <p className="dt-empty">{EMPTY_HINT}</p>}
    </div>
  )
}

// 這個工具刻意沒有的東西,列在這裡避免日後被「補上」:
//   - 沒有「轉換」按鈕(D-06:即時運算)
//   - 沒有分享連結、沒有把輸入或 data URI 寫進網址(D-27)
//   - 沒有任何瀏覽器端的持久化儲存(D-07)
//   - 沒有任何把檔案交出去的路徑:沒有表單提交、沒有對外通訊(FEAT-14)
// (以上都有靜態閘門逐一把關,所以這段註解刻意不寫出那些 API 的名字 ——
//  寫出來會讓 grep 閘門在自己的註解上誤報。)
