// UUID 產生器(FEAT-11)—— 全部運算在瀏覽器端完成,無任何對外通訊。
// Source: 04-CONTEXT.md D-15(採用瀏覽器原生 crypto.randomUUID)、
//         04-UI-SPEC.md §Per-Tool Specification(預設 5 組、單欄緊湊版型)。
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { CopyButton } from './DevToolsActions'

// D-15:預設一掛載就產生 5 組,刻意不是空狀態 —— 打開即有成果是這個工具的全部價值。
const DEFAULT_COUNT = 5
// 上限 50 是刻意的天花板:再多的話,渲染成本與可掃視性都會劣化,而這個工具的價值
// 就在於「快速、一眼看完」。
const MIN_COUNT = 1
const MAX_COUNT = 50

// D-15:直接用原生 crypto.randomUUID(),不自己拼湊隨機字串、不引入任何套件。
function generateUuids(count) {
  return Array.from({ length: count }, () => crypto.randomUUID())
}

// 超出範圍即夾回 1–50;空字串或非數字一律回到預設值。
function clampCount(raw) {
  const parsed = Math.floor(Number(raw))
  if (!Number.isFinite(parsed)) return DEFAULT_COUNT
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, parsed))
}

export default function UuidTool() {
  // D-07:只存在 React state,離開分頁即消失,不做任何瀏覽器端持久化。
  const [uuids, setUuids] = useState(() => generateUuids(DEFAULT_COUNT))
  // 輸入過程允許暫時是空字串,夾值發生在失焦與按下「重新產生」時。
  const [countInput, setCountInput] = useState(String(DEFAULT_COUNT))

  const commitCount = () => {
    const next = clampCount(countInput)
    setCountInput(String(next))
    return next
  }

  // 重新產生為「整份取代」而非追加 —— 不會出現無上限累積的狀態。
  const handleRegenerate = () => {
    setUuids(generateUuids(commitCount()))
  }

  return (
    <div className="dt-layout-compact">
      <h3 className="dt-tool-heading">UUID 產生器</h3>

      {/* 這個工具沒有錯誤路徑,也不需要「載入範例」—— 產生出來的清單本身就是即時成果。 */}
      <div className="dt-uuid-controls">
        <label className="dt-field-label" htmlFor="dt-uuid-count">
          產生筆數
        </label>
        <input
          id="dt-uuid-count"
          className="dt-count-input"
          type="number"
          min={MIN_COUNT}
          max={MAX_COUNT}
          value={countInput}
          onChange={(e) => setCountInput(e.target.value)}
          onBlur={commitCount}
        />
        <button type="button" className="dt-btn" onClick={handleRegenerate}>
          <RefreshCw size={14} />
          <span>重新產生</span>
        </button>
      </div>

      <ul className="dt-uuid-list">
        {uuids.map((value, index) => (
          <li key={value} className="dt-uuid-item">
            <span className="dt-code">{value}</span>
            <CopyButton text={value} label={`複製第 ${index + 1} 組 UUID`} compact />
          </li>
        ))}
      </ul>
    </div>
  )
}
