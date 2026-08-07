// 模擬面試分頁的唯一入口(FEAT-15/17/18),同時是**全部 .iv-* 樣式的持有者** ——
// 子元件(TrackSelect / InterviewRunner)不再各開一份 <style>,比照 DevToolsTab.jsx
// 與 TypingRace.jsx 的既有分工。
//
// ─────────────────────────────────────────────────────────────────────────────
// 【這個容器的四條邊界 —— 都是鎖定決策,不是風格偏好】
// ─────────────────────────────────────────────────────────────────────────────
//   1.(D-22)不得寫入任何瀏覽器端的持久化儲存。切分頁時面試進度靠 React state 留著,
//      重整就歸零 —— 這是刻意的:使用者的作答內容不該在他關掉分頁後還留在這台電腦上。
//   2.(D-19)前端不做自動重試。出題或評分失敗一律停在錯誤狀態等使用者按重試,
//      否則「畫面不會卡在載入狀態」這條驗收條件會被無限重試自己違反。
//   3.(D-31)播放器只能存在於 useInterviewTts.js。這個檔案與 InterviewRunner.jsx
//      都只呼叫 hook 回傳的函式,不自行建立音訊實例。
//   4. 本階段(05-04)刻意不動 FunPage.jsx —— 結果頁與錯誤卡要到 05-05 才落地,
//      分頁按鈕也在那時才掛上去。訪客第一次看到這個分頁時,它就該是完整的流程。
//
// 樣式的來源是 05-UI-SPEC.md(APPROVED,零修訂輪):CSS 值、class 名與文案字串
// 逐字生效。前綴一律 .iv-(比照 Phase 4 的 .dt-)—— 這裡的 CSS 是全域且未命名空間化的,
// 前綴是唯一的隔離手段。不使用 Tailwind 工具類、不使用圖示庫、零新增 npm 套件。

import { useEffect, useReducer, useRef } from 'react'
import {
  ACTION_TYPES,
  INITIAL_STATE,
  buildScoringPayload,
  canStart as canStartInterview,
  interviewReducer,
  isLastQuestion,
} from './interviewReducer'
import { fetchQuestions, postScore } from './interviewApi'
import { useInterviewTts } from './useInterviewTts'
import InterviewRunner from './InterviewRunner'
import TrackSelect from './TrackSelect'

export default function InterviewTab() {
  const [state, dispatch] = useReducer(interviewReducer, INITIAL_STATE)

  // 受控模式:靜音與語速的真相在狀態機(切分頁時跟著面試一起留著),hook 只負責播。
  // 兩邊各存一份是這裡最容易長出來的 bug —— 靜音鈕看起來切了但聲音照播。
  const { speak, stop, replay, isPlaying, muted, toggleMute, speed, setSpeed } = useInterviewTts({
    language: state.language,
    muted: state.muted,
    speed: state.rate,
    onMutedChange: () => dispatch({ type: ACTION_TYPES.TOGGLE_MUTE }),
    onSpeedChange: (rate) => dispatch({ type: ACTION_TYPES.SET_RATE, rate }),
  })

  // 評分請求要用「送出當下的那一份 state」組 payload,但又不能把整個 state 放進
  // effect 的相依陣列 —— SET_RATE / TOGGLE_MUTE 沒有 phase 守衛,評分中調個語速
  // 就會讓 effect 重跑而重複送出。改成用 ref 讀最新值,相依只留 phase。
  // 這個同步 effect 宣告在最前面,因為同一個元件的 effect 依宣告順序執行,
  // 底下的請求 effect 讀到的一定是這一次 render 的 state。
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  })

  // ── 出題 ────────────────────────────────────────────────────────────────
  // phase 進到 loading_questions 就送一次(START_INTERVIEW 與 RETRY_QUESTIONS 都會
  // 走到這個 phase,所以重試自然重跑)。中止是我們自己要求的,不進錯誤狀態。
  useEffect(() => {
    if (state.phase !== 'loading_questions') return undefined
    const controller = new AbortController()
    let cancelled = false

    ;(async () => {
      const current = stateRef.current
      const res = await fetchQuestions({
        track: current.track,
        language: current.language,
        signal: controller.signal,
      })
      if (cancelled || res.aborted) return
      if (res.ok) {
        dispatch({ type: ACTION_TYPES.QUESTIONS_LOADED, questions: res.data.questions })
      } else {
        dispatch({ type: ACTION_TYPES.QUESTIONS_FAILED, code: res.code, status: res.status })
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [state.phase])

  // ── 評分 ────────────────────────────────────────────────────────────────
  // payload 由 buildScoringPayload 從同一份 state 純函式產生,重試時逐字相同(D-20)。
  useEffect(() => {
    if (state.phase !== 'scoring') return undefined
    const controller = new AbortController()
    let cancelled = false

    ;(async () => {
      const payload = buildScoringPayload(stateRef.current)
      const res = await postScore(payload, { signal: controller.signal })
      if (cancelled || res.aborted) return
      if (res.ok) {
        dispatch({ type: ACTION_TYPES.SCORING_SUCCEEDED, result: res.data })
      } else {
        dispatch({ type: ACTION_TYPES.SCORING_FAILED, code: res.code, status: res.status })
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [state.phase])

  // ── 每題進場自動播放(D-14)──────────────────────────────────────────────
  // 「開始面試」那一次點擊就是 autoplay policy 需要的使用者互動,所以之後每題自動播
  // 都是合法的。cleanup 的 stop() 讓切題時先停掉前一題再播新的。
  //
  // 相依刻意只放 phase 與題號:speak 的識別會隨 muted / speed 改變,若放進相依,
  // 使用者調個語速就會讓目前這題從頭重播 —— 而 hook 的契約是「語速只影響下一次合成」。
  useEffect(() => {
    if (state.phase !== 'interviewing') return undefined
    const question = state.questions[state.currentIndex]
    if (!question) return undefined
    speak(question.text)
    return () => stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.currentIndex])

  const selectTrack = (track) => dispatch({ type: ACTION_TYPES.SELECT_TRACK, track })
  const selectLanguage = (language) => dispatch({ type: ACTION_TYPES.SELECT_LANGUAGE, language })
  const startInterview = () => dispatch({ type: ACTION_TYPES.START_INTERVIEW })
  const updateDraft = (text) => dispatch({ type: ACTION_TYPES.UPDATE_DRAFT, text })
  const nextQuestion = () => dispatch({ type: ACTION_TYPES.NEXT_QUESTION })
  const skipQuestion = () => dispatch({ type: ACTION_TYPES.SKIP_QUESTION })
  const endEarly = () => dispatch({ type: ACTION_TYPES.END_EARLY })

  return (
    <div className="iv-tab">
      <style>{`
        .iv-tab {
          width: 100%;
          font-family: var(--font-sans);
          color: var(--fg);
        }

        /* ── 內容欄寬(UI-SPEC §1)─────────────────────────────────────────
           .tab-content 的 --game-max: 1600px 是既有全站設定,面試流程**不繼承它**。
           一條垂直的問答流程攤到 1600px 寬會讓眼睛在每一行末端跑很遠,
           所以題卡 / 作答框 / 進度條這一整條收斂在自己的欄寬。 */
        .iv-flow-column {
          width: 100%;
          max-width: 720px;
          margin: 0 auto;
        }
        .iv-results {
          max-width: 720px;
          margin: 0 auto;
        }

        /* ── 開場畫面(D-26)──────────────────────────────────────────────── */
        .iv-setup {
          width: 100%;
          text-align: center;
        }
        /* Display 32/700/1.2 —— 全階段唯一一處。 */
        .iv-display-title {
          margin: 0 0 8px;
          font-size: 32px;
          font-weight: 700;
          line-height: 1.2;
          color: var(--fg);
        }
        /* Body 15/400/1.6。48px 是「開場標題與卡片區」的間距(spacing 2xl)。 */
        .iv-setup-subtitle {
          margin: 0 0 48px;
          font-size: 15px;
          font-weight: 400;
          line-height: 1.6;
          color: var(--muted);
        }

        .iv-track-grid {
          max-width: 960px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }

        .iv-track-card {
          display: flex;
          flex-direction: column;
          min-height: 44px;
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 24px;
          cursor: pointer;
          background: var(--surface);
          transition: border-color 0.2s, background 0.2s;
          text-align: left;
          font-family: var(--font-sans);
        }
        .iv-track-card:hover { border-color: var(--accent); }
        .iv-track-card:focus-visible { border-color: var(--accent); outline: 1px solid var(--accent); }
        /* accent 白名單第 1 項:選中的職缺卡邊框 + 低透明度底色。 */
        .iv-track-card--selected {
          border-color: var(--accent);
          background: rgba(200, 148, 42, 0.08);
        }
        /* UI-SPEC §2 的 .iv-track-card h3 / p 值原封搬過來,只是換成 span ——
           heading 與段落是 flow content,包在 <button> 裡對輔助技術是壞的語意
           (會被唸成「標題」再唸成「按鈕」),視覺值一個都沒動。 */
        .iv-track-card-title {
          font-size: 20px;
          font-weight: 700;
          line-height: 1.3;
          margin-bottom: 8px;
          color: var(--fg);
        }
        .iv-track-card-desc {
          font-size: 15px;
          font-weight: 400;
          color: var(--muted);
          line-height: 1.6;
        }

        .iv-setup-footer {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin-top: 32px;
        }

        /* 語言二選一。刻意**不用 accent** 標示選中 —— accent 的保留清單只有六項,
           語言切換不在其中;用邊框亮度與字重區分,顏色留給真正需要引導的 CTA。 */
        .iv-segmented {
          display: flex;
          gap: 4px;
        }
        .iv-segmented-btn {
          min-width: 44px;
          min-height: 44px;
          padding: 8px 16px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: transparent;
          color: var(--muted);
          font-family: var(--font-sans);
          font-size: 13px;
          line-height: 1.2;
          cursor: pointer;
          transition: border-color 0.2s, color 0.2s;
        }
        .iv-segmented-btn:hover { color: var(--fg); }
        .iv-segmented-btn--active {
          border-color: var(--fg);
          color: var(--fg);
          font-weight: 700;
        }

        /* accent 白名單第 2 項:流程中的主要 CTA 填色。 */
        .iv-primary-btn {
          min-height: 44px;
          padding: 14px 32px;
          background: var(--accent);
          color: var(--bg);
          border: none;
          border-radius: 4px;
          font-family: var(--font-sans);
          font-size: 14px;
          font-weight: 700;
          line-height: 1.2;
          cursor: pointer;
        }
        /* 未選方向時不可按。降透明度而非換色 —— 換色等於偷偷新增一個語意色(D-28)。 */
        .iv-primary-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        /* ── 載入狀態(D-29)──────────────────────────────────────────────
           .ai-spinner 是 FunPage.jsx 既有的 36px accent 圓環,面試分頁是它的子孫節點,
           直接沿用不複製一份。實測出題 1.8–7.3 秒、極端值到 65 秒,評分 2.5–6.7 秒,
           所以狀態文字要一進來就在,不能延遲顯示 —— 這段時間全靠它撐住注意力。 */
        .iv-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          padding: 48px 0;
        }
        .iv-loading-text {
          margin: 0;
          font-size: 15px;
          font-weight: 400;
          line-height: 1.6;
          color: var(--muted);
        }

        /* ── 進度(D-27 / UI-SPEC §5)────────────────────────────────────── */
        .iv-progress { margin-bottom: 24px; }
        /* Label 13/400/1.2 */
        .iv-progress-label {
          margin: 0 0 8px;
          font-size: 13px;
          font-weight: 400;
          line-height: 1.2;
          color: var(--muted);
        }
        .iv-progress-track {
          width: 100%;
          height: 4px;
          background: var(--border);
          border-radius: 999px;
          overflow: hidden;
          margin-bottom: 8px;
        }
        /* accent 白名單第 3 項:進度條已完成的部分。 */
        .iv-progress-fill {
          height: 100%;
          background: var(--accent);
          border-radius: 999px;
          transition: width 0.3s ease;
        }

        /* ── 題卡(D-18)──────────────────────────────────────────────────
           純文字 + 題型標籤 + 播放指示。題目自然換行、不截斷,卡片隨內容增高 ——
           理解優先於版面整齊(overflow-wrap 是為了擋住沒有空白的超長字串,T-05-17)。 */
        .iv-question-card {
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 24px;
          background: var(--surface);
          margin-bottom: 32px;
        }
        .iv-question-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 16px;
        }
        .iv-question-type {
          font-size: 13px;
          font-weight: 400;
          line-height: 1.2;
          letter-spacing: 0.05em;
          color: var(--muted);
        }
        .iv-question-text {
          margin: 0;
          font-size: 15px;
          font-weight: 400;
          line-height: 1.6;
          color: var(--fg);
          overflow-wrap: anywhere;
        }

        /* ── 播放指示(UI-SPEC §3,逐字)──────────────────────────────── */
        .iv-playing-indicator { display: inline-flex; align-items: flex-end; gap: 3px; height: 16px; }
        /* height 與 transform-origin 是 UI-SPEC §3 沒寫、但少了就整組看不見的兩行:
           容器是 align-items: flex-end 的 flex,長條又是空的 <span>,不加 height 會被
           算成 0px(實測 getBoundingClientRect().height === 0,四條等化器完全不顯示)。
           transform-origin: bottom 則讓 scaleY 從底線往上長 —— 預設的 center 會讓長條
           同時往上下兩邊長,跳起來像呼吸而不像等化器。其餘數值一律照 §3 逐字。 */
        .iv-playing-bar { width: 3px; height: 100%; transform-origin: bottom; border-radius: 2px; background: var(--accent); transform: scaleY(0.35); transition: transform 0.15s; }
        .iv-playing-indicator--active .iv-playing-bar { animation: iv-bar-bounce 0.9s ease-in-out infinite; }
        .iv-playing-indicator--active .iv-playing-bar:nth-child(1) { animation-delay: 0s; }
        .iv-playing-indicator--active .iv-playing-bar:nth-child(2) { animation-delay: 0.15s; }
        .iv-playing-indicator--active .iv-playing-bar:nth-child(3) { animation-delay: 0.3s; }
        .iv-playing-indicator--active .iv-playing-bar:nth-child(4) { animation-delay: 0.45s; }
        @keyframes iv-bar-bounce { 0%, 100% { transform: scaleY(0.35); } 50% { transform: scaleY(1); } }

        /* 這是純 CSS keyframes,不由 JS 逐幀驅動,所以 CSS 媒體查詢已足夠攔截 ——
           hook 不需要讀 matchMedia。長條不隱藏、只固定在 0.7,維持「還在」的訊號。 */
        @media (prefers-reduced-motion: reduce) {
          .iv-playing-indicator--active .iv-playing-bar { animation: none; transform: scaleY(0.7); }
        }

        /* ── 語音控制列(D-16 / UI-SPEC §4,逐字)──────────────────────── */
        .iv-voice-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
        .iv-voice-btn {
          min-width: 44px; min-height: 44px; padding: 8px 16px;
          border: 1px solid var(--border); border-radius: 8px; background: transparent;
          color: var(--fg); font-size: 13px; cursor: pointer;
          transition: border-color 0.2s, color 0.2s;
        }
        .iv-voice-btn:hover { border-color: var(--accent); }
        /* accent 白名單第 4 項:語速與靜音切換的**已選取**狀態。 */
        .iv-voice-btn--active { border-color: var(--accent); color: var(--accent); }
        .iv-speed-group { display: flex; gap: 4px; }

        /* ── 作答框(D-08 / UI-SPEC §6,逐字)──────────────────────────
           固定高度 + 內部捲動,刻意不做 auto-grow:手機上輸入框隨字數增高會把
           語音控制列與進度條推出可視範圍,與「控制列固定在作答框上方」互相打架。 */
        .iv-answer-textarea {
          width: 100%; height: 140px; resize: none; overflow-y: auto;
          padding: 14px 18px; background: #111; border: 1px solid #333;
          color: var(--fg); font-family: var(--font-body); font-size: 15px; line-height: 1.6;
          border-radius: 4px; outline: none;
        }
        .iv-answer-textarea:focus { border-color: var(--accent); }
        .iv-char-counter { font-size: 13px; color: var(--muted); text-align: right; margin-top: 4px; }
        /* 接近上限只加粗、不變色 —— 用字重而非顏色示警(D-28 的中性徽章原則)。 */
        .iv-char-counter--near-limit { font-weight: 700; color: var(--fg); }

        /* ── 按鈕列 ────────────────────────────────────────────────────── */
        .iv-runner-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 24px;
        }
        .iv-secondary-btn {
          min-height: 44px;
          padding: 12px 24px;
          border: 1px solid var(--border);
          border-radius: 4px;
          background: transparent;
          color: var(--fg);
          font-family: var(--font-sans);
          font-size: 14px;
          line-height: 1.2;
          cursor: pointer;
          transition: border-color 0.2s;
        }
        .iv-secondary-btn:hover { border-color: var(--accent); }

        /* 離場動作獨立一列、視覺最輕。與推進動作並排會讓手指在小螢幕上誤觸。 */
        .iv-runner-exit { margin-top: 32px; text-align: center; }
        .iv-text-btn {
          min-height: 44px;
          padding: 8px 16px;
          background: none;
          border: none;
          color: var(--muted);
          font-family: var(--font-sans);
          font-size: 13px;
          line-height: 1.2;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 4px;
        }
        .iv-text-btn:hover { color: var(--fg); }

        /* 螢幕閱讀器專用文字。用絕對定位裁切,**不是** display: none ——
           後者連輔助技術也讀不到,aria-live 就失去意義。 */
        .iv-visually-hidden {
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

        /* ── 行動裝置(D-30 / UI-SPEC §12)──────────────────────────────────
           作答框、語音控制列與按鈕一律走一般文件流,不得固定定位 —— 手機虛擬鍵盤
           會蓋住或推擠固定定位的元素。捲動進可視範圍交給瀏覽器原生行為。 */
        @media (max-width: 768px) {
          .iv-flow-column { padding: 0 4vw; }
          .iv-track-grid { grid-template-columns: repeat(2, 1fr); }
          .iv-voice-controls { gap: 6px; }
          .iv-voice-btn { padding: 6px 12px; font-size: 12px; }
        }
        @media (max-width: 480px) {
          .iv-track-grid { grid-template-columns: 1fr; }
          .iv-setup-footer { flex-direction: column; }
          .iv-primary-btn { width: 100%; }
          .iv-runner-actions { flex-direction: column; }
          .iv-runner-actions .iv-primary-btn,
          .iv-runner-actions .iv-secondary-btn { width: 100%; }
        }

        @media (prefers-reduced-motion: reduce) {
          .iv-track-card { transition: none; }
          .iv-segmented-btn { transition: none; }
          .iv-voice-btn { transition: none; }
          .iv-playing-bar { transition: none; }
          .iv-progress-fill { transition: none; }
        }
      `}</style>

      {state.phase === 'setup' && (
        <TrackSelect
          track={state.track}
          language={state.language}
          onSelectTrack={selectTrack}
          onSelectLanguage={selectLanguage}
          onStart={startInterview}
          canStart={canStartInterview(state)}
        />
      )}

      {state.phase === 'interviewing' && state.questions[state.currentIndex] && (
        <InterviewRunner
          question={state.questions[state.currentIndex]}
          questionIndex={state.currentIndex}
          draft={state.draft}
          onDraftChange={updateDraft}
          onNext={nextQuestion}
          onSkip={skipQuestion}
          onEndEarly={endEarly}
          isLast={isLastQuestion(state)}
          isPlaying={isPlaying}
          onReplay={replay}
          onStop={stop}
          muted={muted}
          onToggleMute={toggleMute}
          speed={speed}
          onSpeedChange={setSpeed}
        />
      )}

      {state.phase === 'loading_questions' && (
        <div className="iv-flow-column iv-loading">
          <div className="ai-spinner" />
          <p className="iv-loading-text">面試官正在出題……</p>
        </div>
      )}

      {state.phase === 'scoring' && (
        <div className="iv-flow-column iv-loading">
          <div className="ai-spinner" />
          <p className="iv-loading-text">正在評分……</p>
        </div>
      )}
    </div>
  )
}
