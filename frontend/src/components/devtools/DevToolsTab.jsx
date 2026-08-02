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
import Base64Tool from './Base64Tool'
import HashTool from './HashTool'
import JsonTool from './JsonTool'
import JwtTool from './JwtTool'
import UuidTool from './UuidTool'

// D-01:工具註冊表。順序固定為 FEAT-07~13(json / jwt / base64 / regex / uuid / hash / color)。
// 註冊表有幾筆,chip 列就渲染幾顆 —— 絕不允許出現「點了沒有東西」的空殼 chip。
// 後續每個工具各自把自己那筆插進正確的 FEAT 位置。
const TOOLS = [
  { id: 'json', label: 'JSON 格式化', Component: JsonTool },
  { id: 'jwt', label: 'JWT 解碼', Component: JwtTool },
  { id: 'base64', label: 'Base64 轉換', Component: Base64Tool },
  { id: 'uuid', label: 'UUID 產生', Component: UuidTool },
  { id: 'hash', label: '雜湊計算', Component: HashTool },
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

        /* D-03 / D-04:兩種版型家族。JSON / JWT / Base64 / 正則走兩欄,
           UUID / 雜湊 / 顏色走單欄緊湊。這裡只交付樣式,套用由各工具自行決定。 */
        .dt-layout-split {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 24px;
          align-items: start;
          width: 100%;
        }
        .dt-layout-compact {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
          max-width: 640px;
          margin: 0 auto;
        }

        /* 共用大型輸入 / 輸出區。後續工具直接套用,不得各自重新定義這些值。 */
        .dt-textarea {
          width: 100%;
          min-height: 200px;
          padding: 12px 14px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--fg);
          font-family: var(--dt-font-mono);
          font-size: 13px;
          line-height: 1.5;
          outline: none;
          resize: vertical;
        }
        .dt-textarea:focus { border-color: var(--accent); outline: 1px solid var(--accent); }
        .dt-textarea--error { border-color: #ef4444; }

        /* 字數 / 位元組計數器,超限轉紅(D-25 的上限提示沿用這個位置與語彙)。 */
        .dt-counter {
          align-self: flex-end;
          font-size: 12px;
          color: var(--muted);
        }
        .dt-counter--over { color: #ef4444; }

        /* 可解析失敗的工具共用同一種錯誤呈現:就地渲染在輸出區內,
           取代原本的結果內容,不用彈窗、不用系統對話框。 */
        .dt-error-banner {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 10px 12px;
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.35);
          border-left: 3px solid #ef4444;
          border-radius: 6px;
          color: var(--fg);
          font-size: 14px;
          line-height: 1.5;
        }
        .dt-error-icon { color: #ef4444; flex-shrink: 0; }

        .dt-empty {
          color: var(--muted);
          font-size: 14px;
          line-height: 1.5;
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

        /* ── FEAT-07 JSON 工具專屬 ── 只追加,不改動上方任何共用值。 */
        .dt-json-tool {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
        }
        /* min-width: 0 讓兩欄的 minmax(0, 1fr) 真的生效 —— 沒有它,一長串沒有空白的
           JSON 會把自己那一欄撐爆。 */
        .dt-json-pane {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
        }
        /* D-22:行號槽。與 textarea 併排,行高與內距必須逐項對齊,否則整片行號會歪掉:
           font-size 13px + line-height 1.5 + padding-top 12px 三個值都取自 .dt-textarea。
           自己不捲動(overflow: hidden),捲動位置由 JS 跟著 textarea 同步。 */
        .dt-json-input-row {
          display: flex;
          align-items: stretch;
          min-width: 0;
        }
        .dt-line-gutter {
          flex-shrink: 0;
          overflow: hidden;
          min-width: 44px;
          padding: 12px 8px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-right: none;
          border-radius: 8px 0 0 8px;
          color: var(--muted);
          font-family: var(--dt-font-mono);
          font-size: 13px;
          line-height: 1.5;
          text-align: right;
          user-select: none;
          /* 刻意不加 transition —— .dt-textarea 的 focus 邊框是瞬間變色的,
             這半邊如果做漸變,兩半會不同步。順帶也不必再處理減少動態偏好。 */
        }
        .dt-gutter-seg {
          margin: 0;
          font: inherit;
          white-space: pre;
        }
        /* 出錯的那一行:紅底 + 紅字 + 粗體。因為是 block 元素,紅底會鋪滿整個行號槽
           的寬度,而不是只包住那幾個數字。 */
        .dt-gutter-seg--error {
          background: rgba(239, 68, 68, 0.18);
          color: #ef4444;
          font-weight: 700;
        }
        /* 行號槽與 textarea 是同一個輸入框的兩半,邊框狀態必須一起變,
           否則聚焦時會出現「三邊金色、左邊灰色」的破圖。 */
        .dt-json-input-row:focus-within .dt-line-gutter { border-color: var(--accent); }
        .dt-json-input-row--error .dt-line-gutter { border-color: #ef4444; }
        .dt-json-textarea { border-radius: 0 8px 8px 0; }

        .dt-json-output {
          margin: 0;
          padding: 12px 14px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--fg);
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          overflow-y: auto;
          max-height: 480px;
        }

        /* ── FEAT-08 JWT 工具專屬 ── 只追加,不改動上方任何共用值。 */
        .dt-jwt-tool {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
        }
        /* min-width: 0 讓兩欄的 minmax(0, 1fr) 真的生效 —— 沒有它,一長串沒有空白的
           token 會把自己那一欄撐爆。 */
        .dt-jwt-pane {
          display: flex;
          flex-direction: column;
          gap: 16px;
          min-width: 0;
        }
        /* D-17 的界線寫在畫面上,免得訪客以為驗簽壞掉了。 */
        .dt-jwt-note {
          margin: 0;
          color: var(--muted);
          font-size: 14px;
          line-height: 1.5;
        }
        .dt-jwt-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
        }
        .dt-jwt-section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0;
          color: var(--muted);
          font-size: 13px;
          font-weight: 700;
          line-height: 1.2;
          letter-spacing: 0.1em;
        }
        /* 「未驗證」標記 —— 用中性的邊框而不是紅色:沒驗簽是這個工具的設計,不是錯誤狀態。 */
        .dt-jwt-badge {
          padding: 2px 8px;
          border: 1px solid var(--border);
          border-radius: 999px;
          color: var(--muted);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0;
        }
        /* header / payload / 簽章都是一長串可能沒有空白的字元,overflow-wrap 是必要的。 */
        .dt-jwt-output {
          margin: 0;
          padding: 12px 14px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--fg);
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          overflow-y: auto;
          max-height: 320px;
        }
        .dt-jwt-signature { color: var(--muted); max-height: 140px; }

        .dt-jwt-claims {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .dt-jwt-claim {
          display: grid;
          grid-template-columns: minmax(0, auto) minmax(0, 1fr);
          gap: 4px 12px;
          padding: 10px 12px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 13px;
          line-height: 1.5;
        }
        .dt-jwt-claim-name {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--fg);
          font-weight: 700;
        }
        .dt-jwt-claim-key {
          color: var(--muted);
          font-family: var(--dt-font-mono);
          font-size: 12px;
          font-weight: 400;
        }
        .dt-jwt-claim-moment {
          color: var(--fg);
          font-family: var(--dt-font-mono);
          overflow-wrap: anywhere;
        }
        .dt-jwt-claim-status { color: var(--muted); }
        /* 已過期 / 尚未生效走警示色 —— 這兩種狀態是使用者打開這個工具最想知道的事。 */
        .dt-jwt-claim-status--warn { color: #ef4444; font-weight: 700; }
        .dt-jwt-claim-raw {
          color: var(--muted);
          font-family: var(--dt-font-mono);
          font-size: 12px;
        }

        /* ── FEAT-09 Base64 工具專屬 ── 只追加,不改動上方任何共用值。 */
        .dt-base64-tool {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
        }
        /* min-width: 0 讓兩欄的 minmax(0, 1fr) 真的生效 —— 沒有它,一長串沒有空白的
           Base64 會把自己那一欄撐爆。 */
        .dt-base64-pane {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
        }
        .dt-mode-toggle { display: flex; gap: 8px; }
        /* 模式切換沿用 chip 家族,只縮一號 —— 它跟上方的工具 chip 是同一種控制項,
           不該長成第三種樣子。@media 的 44px 觸控下限由 .dt-chip 一併涵蓋。 */
        .dt-chip--sm {
          padding: 6px 14px;
          font-size: 12px;
          letter-spacing: 0.08em;
        }

        /* 拖放區。虛線邊框是 04-UI-SPEC.md 鎖定的值,也是「這裡可以丟東西進來」
           的唯一視覺線索,只在檔案模式渲染。
           min-height 200px 與 .dt-textarea 對齊,並且刻意不在 ≤768px 縮小 ——
           它是這個工具在手機上唯一的點擊目標,遠高於 44px 的觸控下限才夠好按。 */
        .dt-dropzone {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          min-height: 200px;
          padding: 24px;
          background: var(--surface);
          border: 1px dashed var(--border);
          border-radius: 8px;
          color: var(--muted);
          cursor: pointer;
          font-family: var(--font-sans);
          font-size: 14px;
          line-height: 1.5;
          text-align: center;
          transition: border-color 0.2s, color 0.2s, background-color 0.2s;
        }
        .dt-dropzone:hover { border-color: var(--accent); color: var(--fg); }
        .dt-dropzone:focus-visible { border-color: var(--accent); outline: 1px solid var(--accent); }
        /* 拖曳進入時的狀態改由 class 切換,不用 JS 直接改 style。 */
        .dt-dropzone--over {
          border-color: var(--accent);
          color: var(--fg);
          background: rgba(200, 148, 42, 0.08);
        }
        .dt-dropzone-icon { color: var(--accent); }
        .dt-dropzone-hint { font-size: 12px; color: var(--muted); }
        /* 原生檔案選擇器由拖放區代為觸發,自己不出現在畫面上,
           但仍留在 DOM 內(display: none 會讓部分瀏覽器忽略程式觸發的點擊)。 */
        .dt-file-input {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        .dt-file-preview {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 0;
        }
        .dt-file-img {
          max-width: 100%;
          max-height: 220px;
          align-self: flex-start;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 6px;
          object-fit: contain;
        }
        .dt-file-meta {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 13px;
          line-height: 1.5;
          color: var(--muted);
          overflow-wrap: anywhere;
        }
        .dt-file-meta strong { color: var(--fg); font-weight: 700; margin-right: 8px; }
        /* data URI 是一長串沒有空白的字元,一定要 overflow-wrap 才不會撐破欄位。 */
        .dt-base64-output {
          margin: 0;
          padding: 12px 14px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          color: var(--fg);
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          overflow-y: auto;
          max-height: 240px;
        }

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

        /* ── FEAT-12 雜湊工具專屬 ── 只追加,不改動上方任何共用值。 */
        .dt-hash-tool {
          display: flex;
          flex-direction: column;
          gap: 16px;
          width: 100%;
        }
        /* 這個工具的輸入通常只有一兩行,不需要 .dt-textarea 預設的 200px 高度 ——
           把五列結果擠出畫面反而不好用。 */
        .dt-hash-input { min-height: 120px; }

        .dt-hash-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        /* 演算法名稱 / 雜湊值 / 複製鈕三欄。第三欄固定寬,值算出來前後不會位移。
           MD5 的說明文字另起一列,橫跨值與按鈕兩欄。 */
        .dt-hash-row {
          display: grid;
          grid-template-columns: 76px minmax(0, 1fr) auto;
          align-items: center;
          gap: 4px 12px;
          padding: 10px 12px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 6px;
        }
        .dt-hash-name {
          color: var(--muted);
          font-size: 13px;
          font-weight: 700;
          line-height: 1.2;
          letter-spacing: 0.05em;
        }
        /* 過長的值(SHA-512 是 128 個字元)以省略號截斷,完整值一律靠複製鈕取得。 */
        .dt-hash-value {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--fg);
        }
        /* 破折號與三點都是「還沒有值」的狀態,用次要色與其他四列的實際值區分開。 */
        .dt-hash-value--idle { color: var(--muted); }
        /* 值還沒算出來時佔住複製鈕的位置,避免五列在結果陸續回來時左右跳動。 */
        .dt-hash-spacer { display: block; width: 26px; height: 26px; }
        .dt-hash-caption {
          grid-column: 2 / -1;
          color: var(--muted);
          font-size: 11px;
          line-height: 1.4;
        }
        @media (max-width: 480px) {
          /* 窄螢幕上演算法名稱自己佔一列,雜湊值才有足夠寬度可讀。 */
          .dt-hash-row { grid-template-columns: minmax(0, 1fr) auto; }
          .dt-hash-name { grid-column: 1 / -1; }
          .dt-hash-caption { grid-column: 1 / -1; }
          .dt-hash-spacer { width: 44px; height: 44px; }
        }

        /* 行動裝置基線:斷點沿用全站慣例(768px 主、480px 次),
           44px 是全站既有的觸控目標下限(TypingRace.jsx:810-811)。 */
        @media (max-width: 768px) {
          .dt-layout-split { grid-template-columns: 1fr; gap: 16px; }
          .dt-chip { min-height: 44px; }
          .dt-btn { min-height: 44px; }
          .dt-btn--icon { min-width: 44px; justify-content: center; }
        }

        /* 動態偏好降級。JS 層的 scrollIntoView behavior 已於上方以三元式處理,
           這裡負責 CSS 層 —— 兩層都要做,全站無全域規則可依賴。 */
        @media (prefers-reduced-motion: reduce) {
          .dt-chip { transition: none; }
          .dt-btn { transition: none; }
          .dt-dropzone { transition: none; }
          .dt-chip-row { scroll-behavior: auto; }
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
