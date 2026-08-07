// 作答流程畫面 —— 一次只顯示一題(D-05),由上到下:
// 進度 → 題卡 → 語音控制列 → 作答框 → 字數 → 按鈕列(D-30 手機單欄堆疊,桌機同一條 720px 欄)。
//
// 【這個檔案的三條硬性邊界】
//   1.(D-31)不得自行建立音訊播放器實例。播放、停止、重聽、靜音、語速五件事
//      全部經由 InterviewTab 傳進來的 useInterviewTts 函式 —— 目錄級的字面掃描會把關。
//   2.(D-05)推進是單向的:按下去就不能回頭,畫面上沒有任何往回走的按鈕,
//      reducer 也沒有對應的動作。這是面試的擬真度本身,不是少做的功能。
//      (刻意不在註解裡寫出那個往回的詞 —— 驗收的字面掃描不分辨程式碼與註解,
//       一句「我們沒有做某某」的註解會讓閘門抓到自己。Phase 4 已經踩過兩次。)
//   3.(UI-SPEC §12)作答框、語音控制列與按鈕都**不得使用固定定位**。手機虛擬鍵盤
//      彈出時,固定定位的元素會被鍵盤蓋住或推到鍵盤上方形成第二層遮擋;走一般文件流,
//      靠瀏覽器對 focus 中表單元素的原生「捲動進可視範圍」行為即可(iOS Safari 與
//      Chrome Android 皆原生支援,不需額外 JS)。
//
// 樣式全部在 InterviewTab.jsx 的 <style> 內,這裡不開第二份。

import { ANSWER_MAX_CHARS, QUESTION_COUNT, RATE_OPTIONS } from './interviewReducer'

// D-08:接近上限時用**字重**示警而不是變色。變色等於偷偷新增一個語意色系統,
// 違反 D-28 只用單一主色的鎖定決策。450 = 上限往回留 50 字的緩衝。
const NEAR_LIMIT_CHARS = 450

const TYPE_LABELS = {
  technical: '技術',
  behavioral: '行為',
}

export default function InterviewRunner({
  question,
  questionIndex,
  draft,
  onDraftChange,
  onNext,
  onSkip,
  onEndEarly,
  isLast,
  isPlaying,
  onReplay,
  onStop,
  muted,
  onToggleMute,
  speed,
  onSpeedChange,
}) {
  // 以 code point 計數,與 reducer 的 clampAnswer 同一個口徑,
  // 免得畫面顯示 500/500 但實際還能再打一個字。
  const charCount = Array.from(draft).length
  const nearLimit = charCount >= NEAR_LIMIT_CHARS
  // 進度 = 已完成的題數 / 總題數。第 1 題時是 0%,第 5 題時是 80% —— 這一題還沒答完,
  // 進度條不該先替使用者把它算成已完成。
  const progressPercent = (questionIndex / QUESTION_COUNT) * 100

  return (
    <div className="iv-flow-column">
      {/* ── 進度(D-27):文字 + 進度條,兩者都要 ── */}
      <div className="iv-progress">
        <p className="iv-progress-label">{`第 ${questionIndex + 1} / ${QUESTION_COUNT} 題`}</p>
        <div className="iv-progress-track">
          <div className="iv-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      {/* ── 題卡(D-18):純文字 + 題型標籤 + 播放指示,不加角色頭像。
             題目文字直接完整顯示,不做逐字打字機效果 —— 訪客是來被問問題的,
             不是來等字一個一個跑出來的。 ── */}
      <div className="iv-question-card">
        <div className="iv-question-meta">
          <span className="iv-question-type">{TYPE_LABELS[question.type] || TYPE_LABELS.technical}</span>
          {/* 四條等化器長條。非播放時靜止在低高度而不是隱藏 —— 隱藏會讓使用者
              以為壞了。TTS 合成失敗時(D-21 靜默降級)也停在這個靜止狀態,
              不觸發任何錯誤 UI。 */}
          <span
            className={`iv-playing-indicator ${isPlaying ? 'iv-playing-indicator--active' : ''}`}
            aria-hidden="true"
          >
            <span className="iv-playing-bar" />
            <span className="iv-playing-bar" />
            <span className="iv-playing-bar" />
            <span className="iv-playing-bar" />
          </span>
        </div>
        {/* 一律以 JSX 文字節點渲染。題目來自模型,長度與內容不可控,
            絕不使用任何形式的原始 HTML 注入(T-05-16)。 */}
        <p className="iv-question-text">{question.text}</p>
      </div>

      {/* ── 語音控制列(D-16):重聽 / 停止 / 靜音切換 / 三段語速 ── */}
      <div className="iv-voice-controls">
        <button type="button" className="iv-voice-btn" onClick={onReplay}>
          重聽這題
        </button>
        <button type="button" className="iv-voice-btn" onClick={onStop}>
          停止播放
        </button>
        {/* 按鈕上的字永遠是「按下去會發生的事」,不是「目前的狀態」——
            寫「已靜音」會讓人以為要再按一下才靜音。 */}
        <button
          type="button"
          className={`iv-voice-btn ${muted ? 'iv-voice-btn--active' : ''}`}
          aria-pressed={muted}
          onClick={onToggleMute}
        >
          {muted ? '取消靜音' : '靜音'}
        </button>
        <div className="iv-speed-group" role="group" aria-label="朗讀語速">
          {RATE_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={speed === option}
              className={`iv-voice-btn ${speed === option ? 'iv-voice-btn--active' : ''}`}
              onClick={() => onSpeedChange(option)}
            >
              {`${option}x`}
            </button>
          ))}
        </div>
      </div>

      {/* 播放指示是視覺的,螢幕閱讀器需要一句話。刻意放在控制列之後、
          用 aria-live="polite" —— 朗讀狀態不該打斷使用者正在聽的內容。 */}
      <p className="iv-visually-hidden" aria-live="polite">
        {isPlaying ? '面試官朗讀中' : '已停止朗讀'}
      </p>

      {/* ── 作答框(D-08)── */}
      <label className="iv-visually-hidden" htmlFor="iv-answer">
        你的回答
      </label>
      <textarea
        id="iv-answer"
        className="iv-answer-textarea"
        placeholder="在這裡輸入你的回答……"
        maxLength={ANSWER_MAX_CHARS}
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
      />
      <p className={`iv-char-counter ${nearLimit ? 'iv-char-counter--near-limit' : ''}`}>
        {`${charCount}/${ANSWER_MAX_CHARS}`}
      </p>

      {/* ── 按鈕列(D-05、D-07)。沒有回頭的路,所以也沒有那顆按鈕。 ── */}
      <div className="iv-runner-actions">
        <button type="button" className="iv-primary-btn" onClick={onNext}>
          {isLast ? '送出並評分' : '下一題'}
        </button>
        <button type="button" className="iv-secondary-btn" onClick={onSkip}>
          跳過這題
        </button>
      </div>

      {/* 提前結束放在獨立、次要的位置:它是離場動作,不該和推進動作並排搶手指。
          D-07:已作答的題(含現在框裡打好的字)直接送去評分,不丟棄任何內容。 */}
      <div className="iv-runner-exit">
        <button type="button" className="iv-text-btn" onClick={onEndEarly}>
          提前結束面試
        </button>
      </div>
    </div>
  )
}
