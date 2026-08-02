// 開發者工具箱容器(FEAT-14)—— 功能頁「工具箱」分頁的單一入口。
// Source: 04-CONTEXT.md D-01(收成一顆頂層分頁,內層以 chip 列切換)、
//         D-05(chip 列橫向捲動 + 右緣漸層 + 選中項自動捲入)、
//         D-08(容器層級常駐隱私聲明)、04-UI-SPEC.md(以下 CSS 值為逐字契約)。
//
// 這個容器同時是全工具箱的樣式表持有者:七個工具共用的 .dt-* 樣式一律寫在這裡的
// scoped <style> 內(比照 TypingRace.jsx:436 的做法),各工具元件不再各開一份 style。
//
// 本目錄的硬性邊界(FEAT-14 / D-07 / D-09 / D-27):
//   1. 不得對外發出任何形式的網路通訊,也不得引入後端設定模組。
//   2. 不得使用任何瀏覽器端的持久化儲存機制。
//   3. 使用者輸入不得寫進網址(路徑、查詢字串、片段皆禁止)。
import { useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import UuidTool from './UuidTool'

// D-01:工具註冊表。順序固定為 FEAT-07~13(json / jwt / base64 / regex / uuid / hash / color)。
// 註冊表有幾筆,chip 列就渲染幾顆 —— 絕不允許出現「點了沒有東西」的空殼 chip。
// 後續每個工具各自把自己那筆插進正確的 FEAT 位置。
const TOOLS = [
  { id: 'uuid', label: 'UUID 產生', Component: UuidTool },
]

export default function DevToolsTab() {
  // D-07:連「上次停在哪個工具」都不記,初值一律取註冊表第一筆。
  const [activeSubTab, setActiveSubTab] = useState(TOOLS[0].id)
  const chipRefs = useRef({})

  // D-05:沿用全站唯一既有寫法(Footer.jsx:5 / TypingRace.jsx:92-96)—— 一次性讀取,
  // 不訂閱 change 事件。全站無全域 CSS 層級的動態偏好規則可依賴。
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // D-05:切換時把選中的 chip 捲進可見範圍。只在使用者點擊時觸發,不在掛載時觸發,
  // 避免初次進入分頁就動到捲動位置。
  const handleSelect = (id) => {
    setActiveSubTab(id)
    chipRefs.current[id]?.scrollIntoView({
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }

  const ActiveTool = TOOLS.find((tool) => tool.id === activeSubTab)?.Component

  return (
    <div className="dt-toolbox">
      <style>{`
        .dt-toolbox {
          --dt-font-mono: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
          width: 100%;
          font-family: var(--font-sans);
        }

        /* D-08:隱私聲明橫幅 —— 常駐於容器頂部,不隨子分頁切換而消失,亦無關閉鈕
           (D-07 不允許記住「已關閉」狀態)。 */
        .dt-privacy-banner {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          margin-bottom: 16px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-left: 3px solid var(--accent);
          border-radius: 6px;
          color: var(--muted);
          font-size: 13px;
          line-height: 1.5;
        }
        .dt-privacy-banner strong { color: var(--fg); font-weight: 700; }
        .dt-privacy-icon { flex-shrink: 0; color: var(--accent); }

        /* D-05:chip 列。外層負責右緣漸層提示(無條件渲染,不做 JS 捲動偵測),
           內層負責橫向捲動。明文排除下拉選單與自動換行排多行。 */
        .dt-chip-row-wrap { position: relative; }
        .dt-chip-row-wrap::after {
          content: '';
          position: absolute;
          top: 0; right: 0; bottom: 0;
          width: 32px;
          background: linear-gradient(to right, transparent, var(--bg) 80%);
          pointer-events: none;
        }
        .dt-chip-row {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .dt-chip-row::-webkit-scrollbar { display: none; }

        /* 視覺值逐字取自已上線的 .typing-mode-btn(TypingRace.jsx:452-468),
           padding 10px 24px 是刻意對齊,不得「修正」成 8px 或 12px。 */
        .dt-chip {
          padding: 10px 24px;
          background: none;
          border: 1px solid var(--border);
          color: var(--muted);
          cursor: pointer;
          font-family: var(--font-sans);
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          border-radius: 4px;
          white-space: nowrap;
          flex-shrink: 0;
          transition: border-color 0.2s, color 0.2s;
        }
        .dt-chip:hover { border-color: var(--accent); color: var(--fg); }
        .dt-chip--active { border-color: var(--accent); color: var(--accent); }

        .dt-tool-panel { margin-top: 24px; width: 100%; }

        .dt-tool-heading {
          font-size: 18px;
          font-weight: 700;
          line-height: 1.3;
          color: var(--fg);
          margin: 0;
        }

        .dt-code {
          font-family: var(--dt-font-mono);
          font-size: 13px;
          font-weight: 400;
          line-height: 1.5;
        }

        .dt-layout-compact {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
          max-width: 640px;
          margin: 0 auto;
        }

        /* D-10:四顆便利按鈕的共用 ghost 家族。.dt-btn 是唯一的值來源,
           .dt-copy-btn / .dt-paste-btn / .dt-clear-btn 只保留語意,不重複宣告視覺值,
           避免七個工具各自漂移出不同的按鈕。 */
        .dt-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }
        .dt-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 8px 14px;
          background: none;
          border: 1px solid var(--border);
          border-radius: 4px;
          color: var(--muted);
          cursor: pointer;
          font-family: var(--font-sans);
          font-size: 13px;
          font-weight: 700;
          line-height: 1.2;
          transition: border-color 0.2s, color 0.2s;
        }
        .dt-btn:hover { border-color: var(--accent); color: var(--fg); }
        .dt-btn--icon { padding: 6px; gap: 0; }

        /* 唯一一顆 primary CTA:idle 就吃 accent,其餘三顆只在 hover 才吃。 */
        .dt-example-btn {
          border-color: var(--accent);
          color: var(--accent);
        }
        .dt-example-btn:hover { border-color: var(--accent); color: var(--fg); }

        .dt-uuid-controls {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
        }
        .dt-field-label {
          font-size: 13px;
          font-weight: 700;
          line-height: 1.2;
          color: var(--muted);
        }
        .dt-count-input {
          width: 80px;
          padding: 8px 10px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 4px;
          color: var(--fg);
          font-family: var(--dt-font-mono);
          font-size: 13px;
          outline: none;
        }
        .dt-count-input:focus { border-color: var(--accent); outline: 1px solid var(--accent); }

        .dt-uuid-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .dt-uuid-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 12px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--fg);
        }
        .dt-uuid-item .dt-code {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>

      <div className="dt-privacy-banner">
        <ShieldCheck size={16} className="dt-privacy-icon" />
        <span>
          <strong>所有運算都在你的瀏覽器完成,輸入內容不會離開這台電腦</strong>
          {' —— 按 F12 打開 Network 面板,自己驗證看看。'}
        </span>
      </div>

      <div className="dt-chip-row-wrap">
        <div className="dt-chip-row" role="tablist" aria-label="開發者工具">
          {TOOLS.map((tool) => (
            <button
              key={tool.id}
              ref={(el) => { chipRefs.current[tool.id] = el }}
              type="button"
              role="tab"
              aria-selected={activeSubTab === tool.id}
              className={`dt-chip ${activeSubTab === tool.id ? 'dt-chip--active' : ''}`}
              onClick={() => handleSelect(tool.id)}
            >
              {tool.label}
            </button>
          ))}
        </div>
      </div>

      <div className="dt-tool-panel">
        {ActiveTool && <ActiveTool />}
      </div>
    </div>
  )
}
