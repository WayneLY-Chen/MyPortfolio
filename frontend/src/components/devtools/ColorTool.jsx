// 顏色格式轉換(FEAT-13)—— HEX / RGB / HSL 三組數值即時互相連動、色塊即時預覽,
// 外加一個原生取色器當最快的輸入路徑。全部在瀏覽器端完成,無任何對外通訊。
//
// Source: 04-CONTEXT.md D-16(三組數值連動 + 預覽色塊 + 原生 <input type="color">;
//         不做配色建議 / 互補色 / 色調盤 / 對比檢查 —— 四項皆在 Deferred Ideas 排除)、
//         D-03(無大段輸入的工具走 .dt-layout-compact 單欄緊湊版)、
//         D-06(即時運算,沒有「轉換」按鈕)、
//         04-UI-SPEC.md §Component Inventory 的 .dt-color-swatch(尺寸為逐字契約)與
//         Per-Tool Specification 顏色那列(**不是空狀態**:預先載入本站主色;無錯誤狀態)。
//
// ─────────────────────────────────────────────────────────────────────────────
// 【狀態架構:只有一個真實來源,請勿重構成三個獨立 state】
// ─────────────────────────────────────────────────────────────────────────────
// 這個元件的顏色只存在於一個地方 —— `rgb`,一組 0–255 的整數三元組。
// HEX 字串與 HSL 三元組**都不是 state**,它們是每次 render 由 `rgb` 現算出來的顯示值。
// 使用者編輯任何一組,流程一律是「先轉回 RGB → 更新 canonical → 另外兩組自然重算」。
//
// 為什麼要這麼堅持:HSL 是浮點數而 RGB 是整數,兩者之間每跨一次就有一次四捨五入。
// 若三組數值各自是可編輯又互相「同步」的獨立 state,誤差會在多次編輯後累積,而且方向
// 不可預測 —— 使用者把 #336699 改去 HSL 再改回來會拿到 #326698,沒有任何錯誤訊息,
// 只有顏色悄悄走掉。(04-RESEARCH.md Common Pitfalls #7,04-UI-SPEC.md 亦同此判斷。)
//
// 下方的 `drafts` **不是**第二個顏色來源。它只存「使用者此刻正在某個欄位裡打到一半的
// 字串」,純粹是文字輸入的顯示狀態:沒有它,使用者連把欄位清空重打都做不到(值會被
// 現算結果立刻覆寫回去)。欄位失焦即丟棄,顏色永遠只認 `rgb`。
//
// 所有 .dt-* 樣式都住在 DevToolsTab.jsx 的 scoped <style> 內(全工具箱共用一份樣式表)。
import { useState } from 'react'
import { ClearButton, CopyButton, ToolActions } from './DevToolsActions'
import {
  ACCENT_RGB,
  clampRgb,
  hexToRgb,
  hslToRgb,
  rgbToHex,
  rgbToHsl,
} from './colorConversion'

// RGB 三個分量的欄位定義。key 同時是 canonical state 的屬性名。
const RGB_FIELDS = [
  { key: 'r', label: 'R', max: 255 },
  { key: 'g', label: 'G', max: 255 },
  { key: 'b', label: 'B', max: 255 },
]

// HSL 三個分量。h 的上限是 360(色相環),s / l 是 100(百分比)。
const HSL_FIELDS = [
  { key: 'h', label: 'H', max: 360, unit: '°' },
  { key: 's', label: 'S', max: 100, unit: '%' },
  { key: 'l', label: 'L', max: 100, unit: '%' },
]

export default function ColorTool() {
  // ★ 唯一的顏色真實來源。初值為本站主色 —— 這個工具沒有空狀態(04-UI-SPEC.md)。
  const [rgb, setRgb] = useState(ACCENT_RGB)
  // 純文字輸入的暫存,與顏色無關。key 為欄位名(hex / r / g / b / h / s / l)。
  const [drafts, setDrafts] = useState({})

  // ── 以下三組全部是 derived,不進 state ──────────────────────────────────
  const hex = rgbToHex(rgb)
  const hslFloat = rgbToHsl(rgb.r, rgb.g, rgb.b)
  // 顯示用的整數 HSL。取整只發生在這裡 —— colorConversion.js 那一層保留完整浮點精度,
  // 往返才不會漂移。
  const hslDisplay = {
    h: Math.round(hslFloat.h),
    s: Math.round(hslFloat.s),
    l: Math.round(hslFloat.l),
  }

  // 欄位顯示值:正在打字就顯示使用者打的字,否則顯示由 canonical 現算的值。
  const shown = (key, derived) => (drafts[key] !== undefined ? drafts[key] : String(derived))
  const setDraft = (key, value) => setDrafts((prev) => ({ ...prev, [key]: value }))
  // 失焦即丟棄該欄位的暫存字串,欄位隨即貼回 canonical 算出來的值
  // (打到一半的 `#33` 會變回完整的 `#336699`,超界的 300 會變回 255)。
  const dropDraft = (key) =>
    setDrafts((prev) => {
      if (prev[key] === undefined) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })

  // 從取色器 / 清空這類「整組換掉」的路徑進來時,所有暫存字串一起作廢。
  const commitColor = (nextRgb) => {
    setRgb(clampRgb(nextRgb))
    setDrafts({})
  }

  // ── HEX ───────────────────────────────────────────────────────────────
  // 打到一半的字(`#33`)不是錯誤,只是「還沒生效」:canonical 保持不動,欄位維持
  // 使用者正在打的字。等它變成合法的 3 碼或 6 碼,顏色才跟上。
  // 04-UI-SPEC.md 明文:這個工具**沒有錯誤狀態** —— 不做紅框、不做錯誤橫幅。
  const handleHexChange = (value) => {
    setDraft('hex', value)
    const parsed = hexToRgb(value)
    if (parsed) setRgb(parsed)
  }

  // ── RGB ───────────────────────────────────────────────────────────────
  // 夾值即時發生在顏色上(打 300 色塊立刻是 255 的顏色),欄位則等失焦才貼回 255 ——
  // 若打字當下就把欄位改成 255,使用者連「3 → 30 → 300」都輸入不完。
  const handleRgbChange = (key, value) => {
    setDraft(key, value)
    if (value.trim() === '') return
    const n = Number(value)
    if (!Number.isFinite(n)) return
    setRgb(clampRgb({ ...rgb, [key]: n }))
  }

  // ── HSL ───────────────────────────────────────────────────────────────
  // 未被編輯的另外兩個分量,取的是**畫面上顯示的整數**而不是底層浮點值。這是刻意的:
  // 如此一來「送進 hslToRgb 的三元組」完全由螢幕上看得到的數字決定,同樣的三個數字
  // 永遠得到同一個 RGB。使用者把明度往上推一格再推回來,會精準回到原本那個顏色,
  // 而不是每來回一次就往旁邊挪一點。
  //
  // 已知且刻意接受的取捨:飽和度歸零(或明度歸 0 / 100)時,顏色本身就不帶色相資訊,
  // canonical 只存 RGB 便無從記得「歸零前是什麼色相」,再把飽和度拉回來會從 0° 開始。
  // 要避免這件事就得替 HSL 另存一份 state —— 那正是上面整段註解在防的漂移來源,
  // 兩者不可兼得,這裡選擇不漂移。
  const handleHslChange = (key, value) => {
    setDraft(key, value)
    if (value.trim() === '') return
    const n = Number(value)
    if (!Number.isFinite(n)) return
    const next = { ...hslDisplay, [key]: n }
    setRgb(clampRgb(hslToRgb(next.h, next.s, next.l)))
  }

  // 可直接貼進樣式表的三種寫法,也是三顆複製鈕各自的內容。
  const rgbText = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
  const hslText = `hsl(${hslDisplay.h}, ${hslDisplay.s}%, ${hslDisplay.l}%)`

  return (
    <div className="dt-layout-compact">
      <h3 className="dt-tool-heading">顏色格式轉換</h3>

      {/* T-04-25:色塊背景一律由 canonical RGB 經 rgbToHex 產生(輸出恆為六碼小寫),
          絕不把使用者原始輸入的字串直接放進 style。 */}
      <div
        className="dt-color-swatch"
        style={{ background: hex }}
        role="img"
        aria-label={`目前顏色預覽:${hex}`}
      />

      {/* D-16:原生取色器,緊鄰色塊 —— 這是最快的輸入路徑,不需要懂任何一種色碼寫法。 */}
      <div className="dt-color-picker-row">
        <label className="dt-field-label" htmlFor="dt-color-picker">
          取色器
        </label>
        <input
          id="dt-color-picker"
          className="dt-color-picker"
          type="color"
          value={hex}
          onChange={(e) => commitColor(hexToRgb(e.target.value) || ACCENT_RGB)}
        />
        <span className="dt-color-hint">點一下開啟系統取色器,三組數值會同步更新</span>
      </div>

      <div className="dt-color-field">
        <label className="dt-color-legend" htmlFor="dt-color-hex">
          HEX
        </label>
        <div className="dt-color-row">
          <input
            id="dt-color-hex"
            className="dt-color-text dt-code"
            type="text"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            value={shown('hex', hex)}
            onChange={(e) => handleHexChange(e.target.value)}
            onBlur={() => dropDraft('hex')}
          />
          <CopyButton text={hex} label="複製 HEX 色碼" compact />
        </div>
      </div>

      <div className="dt-color-field">
        <span className="dt-color-legend">RGB</span>
        <div className="dt-color-row">
          <div className="dt-color-triple">
            {RGB_FIELDS.map((field) => (
              <div key={field.key} className="dt-color-cell">
                <label className="dt-color-cell-label" htmlFor={`dt-color-${field.key}`}>
                  {field.label}
                </label>
                <input
                  id={`dt-color-${field.key}`}
                  className="dt-color-num dt-code"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={field.max}
                  value={shown(field.key, rgb[field.key])}
                  onChange={(e) => handleRgbChange(field.key, e.target.value)}
                  onBlur={() => dropDraft(field.key)}
                />
              </div>
            ))}
          </div>
          <CopyButton text={rgbText} label="複製 RGB 色碼" compact />
        </div>
      </div>

      <div className="dt-color-field">
        <span className="dt-color-legend">HSL</span>
        <div className="dt-color-row">
          <div className="dt-color-triple">
            {HSL_FIELDS.map((field) => (
              <div key={field.key} className="dt-color-cell">
                <label className="dt-color-cell-label" htmlFor={`dt-color-${field.key}`}>
                  {`${field.label} ${field.unit}`}
                </label>
                <input
                  id={`dt-color-${field.key}`}
                  className="dt-color-num dt-code"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={field.max}
                  value={shown(field.key, hslDisplay[field.key])}
                  onChange={(e) => handleHslChange(field.key, e.target.value)}
                  onBlur={() => dropDraft(field.key)}
                />
              </div>
            ))}
          </div>
          <CopyButton text={hslText} label="複製 HSL 色碼" compact />
        </div>
      </div>

      {/* 不放「載入範例」—— 預先載入的主色本身就是範例(04-UI-SPEC.md)。
          也不放「貼上」—— 這個工具沒有大段文字輸入。
          「清空」在這裡的意思是還原成預設的主色,不是清成空白:本工具沒有空狀態。 */}
      <ToolActions>
        <CopyButton text={hex} label="複製 HEX 色碼" />
        <ClearButton onClear={() => commitColor(ACCENT_RGB)} />
      </ToolActions>
    </div>
  )
}
