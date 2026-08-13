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

import { useEffect, useReducer, useRef, useState } from 'react'
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
import InterviewErrorCard, { PreservedAnswers } from './InterviewErrorCard'
import InterviewResults from './InterviewResults'
import InterviewRunner from './InterviewRunner'
import TrackSelect from './TrackSelect'
import { strings } from './interviewStrings'

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
  const retryQuestions = () => dispatch({ type: ACTION_TYPES.RETRY_QUESTIONS })
  // 重試評分只是把 phase 推回 'scoring',上面那支 effect 就會用**同一份 state**
  // 再組一次 payload —— 與第一次逐字相同(D-20 / REL-1)。這裡刻意不碰 answers。
  // 「這一次的評分是重試」——**只影響載入畫面要不要繼續顯示那五段作答**,不是流程狀態,
  // 所以留在元件裡而不是狀態機裡(狀態機是 05-02 已用測試釘死的契約,不為了畫面細節動它)。
  //
  // 為什麼需要它:評分失敗後按下重試,如果畫面換成一顆光禿禿的轉圈,使用者剛被嚇過一次
  // 「我的字是不是沒了」,又要再盯著空白畫面等 2.5–6.7 秒(最壞約 37 秒)。作答一直留在
  // 畫面上,他才會相信送出去的是同一批字。第一次評分不顯示 —— 那時還沒有任何事出錯,
  // 掛一句「你的作答都還在」反而是在暗示有東西可能會不見。
  const [rescoring, setRescoring] = useState(false)
  const retryScoring = () => {
    setRescoring(true)
    dispatch({ type: ACTION_TYPES.RETRY_SCORING })
  }
  useEffect(() => {
    if (state.phase === 'results' || state.phase === 'setup') setRescoring(false)
  }, [state.phase])

  // 全站唯一會清空 answers 的入口,所以它只掛在結果頁 —— 評分失敗的畫面上不放它。
  const restartInterview = () => dispatch({ type: ACTION_TYPES.RESTART_INTERVIEW })

  // 介面文案跟著所選語言走。選了 English 卻只換題目、介面留中文,使用者會以為
  // 切換沒生效 —— 語言切換的承諾是整個畫面,不只是內容。
  const t = strings(state.language)

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

        /* ── 結果頁:總分區(D-09 / UI-SPEC Typography 的一次性例外)────── */
        .iv-results-title {
          margin: 0 0 24px;
          font-size: 20px;
          font-weight: 700;
          line-height: 1.3;
          color: var(--fg);
        }
        .iv-score-block {
          display: flex;
          align-items: baseline;
          flex-wrap: wrap;
          gap: 16px;
        }
        .iv-score-line {
          margin: 0;
          display: flex;
          align-items: baseline;
          gap: 8px;
        }
        /* accent 白名單第 5 項,也是全階段唯一跳脫四級字階的字級。 */
        .iv-score-number {
          font-family: var(--font-sans);
          font-size: clamp(56px, 9vw, 88px);
          font-weight: 700;
          line-height: 1;
          color: var(--accent);
        }
        .iv-score-unit { font-size: 16px; color: var(--muted); }
        /* 評等徽章:與逐題徽章、未作答徽章同一套中性外觀,不依好壞變色(D-28)。 */
        .iv-rating-badge {
          border: 1px solid var(--border);
          color: var(--fg);
          border-radius: 999px;
          padding: 2px 10px;
          font-size: 13px;
          white-space: nowrap;
        }
        .iv-summary {
          margin: 16px 0 0;
          font-size: 15px;
          font-weight: 400;
          line-height: 1.6;
          color: var(--fg);
          overflow-wrap: anywhere;
        }
        /* G-6 免責說明。Label 級,固定顯示,且刻意不在 print 的隱藏清單裡。 */
        .iv-disclaimer {
          margin: 16px 0 0;
          font-size: 13px;
          font-weight: 400;
          line-height: 1.2;
          color: var(--muted);
        }
        .iv-qa-heading {
          margin: 32px 0 0;
          font-size: 20px;
          font-weight: 700;
          line-height: 1.3;
          color: var(--fg);
        }

        /* ── 結果頁:逐題回饋摺疊列表(UI-SPEC §9,逐字)────────────────── */
        .iv-qa-list { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }
        .iv-qa-item { border: 1px solid var(--border); border-radius: 8px; background: var(--surface); overflow: hidden; }
        /* 整列是一顆 <button>,所以要把瀏覽器的按鈕預設值清掉再套 §9 的值。 */
        .iv-qa-summary-row {
          display: flex; align-items: center; gap: 12px; padding: 16px;
          cursor: pointer; font-size: 15px;
          width: 100%; text-align: left; background: none; border: none;
          font-family: var(--font-sans); color: var(--fg); min-height: 44px;
        }
        .iv-qa-summary-row:hover { color: var(--fg); }
        .iv-qa-index { font-size: 13px; color: var(--fg); white-space: nowrap; }
        .iv-qa-badge { border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px; font-size: 13px; white-space: nowrap; }
        .iv-qa-type-tag { font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }
        /* min-width: 0 是 flex 子項要能被 ellipsis 截斷的前提 —— 預設的 auto
           會讓它撐到內容寬度,text-overflow 就永遠不會生效。 */
        .iv-qa-preview { flex: 1; min-width: 0; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        /* 收合時 display: none,展開時 block。**不是**條件渲染 ——
           列印時要靠 print CSS 把它強制展開(§10)。 */
        .iv-qa-detail { display: none; padding: 0 16px 16px; font-size: 15px; line-height: 1.6; }
        .iv-qa-item--open .iv-qa-detail { display: block; }
        .iv-qa-detail .iv-qa-question { margin: 0 0 12px; color: var(--muted); overflow-wrap: anywhere; }
        .iv-qa-detail .iv-qa-comment { margin: 0; color: var(--fg); overflow-wrap: anywhere; }
        .iv-qa-detail .iv-qa-suggestion-label { font-size: 13px; color: var(--muted); text-transform: uppercase; margin: 12px 0 4px; }
        .iv-qa-detail .iv-qa-suggestion { margin: 0; color: var(--fg); overflow-wrap: anywhere; }

        /* ── 結果頁動作列(UI-SPEC §11)────────────────────────────────────
           三顆權重相同、皆為描邊而非填色。結果頁的主要動作已經完成。 */
        .iv-actions-row { display: flex; gap: 12px; margin-top: 32px; flex-wrap: wrap; }
        .iv-action-btn {
          flex: 1; min-width: 160px; min-height: 44px; padding: 12px 24px;
          border: 1px solid var(--border); border-radius: 4px; background: transparent;
          color: var(--fg); font-family: var(--font-sans); font-size: 14px; line-height: 1.2;
          cursor: pointer; transition: border-color 0.2s;
        }
        .iv-action-btn:hover { border-color: var(--accent); }

        /* ── 錯誤卡(UI-SPEC §7,逐字)────────────────────────────────────
           出題失敗時它是整個畫面唯一的內容,置中顯示於 .iv-flow-column;
           評分失敗時它置頂於 .iv-results,下方接著作答保留區(§8)。
           標題與段落的 margin 明確歸零後再補上 §7 的 margin-bottom ——
           否則 UA 預設的 h2 / p 上下邊距會蓋掉規格裡的間距值。 */
        .iv-error-card {
          width: 100%;
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 32px 28px;
          text-align: center;
          background: var(--surface);
        }
        .iv-error-eyebrow {
          margin: 0 0 8px;
          font-size: 13px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .iv-error-title {
          margin: 0 0 8px;
          font-size: 20px;
          font-weight: 700;
          line-height: 1.3;
          color: var(--fg);
        }
        .iv-error-body {
          margin: 0 0 24px;
          font-size: 15px;
          color: var(--muted);
          line-height: 1.6;
        }
        /* accent 白名單第 5 項:錯誤卡的重試鈕。 */
        .iv-error-retry-btn {
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
          min-height: 44px;
        }
        /* 評分失敗時寬度貼齊卡片(§8)—— 使用者接下來唯一該做的事就是按它。 */
        .iv-error-retry-btn--block { width: 100%; }

        /* ── 作答保留區(D-20 / UI-SPEC §8,逐字)────────────────────────
           全文攤開、不摺疊。理由寫在 InterviewErrorCard.jsx 的元件註解裡。 */
        .iv-preserved-answers { margin-top: 32px; }
        .iv-preserved-heading {
          margin: 0 0 16px;
          font-size: 13px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .iv-preserved-item {
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
          background: var(--surface);
        }
        .iv-preserved-item .iv-preserved-q {
          margin: 0 0 6px;
          font-size: 13px;
          color: var(--muted);
        }
        /* pre-wrap 保留使用者自己打的換行 —— 送出前長什麼樣,這裡就長什麼樣。
           overflow-wrap 是為了擋住貼上來的超長無空白字串撐破欄寬(同 T-05-17)。 */
        .iv-preserved-item .iv-preserved-a {
          margin: 0;
          font-size: 15px;
          line-height: 1.6;
          color: var(--fg);
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .iv-preserved-item--skipped .iv-preserved-a {
          color: var(--muted);
          font-style: italic;
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
          /* UI-SPEC §12:窄螢幕上三顆收尾動作改直排,一顆一列滿版。 */
          .iv-actions-row { flex-direction: column; }
          .iv-action-btn { flex: none; width: 100%; }
        }

        @media (prefers-reduced-motion: reduce) {
          .iv-track-card { transition: none; }
          .iv-segmented-btn { transition: none; }
          .iv-voice-btn { transition: none; }
          .iv-playing-bar { transition: none; }
          .iv-progress-fill { transition: none; }
          .iv-action-btn { transition: none; }
        }

        /* ── 列印 / 匯出 PDF(D-12 / UI-SPEC §10,逐字)──────────────────────
           不引入任何 PDF 套件,window.print() 開瀏覽器原生對話框。
           scope 只作用於 .iv-results 內。 */
        @media print {
          /* 紙上只該有結果本身。這裡用「先全部關掉,再把結果頁開回來」的隔離寫法,
             而不是逐一列出要藏的東西 —— 頁面上還有幾個沒有 class 的浮動元件
             (Cursor 的自訂游標、AIAssistant 的 Wobot 浮動按鈕、App.jsx 那條
             安全區填充條),全部是 inline style 的匿名 div,用選擇器點名根本點不到;
             就算硬加 class,日後多一個浮動元件又會再漏一次。
             visibility 會繼承,所以這條規則對未來新增的東西預設就是安全的。
             底下的 display:none 仍然保留 —— visibility:hidden 會留下版面高度,
             頁尾那種很高的區塊不關掉會印出空白頁。 */
          body * { visibility: hidden !important; }
          .iv-results, .iv-results * { visibility: visible !important; }

          /* 全站深色底在紙上是浪費油墨且經常列印不出來,強制轉白底黑字 */
          .iv-results, .iv-results * {
            background: #fff !important;
            color: #000 !important;
            box-shadow: none !important;
            border-color: #ccc !important;
          }
          /* 不可列印的頁面外框與互動元件。
             選擇器要對得上真實 DOM:導覽列是 nav#topnav(不是 .top-nav,那個 class
             全站不存在),頁尾是 footer#footer。兩者的文字都是淺色,而印表機預設
             不印背景色 —— 沒藏掉的話紙上就是白底白字的空白區,還多吃一頁。 */
          #topnav, .nav-overlay, #footer, .tab-nav, .fun-header,
          .iv-actions-row, .iv-voice-controls, .iv-progress-track {
            display: none !important;
          }
          /* 摺疊列表在畫面上是收合的,但列印必須強制全展開 ——
             否則印出來的紙只有題號和一行預覽 */
          .iv-qa-detail { display: block !important; max-height: none !important; overflow: visible !important; }
          .iv-qa-summary-row { cursor: default !important; }
          .iv-qa-preview { display: none !important; } /* 展開時預覽行冗餘,印出時隱藏 */
          .iv-qa-item { break-inside: avoid; margin-bottom: 16px; }
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
          language={state.language}
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
          <p className="iv-loading-text">{t.loadingQuestions}</p>
        </div>
      )}

      {/* 第一次評分:單純的載入畫面。
          重試評分:轉圈上方換成同一個 .iv-results 容器,五段作答繼續留在畫面上 ——
          UI-SPEC §8 要求「點擊重試後畫面不清空 .iv-preserved-answers」,
          而作答內容在請求送出前後必須逐字相同。 */}
      {state.phase === 'scoring' &&
        (rescoring ? (
          <div className="iv-results iv-flow-column">
            <div className="iv-loading">
              <div className="ai-spinner" />
              <p className="iv-loading-text">{t.loadingScore}</p>
            </div>
            <PreservedAnswers questions={state.questions} answers={state.answers} language={state.language} />
          </div>
        ) : (
          <div className="iv-flow-column iv-loading">
            <div className="ai-spinner" />
            <p className="iv-loading-text">{t.loadingScore}</p>
          </div>
        ))}

      {state.phase === 'results' && state.result && (
        <InterviewResults
          result={state.result}
          questions={state.questions}
          language={state.language}
          onRestart={restartInterview}
        />
      )}

      {/* 出題失敗:使用者還沒投入作答,錯誤卡就是整個畫面(UI-SPEC §7)。 */}
      {state.phase === 'questions_error' && (
        <div className="iv-flow-column">
          <InterviewErrorCard
            stage="questions"
            code={state.errorCode}
            status={state.errorStatus}
            language={state.language}
            onRetry={retryQuestions}
          />
        </div>
      )}

      {/* 評分失敗(D-20 —— 本階段最重要的一個畫面)。
          容器同時掛 .iv-results 與 .iv-flow-column:UI-SPEC §8 的內文說它渲染在
          「回饋頁本來會出現的同一個位置(.iv-results 容器)」,但同一節的結構圖
          畫的根節點是 .iv-flow-column。兩者的 max-width 都是 720px,同時掛上去
          視覺完全一致,又能拿到 .iv-flow-column 在 768px 以下的 4vw 內距。
          錯誤卡與五段作答是**同一次渲染**,不需要任何額外點擊才看得到;
          這個畫面上刻意沒有「重新面試」——誤觸它才是真正的資料遺失。 */}
      {state.phase === 'scoring_error' && (
        <div className="iv-results iv-flow-column">
          <InterviewErrorCard
            stage="scoring"
            code={state.errorCode}
            status={state.errorStatus}
            language={state.language}
            onRetry={retryScoring}
          />
          <PreservedAnswers questions={state.questions} answers={state.answers} language={state.language} />
        </div>
      )}
    </div>
  )
}
