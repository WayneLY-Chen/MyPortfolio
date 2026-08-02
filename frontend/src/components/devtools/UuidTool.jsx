// UUID 產生器(FEAT-11)—— 全部運算在瀏覽器端完成,無任何對外通訊。
// Source: 04-CONTEXT.md D-15(採用瀏覽器原生 crypto.randomUUID)、
//         04-UI-SPEC.md §Per-Tool Specification(預設 5 組、單欄緊湊版型)。
import { useState } from 'react'

// D-15:預設一掛載就產生 5 組,刻意不是空狀態 —— 打開即有成果是這個工具的全部價值。
const DEFAULT_COUNT = 5

// D-15:直接用原生 crypto.randomUUID(),不自己拼湊隨機字串、不引入任何套件。
function generateUuids(count) {
  return Array.from({ length: count }, () => crypto.randomUUID())
}

export default function UuidTool() {
  // D-07:只存在 React state,離開分頁即消失,不做任何瀏覽器端持久化。
  const [uuids] = useState(() => generateUuids(DEFAULT_COUNT))

  return (
    <div className="dt-layout-compact">
      <h3 className="dt-tool-heading">UUID 產生器</h3>
      <ul className="dt-uuid-list">
        {uuids.map((value) => (
          <li key={value} className="dt-uuid-item">
            <span className="dt-code">{value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
