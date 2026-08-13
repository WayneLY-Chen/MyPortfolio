// 開場畫面(D-26)—— 一頁看完的卡片選單:四張職缺卡 + 中英切換 + 一顆開始鍵。
//
// 刻意不做多步驟引導(選方向 → 下一步 → 選語言 → 下一步)。訪客是來看作品集的,
// 每多一次「下一步」就多一次離開的機會;四張卡加一個切換一次看完,選完就開始。
//
// D-01:四個方向是固定清單,**不接受自由輸入**。不要加「其他」或任何文字輸入框 ——
// 那會把 prompt injection 與內容驗證的負擔重新引進來,而目前後端的白名單
// (backend/src/interview/prompts.js)正是靠這份固定清單才擋得乾淨。
//
// 這個檔案不含任何 <style>:全部 .iv-* 樣式集中在 InterviewTab.jsx(比照
// components/devtools/* 與 DevToolsTab.jsx 的分工)。

import { strings } from './interviewStrings'

// 卡片文案改由 interviewStrings 依語言提供 —— 選了 English 之後整個介面都要跟著換,
// 只換題目而卡片留中文,使用者會以為切換沒生效。中文那一欄的字逐字沿用
// 05-UI-SPEC.md 的「開場畫面」表,一個字都沒改。
//
// id 必須落在 interviewReducer 的 TRACKS 白名單內 —— 新鮮人那一軌是 `fresher`,
// 不是 newgrad(後端只認 fresher,送錯會吃 400 INVALID_INPUT)。
const TRACK_IDS = ['frontend', 'backend', 'fullstack', 'fresher']

// 二選一的 segmented control。預設選中「中文」由 INITIAL_STATE.language = 'zh' 提供,
// 所以語言永遠有值,不會擋住開始鍵 —— 唯一會擋的是「還沒選方向」。
const LANGUAGE_OPTIONS = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
]

export default function TrackSelect({
  track,
  language,
  onSelectTrack,
  onSelectLanguage,
  onStart,
  canStart,
}) {
  const t = strings(language)

  return (
    <div className="iv-setup">
      <h2 className="iv-display-title">{t.setupTitle}</h2>
      <p className="iv-setup-subtitle">{t.setupSubtitle}</p>

      {/* 卡片一律用 <button> 而不是掛 onClick 的 <div>:鍵盤 Tab 得到、Enter/Space 按得下、
          螢幕閱讀器唸得出「按鈕、已按下」。選中狀態走 aria-pressed 而非只有顏色。 */}
      <div className="iv-track-grid" role="group" aria-label={t.trackGroupLabel}>
        {TRACK_IDS.map((id) => {
          const card = t.tracks[id]
          const selected = track === id
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              className={`iv-track-card ${selected ? 'iv-track-card--selected' : ''}`}
              onClick={() => onSelectTrack(id)}
            >
              <span className="iv-track-card-title">{card.title}</span>
              <span className="iv-track-card-desc">{card.description}</span>
            </button>
          )
        })}
      </div>

      <div className="iv-setup-footer">
        <div className="iv-segmented" role="group" aria-label={t.languageGroupLabel}>
          {LANGUAGE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={language === option.id}
              className={`iv-segmented-btn ${language === option.id ? 'iv-segmented-btn--active' : ''}`}
              onClick={() => onSelectLanguage(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* D-14:按下去的這一下,就是瀏覽器 autoplay policy 需要的使用者互動 ——
            之後每題進場自動播放才不會被擋。 */}
        <button
          type="button"
          className="iv-primary-btn"
          disabled={!canStart}
          onClick={onStart}
        >
          {t.startButton}
        </button>
      </div>
    </div>
  )
}

// 後端白名單代碼是契約的一部分,具名匯出讓驗收/測試不必去 JSX 裡撈。
// (文案本身已移到 interviewStrings.js,依語言取。)
export { TRACK_IDS }
