// 文字雜湊(FEAT-12)—— 五種演算法同時計算,全部在瀏覽器端完成,無任何對外通訊。
// Source: 04-CONTEXT.md D-13(SHA-1 / SHA-256 / SHA-384 / SHA-512 走 crypto.subtle,
//         外加 MD5,五種一次全部算出並各自可複製)、D-14(MD5 的手刻例外)、
//         04-UI-SPEC.md §Component Inventory 的 .dt-hash-row(固定順序、五列永遠同時可見、
//         MD5 caption 為鎖定文案、pending 用靜態三點字元而非動畫)。
//
// 【四種 SHA 一律走原生 API,不得手刻】
// 演算法名稱是 Web Crypto 規格定義的字串,必須逐字使用。md5.js 的手刻是 D-14 核准的
// 單一例外,範圍僅限 MD5 —— 不得援引它來手寫 SHA。
//
// 【同步與非同步混在一起的處理】
// crypto.subtle.digest() 回傳 Promise,手刻的 MD5 是同步的。五種混用最容易在狀態更新
// 順序上出錯,所以這裡統一成同一個非同步介面(MD5 由 async 函式包成一致形狀),
// 五個請求同時發出、各自獨立更新自己那一列,不等全部完成才顯示任何一個。
//
// 所有 .dt-* 樣式都住在 DevToolsTab.jsx 的 scoped <style> 內(全工具箱共用一份樣式表)。
import { useEffect, useRef, useState } from 'react'
import {
  ClearButton,
  CopyButton,
  ExampleButton,
  PasteButton,
  ToolActions,
} from './DevToolsActions'
import { md5 } from './md5'

const MD5_ID = 'MD5'

// 固定順序:SHA-1 → SHA-256 → SHA-384 → SHA-512 → MD5(D-13 的列舉順序,
// MD5 排最後因為它是「額外」的那一個)。五列永遠同時可見,不做摺疊。
// id 同時是 crypto.subtle.digest() 的演算法名稱,四個 SHA 的字串為規格定義值。
const ALGORITHMS = [
  { id: 'SHA-1' },
  { id: 'SHA-256' },
  { id: 'SHA-384' },
  { id: 'SHA-512' },
  { id: MD5_ID },
]

// 04-UI-SPEC.md §Copywriting Contract 的鎖定文案,逐字使用。
// 這是本階段唯一一段以「防止誤用」為目的的 UI 文案 —— MD5 早已可被構造出碰撞,
// 拿來雜湊密碼是實際的危險。不得改寫或省略。
const MD5_CAPTION = '非密碼學安全,僅供檔案 checksum 比對'

// 空輸入時顯示的中性破折號。刻意不顯示空字串的雜湊值 ——
// 「還沒輸入」看起來像已經算出結果會讓人以為工具壞了。
const IDLE_VALUE = '—'
// pending 用靜態三點字元,不用 spinner、不用 skeleton 動畫,
// 因此完全不需要另外處理減少動態偏好。
const PENDING_VALUE = '···'
const ERROR_VALUE = '這個環境無法計算'

// 04-UI-SPEC.md 給的示範句(D-11:範例要能當場證明功能)。
const EXAMPLE_TEXT = '在這裡輸入任何文字,五種雜湊值會同時算出來。'

function bufferToHex(buffer) {
  const bytes = new Uint8Array(buffer)
  let hex = ''
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

/**
 * 統一的非同步介面(五種演算法同一個形狀)。
 * MD5 是同步的,包在 async 函式裡回傳 —— 呼叫端因此不必分辨哪一種是同步的,
 * 也就不會出現「有的直接寫進 state、有的走 then」的兩套更新路徑。
 */
async function digestHex(algorithm, text) {
  if (algorithm === MD5_ID) return md5(text)

  // crypto.subtle 只在安全來源(https / localhost)存在。取不到就讓這一列顯示說明,
  // 而不是留下一個永遠停在 pending 的空列。
  const subtle = typeof crypto !== 'undefined' ? crypto.subtle : undefined
  if (!subtle) throw new Error('unavailable')

  const bytes = new TextEncoder().encode(text)
  return bufferToHex(await subtle.digest(algorithm, bytes))
}

function makeRows(status) {
  const rows = {}
  for (const algorithm of ALGORITHMS) rows[algorithm.id] = { status, value: '' }
  return rows
}

export default function HashTool() {
  // D-07:只存在 React state,離開分頁即消失,不寫任何瀏覽器端儲存,也不進網址(D-27)。
  const [input, setInput] = useState('')
  const [rows, setRows] = useState(() => makeRows('idle'))

  // 競態防護:舊輸入的 Promise 可能比新輸入的晚 resolve。每次輸入變更就把序號加一,
  // 只有序號仍是最新的結果才會被寫進 state —— 否則使用者快速打字時會看到值跳回舊的。
  const requestIdRef = useRef(0)

  useEffect(() => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    if (input === '') {
      setRows(makeRows('idle'))
      return
    }

    // 五列同時進 pending,然後五個請求一起發出。每一列各自 resolve、各自更新,
    // 不做「全部完成才一起顯示」的匯總 —— 那會讓最快的 MD5 陪最慢的 SHA-512 一起等。
    setRows(makeRows('pending'))

    for (const algorithm of ALGORITHMS) {
      digestHex(algorithm.id, input).then(
        (value) => {
          if (requestIdRef.current !== requestId) return
          setRows((previous) => ({ ...previous, [algorithm.id]: { status: 'done', value } }))
        },
        () => {
          // 不讀取例外內容 —— 沒有變數可讀,就不可能把引擎訊息或輸入內容回顯出去。
          if (requestIdRef.current !== requestId) return
          setRows((previous) => ({ ...previous, [algorithm.id]: { status: 'error', value: '' } }))
        }
      )
    }
  }, [input])

  // 卸載後不再接受任何結果:序號往前推一格,尚未 resolve 的 Promise 全部失效。
  useEffect(() => () => { requestIdRef.current += 1 }, [])

  const renderValue = (row) => {
    if (row.status === 'done') return row.value
    if (row.status === 'pending') return PENDING_VALUE
    if (row.status === 'error') return ERROR_VALUE
    return IDLE_VALUE
  }

  return (
    <div className="dt-hash-tool">
      <h3 className="dt-tool-heading">雜湊計算</h3>

      {/* D-03:沒有大段輸入的工具走單欄緊湊版,不留一整欄的空白。 */}
      <div className="dt-layout-compact">
        <textarea
          className="dt-textarea dt-hash-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          aria-label="要計算雜湊的文字"
          placeholder="輸入或貼上任何文字,五種雜湊值會同時算出來"
        />

        <ul className="dt-hash-list">
          {ALGORITHMS.map((algorithm) => {
            const row = rows[algorithm.id]
            const isDone = row.status === 'done'
            return (
              <li className="dt-hash-row" key={algorithm.id}>
                <span className="dt-hash-name">{algorithm.id}</span>
                <span
                  className={`dt-code dt-hash-value${isDone ? '' : ' dt-hash-value--idle'}`}
                  title={isDone ? row.value : undefined}
                >
                  {renderValue(row)}
                </span>
                {/* 有值才渲染複製鈕 —— 永遠渲染的話,空狀態按下去會複製一個破折號
                    卻跳出「已複製」,那是假話。icon-only 變體的 label 必須說明複製的是
                    哪一種雜湊,不得是裸的「複製」。 */}
                {isDone ? (
                  <CopyButton text={row.value} label={`複製 ${algorithm.id} 雜湊值`} compact />
                ) : (
                  <span className="dt-hash-spacer" aria-hidden="true" />
                )}
                {algorithm.id === MD5_ID && (
                  <span className="dt-hash-caption">{MD5_CAPTION}</span>
                )}
              </li>
            )
          })}
        </ul>

        {/* 載入範例排最左(本階段唯一的 primary CTA)。整體的「複製」由每一列自己的
            compact 複製鈕負責,按鈕列不再放一顆全域複製。 */}
        <ToolActions>
          <ExampleButton onLoad={() => setInput(EXAMPLE_TEXT)} />
          <ClearButton onClear={() => setInput('')} />
          <PasteButton onPaste={setInput} />
        </ToolActions>
      </div>
    </div>
  )
}

// 這個工具刻意沒有的東西,列在這裡避免日後被「補上」:
//   - 沒有「計算」按鈕(D-06:即時運算)
//   - 沒有摺疊或分頁,五列永遠同時可見(04-UI-SPEC.md 的鎖定行為)
//   - 沒有動畫式的載入指示,pending 只是一個靜態字元
//   - 沒有分享連結、沒有把輸入寫進網址(D-27 —— 輸入可能是密碼或機敏字串)
//   - 沒有任何瀏覽器端的持久化儲存(D-07)
