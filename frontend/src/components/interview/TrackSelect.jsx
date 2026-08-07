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

// 標題與說明逐字取自 05-UI-SPEC.md 的「開場畫面」表,不得改寫。
// id 必須落在 interviewReducer 的 TRACKS 白名單內 —— 新鮮人那一軌是 `fresher`,
// 不是 newgrad(後端只認 fresher,送錯會吃 400 INVALID_INPUT)。
const TRACK_CARDS = [
  { id: 'frontend', title: '前端工程師', description: '版面、效能與瀏覽器行為的臨場判斷' },
  { id: 'backend', title: '後端工程師', description: 'API 設計、併發與快取的取捨' },
  { id: 'fullstack', title: '全端工程師', description: '前後端邊界的整合判斷' },
  { id: 'fresher', title: '新鮮人軟體工程師', description: '基礎觀念與除錯思路' },
]

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
  return (
    <div className="iv-setup">
      <h2 className="iv-display-title">模擬面試官</h2>
      <p className="iv-setup-subtitle">選一個方向,五題結束後給你具體的改進建議。</p>

      {/* 卡片一律用 <button> 而不是掛 onClick 的 <div>:鍵盤 Tab 得到、Enter/Space 按得下、
          螢幕閱讀器唸得出「按鈕、已按下」。選中狀態走 aria-pressed 而非只有顏色。 */}
      <div className="iv-track-grid" role="group" aria-label="選擇面試方向">
        {TRACK_CARDS.map((card) => {
          const selected = track === card.id
          return (
            <button
              key={card.id}
              type="button"
              aria-pressed={selected}
              className={`iv-track-card ${selected ? 'iv-track-card--selected' : ''}`}
              onClick={() => onSelectTrack(card.id)}
            >
              <span className="iv-track-card-title">{card.title}</span>
              <span className="iv-track-card-desc">{card.description}</span>
            </button>
          )
        })}
      </div>

      <div className="iv-setup-footer">
        <div className="iv-segmented" role="group" aria-label="面試語言">
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
          開始面試
        </button>
      </div>
    </div>
  )
}

// 清單內容是契約的一部分(逐字文案 + 後端白名單代碼),另外具名匯出讓驗收/測試
// 不必去 JSX 裡撈字串。
export { TRACK_CARDS }
