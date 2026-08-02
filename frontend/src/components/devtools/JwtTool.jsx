// JWT 解碼(FEAT-08)—— 全部運算在瀏覽器端完成,無任何對外通訊。
// Source: 04-CONTEXT.md D-17(只解碼、不驗簽,不提供金鑰輸入欄)、D-06(即時運算)、
//         D-11(範例資料必須明顯虛構)、04-UI-SPEC.md §Per-Tool Specification 的 JWT 那一列
//         (空狀態、範例形狀、錯誤文案為鎖定字串)。
//
// 【這個工具刻意不做簽章驗證】
// 純前端要驗簽在技術上完全做得到,但那需要訪客把簽章金鑰貼進本站 —— 與 D-08 想建立的
// 「你的輸入不會離開這台電腦」的信任感直接衝突。因此畫面上不存在任何金鑰輸入欄,
// 第三段只原樣列出並標示「未驗證」。這是刻意的缺席,不是還沒做完,請勿「補上」。
//
// 【重用而非重寫】
// base64url 的字元替換與 padding 還原只有 base64Utils.js 一份實作(04-03 交付,
// 有與 Node base64url 逐字比對的測試);header / payload 的縮排呈現直接走 jsonFormatter.js
// 的 formatJson(04-02 交付)。這裡不再寫第二份。
//
// 所有 .dt-* 樣式都住在 DevToolsTab.jsx 的 scoped <style> 內(全工具箱共用一份樣式表),
// 這個檔案不自己開 <style>,也不重新定義既有的共用 class。
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import {
  ClearButton,
  CopyButton,
  ExampleButton,
  PasteButton,
  ToolActions,
} from './DevToolsActions'
import { base64ToText, fromBase64Url, textToBase64, toBase64Url } from './base64Utils'
import { formatJson } from './jsonFormatter'

// 04-UI-SPEC.md §Per-Tool Specification 的鎖定文案,逐字使用。
const EMPTY_HINT =
  '尚未輸入內容 —— 貼上一組 JWT,或點選「載入範例」查看 header / payload 長什麼樣子。'
const FORMAT_ERROR =
  '看起來不是有效的 JWT 格式(需為以「.」分隔、至少兩段的 Base64url 字串)。'

// 錯誤狀態進出不對稱(沿用 JsonTool.jsx 建立的工具箱慣例):
// 進場延遲 500ms —— 貼上一長串 token 的過程中會經過大量不完整的中間狀態;
// 出場完全不防抖 —— 一改對就立刻換回結果。
const ERROR_DEBOUNCE_MS = 500

// D-11:示範用的假簽章。這是 'demo-signature-not-verified' 的 base64url 形式,
// 不是任何真實的簽章值,也不會被拿去驗證任何東西(本工具根本不驗簽)。
const EXAMPLE_SIGNATURE = 'ZGVtby1zaWduYXR1cmUtbm90LXZlcmlmaWVk'

// RFC 7519 §4.1:exp / iat / nbf 一律是 NumericDate,也就是 Unix **秒數**。
// 換算成 JavaScript 的 Date 必須乘 1000 —— 少乘的話 2026 年的 token 會顯示成 1970 年。
const MS_PER_SECOND = 1000

const TIME_CLAIMS = [
  { key: 'exp', label: '到期時間', note: 'exp' },
  { key: 'iat', label: '簽發時間', note: 'iat' },
  { key: 'nbf', label: '生效時間', note: 'nbf' },
]

/** 把一段 base64url 還原成物件。任何一步失敗都回 null,不丟例外、不回顯內容。 */
function decodeSegment(segment) {
  if (typeof segment !== 'string' || segment === '') return null
  // 先 base64url → 標準 Base64,再走 UTF-8 安全的解碼路徑(中文 payload 不會壞)。
  const json = base64ToText(fromBase64Url(segment))
  if (json === '') return null
  try {
    const value = JSON.parse(json)
    // JWT 的 header 與 payload 依規格都是 JSON 物件;陣列或純量代表這不是 JWT。
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
    const formatted = formatJson(json)
    return { value, text: formatted.ok ? formatted.formatted : json }
  } catch {
    // 刻意不綁定例外變數 —— 沒有變數可讀,就不可能不小心把引擎的英文訊息
    // 或 token 內容回顯到畫面上(T-04-16)。
    return null
  }
}

/**
 * 解碼整個 token。
 * 回傳形狀:
 *   { empty: true }                                    尚未輸入
 *   { ok: false }                                      格式不符
 *   { ok: true, header, payload, headerText, payloadText, signature }
 */
export function decodeJwt(token) {
  const source = typeof token === 'string' ? token.trim() : ''
  if (source === '') return { empty: true }

  const parts = source.split('.')
  // 少於兩段就不可能是 JWT。三段以上時,第三段之後一律當成簽章的一部分原樣保留
  // (JWE 是五段,本工具不處理它,但也不該把它整個吃掉)。
  if (parts.length < 2) return { ok: false }

  const header = decodeSegment(parts[0])
  const payload = decodeSegment(parts[1])
  if (!header || !payload) return { ok: false }

  return {
    ok: true,
    header: header.value,
    payload: payload.value,
    headerText: header.text,
    payloadText: payload.text,
    signature: parts.slice(2).join('.'),
  }
}

/** 把毫秒差距講成一句人話。刻意只講一個量級 —— 「還剩 3 天 4 小時 12 分」沒有更有用。 */
function formatSpan(ms) {
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return '不到 1 分鐘'
  if (minutes < 60) return `約 ${minutes} 分鐘`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `約 ${hours} 小時`
  return `約 ${Math.floor(hours / 24)} 天`
}

/** Unix 秒數 → 可讀的本地時間。用 24 小時制,避免 AM/PM 在中文介面上讀起來卡卡的。 */
function formatMoment(seconds) {
  const date = new Date(seconds * MS_PER_SECOND)
  return date.toLocaleString('zh-TW', { hour12: false })
}

/**
 * 掃描 payload 的三個時間相關宣告,換算成「原始秒數 + 可讀時間 + 狀態」。
 * 缺少的欄位不會出現在結果裡;三個都缺時回空陣列,畫面上顯示明確的說明而不是空白。
 * now 由呼叫端傳入,狀態文字因此隨每次輸入變更自然更新 —— D-06 要的是「隨輸入即時」,
 * 不是「隨時鐘即時」,所以這裡刻意不掛每秒重算的計時器。
 */
export function buildClaimRows(payload, now) {
  if (payload === null || typeof payload !== 'object') return []
  const rows = []

  for (const claim of TIME_CLAIMS) {
    if (!(claim.key in payload)) continue
    const raw = payload[claim.key]

    // 規格要求是數字。字串或其他型別一律照實說「不是有效的 Unix 秒數」,
    // 不硬轉型,也絕不讓 NaN 漏到畫面上變成 "Invalid Date"。
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      rows.push({
        key: claim.key,
        label: claim.label,
        raw: String(raw),
        moment: '—',
        status: '這個欄位不是有效的 Unix 秒數',
        expired: false,
      })
      continue
    }

    const ms = raw * MS_PER_SECOND
    const diff = ms - now
    let status = ''
    let expired = false

    if (claim.key === 'exp') {
      if (diff <= 0) {
        status = `已過期(${formatSpan(-diff)}前)`
        expired = true
      } else {
        status = `還剩 ${formatSpan(diff)}`
      }
    } else if (claim.key === 'nbf') {
      status = diff > 0 ? `尚未生效(還有 ${formatSpan(diff)})` : '已生效'
      expired = diff > 0
    } else {
      status = diff > 0 ? `簽發時間在未來(${formatSpan(diff)}後)` : `簽發於 ${formatSpan(-diff)}前`
    }

    rows.push({
      key: claim.key,
      label: claim.label,
      note: claim.note,
      raw: String(raw),
      moment: formatMoment(raw),
      status,
      expired,
    })
  }

  return rows
}

/**
 * D-11:範例由程式當場組出,絕不內嵌任何真實 token。
 * iat 取載入當下、exp 取載入當下加一小時 —— 這樣按下去就能看到「還剩 約 1 小時」,
 * 範例本身就是功能的證明。
 */
function buildExampleToken() {
  const nowSeconds = Math.floor(Date.now() / MS_PER_SECOND)
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = {
    sub: 'demo-user',
    name: '訪客',
    role: 'visitor',
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  }
  const encode = (obj) => toBase64Url(textToBase64(JSON.stringify(obj)))
  return `${encode(header)}.${encode(payload)}.${EXAMPLE_SIGNATURE}`
}

export default function JwtTool() {
  // D-07:只存在 React state,離開分頁即消失,不寫任何瀏覽器端儲存,也不進網址(D-27)。
  const [input, setInput] = useState('')
  const [showError, setShowError] = useState(false)
  const errorTimerRef = useRef(null)

  // D-06:onChange 直接觸發解碼,沒有「解碼」按鈕。
  const decoded = useMemo(() => decodeJwt(input), [input])
  const isEmpty = decoded.empty === true
  const hasFormatError = !isEmpty && decoded.ok !== true

  // 時間狀態與解碼結果一起算。now 在這裡取一次,整組宣告共用同一個時間基準,
  // 避免三列各自 Date.now() 產生毫秒級的不一致。
  const claimRows = useMemo(
    () => (decoded.ok ? buildClaimRows(decoded.payload, Date.now()) : []),
    [decoded]
  )

  useEffect(() => {
    clearTimeout(errorTimerRef.current)
    if (!hasFormatError) {
      setShowError(false)
      return undefined
    }
    errorTimerRef.current = setTimeout(() => setShowError(true), ERROR_DEBOUNCE_MS)
    // 卸載時清掉還沒觸發的 timer,避免對已卸載的元件 setState。
    return () => clearTimeout(errorTimerRef.current)
  }, [hasFormatError])

  // 防抖那 500ms 之內畫面上保留上一份成功的解碼結果,而不是先清空再變紅 ——
  // 清空等於用另一種閃爍換掉紅色閃爍。寫入值完全由本次 render 的 input 推導而來且冪等。
  const lastGoodRef = useRef(null)
  if (decoded.ok) lastGoodRef.current = { decoded, claimRows }
  else if (isEmpty) lastGoodRef.current = null

  const shown = decoded.ok ? { decoded, claimRows } : lastGoodRef.current

  const renderClaims = () => {
    if (shown.claimRows.length === 0) {
      return <p className="dt-empty">此 token 未包含時間相關宣告</p>
    }
    return (
      <ul className="dt-jwt-claims">
        {shown.claimRows.map((row) => (
          <li className="dt-jwt-claim" key={row.key}>
            <span className="dt-jwt-claim-name">
              {row.label}
              {row.note && <span className="dt-jwt-claim-key">{row.note}</span>}
            </span>
            <span className="dt-jwt-claim-moment">{row.moment}</span>
            <span className={`dt-jwt-claim-status${row.expired ? ' dt-jwt-claim-status--warn' : ''}`}>
              {row.status}
            </span>
            <span className="dt-jwt-claim-raw">{`原始值 ${row.raw}`}</span>
          </li>
        ))}
      </ul>
    )
  }

  const renderOutput = () => {
    if (isEmpty) return <p className="dt-empty">{EMPTY_HINT}</p>
    // 錯誤就地渲染在輸出面板內取代結果,不用 Toast、不用 modal、不用原生對話框。
    // 訊息只講「格式不對」這個類別,不回顯任何 token 內容(T-04-16)。
    if (showError) {
      return (
        <div className="dt-error-banner">
          <AlertCircle size={16} className="dt-error-icon" />
          <span>{FORMAT_ERROR}</span>
        </div>
      )
    }
    if (!shown) return <p className="dt-empty">{EMPTY_HINT}</p>

    return (
      <>
        <section className="dt-jwt-section">
          <h4 className="dt-jwt-section-title">HEADER</h4>
          <pre className="dt-code dt-jwt-output">{shown.decoded.headerText}</pre>
        </section>

        <section className="dt-jwt-section">
          <h4 className="dt-jwt-section-title">PAYLOAD</h4>
          <pre className="dt-code dt-jwt-output">{shown.decoded.payloadText}</pre>
        </section>

        <section className="dt-jwt-section">
          <h4 className="dt-jwt-section-title">時間相關宣告</h4>
          {renderClaims()}
        </section>

        <section className="dt-jwt-section">
          <h4 className="dt-jwt-section-title">
            簽章
            <span className="dt-jwt-badge">未驗證</span>
          </h4>
          {shown.decoded.signature ? (
            <pre className="dt-code dt-jwt-output dt-jwt-signature">{shown.decoded.signature}</pre>
          ) : (
            <p className="dt-empty">這組 token 沒有第三段(簽章)。</p>
          )}
        </section>
      </>
    )
  }

  return (
    <div className="dt-jwt-tool">
      <h3 className="dt-tool-heading">JWT 解碼</h3>
      {/* D-17:把「只解碼、不驗簽」寫在畫面上,訪客才不會以為驗簽失敗了。 */}
      <p className="dt-jwt-note">
        這個工具只把 header 與 payload 解開來看,不會驗證簽章,也不會向你要任何金鑰。
      </p>

      {/* D-04:DOM 順序為輸入在前、輸出在後,768px 以下自然塌成上下堆疊。 */}
      <div className="dt-layout-split">
        <div className="dt-jwt-pane">
          <textarea
            className={`dt-textarea${showError ? ' dt-textarea--error' : ''}`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            aria-label="JWT 輸入"
            placeholder="貼上一組 JWT(xxxxx.yyyyy.zzzzz)"
          />

          {/* 載入範例排最左(本階段唯一的 primary CTA),其餘沿用 ghost 家族。 */}
          <ToolActions>
            <ExampleButton onLoad={() => setInput(buildExampleToken())} />
            {shown && <CopyButton text={shown.decoded.payloadText} label="複製 payload" />}
            <ClearButton onClear={() => setInput('')} />
            <PasteButton onPaste={setInput} />
          </ToolActions>
        </div>

        <div className="dt-jwt-pane">{renderOutput()}</div>
      </div>
    </div>
  )
}

// 這個工具刻意沒有的東西,列在這裡避免日後被「補上」:
//   - 沒有金鑰輸入欄、沒有任何簽章驗證(D-17,這是使用者拍板的界線)
//   - 沒有「解碼」按鈕(D-06:即時運算)
//   - 沒有分享連結、沒有把 token 寫進網址(D-27 —— token 極可能是真的存取權杖)
//   - 沒有任何瀏覽器端的持久化儲存(D-07)
//   - 錯誤訊息不回顯任何 token 片段,也不寫進主控台
