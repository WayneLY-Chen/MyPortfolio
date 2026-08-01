import { useEffect, useRef, useState } from 'react'
import { API_URL } from '../../config/api'
import { useToast } from '../ui/Toast'
import { ZH_SENTENCES, EN_SENTENCES } from './typingCorpus'
import {
  toChars,
  markWrongIndices,
  isComplete,
  calcAccuracy,
  calcWpmEn,
  calcCpmZh,
  calcElapsedMs,
  MIN_ELAPSED_FOR_LIVE_SPEED_MS,
} from './typingEngine'

// TypingRace —— 打字競速主要元件(03-01 tracer + 03-03 進行中回饋)。
//
// 核心狀態架構:`typed` 永遠原封不動鏡射 e.target.value(供受控 input 使用,
// 不能被組字打斷);`settled` 只在組字結束或非組字輸入時才更新,是比對/著色/
// 完成判定的唯一依據。isComposingRef 是「目前是否在組字中」的唯一真相來源
// (見 03-RESEARCH.md Pattern 1)。everWrongRef 用全量重算模型(Pattern 2),
// 只增不刪,對應 D-14「錯過一次就記一次,改對不還清白」。
//
// 03-03 新增:即時統計列(D-16,由 setInterval 驅動的 tick state 逼出重新渲染,
// 實際時間計算走 calcElapsedMs 純函式)、失焦暫停(D-17,pausedAtRef/
// totalPausedMsRef 排除暫停時長)、打錯字視覺回饋(D-18,ref 直接操作 class
// 強制 reflow,並依 prefers-reduced-motion 切換抖動/瞬時外框兩種路徑)。
//
// 本計畫刻意不實作:完整結果卡的總秒數/總字數/錯字數/作答回顧紅標/榜首差距
// (D-26)、上傳門檻灰化(D-25)——這些是 03-04 的範圍。

export default function TypingRace({ mode, onModeChange, onNewScore }) {
  const { addToast } = useToast()
  const inputRef = useRef(null)

  const sentenceList = mode === 'zh' ? ZH_SENTENCES : EN_SENTENCES
  const [sentenceIndex, setSentenceIndex] = useState(() =>
    Math.floor(Math.random() * sentenceList.length)
  )
  const target = sentenceList[sentenceIndex]?.text ?? ''

  const [typed, setTyped] = useState('')
  const [settled, setSettled] = useState('')
  const [isComposing, setIsComposing] = useState(false)
  const [started, setStarted] = useState(false)
  const [finished, setFinished] = useState(false)

  const [nickname, setNickname] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const isComposingRef = useRef(false)
  const startTimeRef = useRef(null)
  const everWrongRef = useRef(new Set())
  const finishedElapsedRef = useRef(0)
  const pausedAtRef = useRef(null) // D-17:暫停起點時間戳,未暫停時為 null
  const totalPausedMsRef = useRef(0) // D-17:累積暫停毫秒數

  const [paused, setPaused] = useState(false)
  const [, setLiveTick] = useState(0) // D-16:每 200ms 遞增以驅動即時統計列重新渲染

  const beginTimerIfNeeded = () => {
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now() // D-15:打下第一個字才開始計時
      setStarted(true)
    }
  }

  // D-17:單一經過時間計算路徑,測驗進行中的即時統計列與測驗結束的最終速度
  // 都走這裡——不得再各自用 Date.now() - startTimeRef.current 相減,否則暫停
  // 時間會被算進分母(03-RESEARCH.md Pitfall 2)。
  const getElapsedMs = () =>
    calcElapsedMs({
      now: Date.now(),
      startTime: startTimeRef.current,
      totalPausedMs: totalPausedMsRef.current,
      pausedAt: pausedAtRef.current,
    })

  // 全量重算的逐字比對(Pattern 2):每次「值已確定」都拿完整字串重新掃一次。
  const runComparison = (value) => {
    markWrongIndices(value, target, everWrongRef.current)
    setSettled(value)
    if (isComplete(value, target)) {
      finishedElapsedRef.current = getElapsedMs()
      setFinished(true)
    }
  }

  const handleCompositionStart = () => {
    isComposingRef.current = true
    setIsComposing(true)
    beginTimerIfNeeded()
  }

  const handleCompositionEnd = (e) => {
    isComposingRef.current = false
    setIsComposing(false)
    const value = e.target.value
    setTyped(value) // 鏡射現值,不做任何轉換
    runComparison(value) // 組字剛結束,此刻才真正比對計分
  }

  const handleChange = (e) => {
    const value = e.target.value
    setTyped(value) // 永遠鏡射,不論是否組字中——避免打斷 IME 候選字視窗
    beginTimerIfNeeded()

    // 優先信任自己的 ref;e.nativeEvent.isComposing 當次要保險(Safari 不穩定)
    if (isComposingRef.current || e.nativeEvent?.isComposing) return
    runComparison(value) // 非組字輸入(英文直接鍵入、刪除鍵、貼上)才即時比對
  }

  // D-17:輸入框失焦時自動暫停。尚未開始或已結束就不需要暫停。
  const handlePause = () => {
    if (!startTimeRef.current || finished) return
    setPaused(true)
    pausedAtRef.current = Date.now()
  }

  // D-17:輸入框重新取得焦點時恢復,並把這段暫停時長累加進總計。
  const handleResume = () => {
    if (pausedAtRef.current) {
      totalPausedMsRef.current += Date.now() - pausedAtRef.current
      pausedAtRef.current = null
    }
    setPaused(false)
  }

  // D-16:測驗進行中(未暫停、未結束)每 200ms 逼出一次重新渲染,驅動即時統計列。
  // 暫停或結束時清除計時器,讓數字自然凍結在原地。
  useEffect(() => {
    if (!started || finished || paused) return
    const id = setInterval(() => setLiveTick((t) => t + 1), 200)
    return () => clearInterval(id)
  }, [started, finished, paused])

  const resetRun = (list, nextIndex) => {
    setTyped('')
    setSettled('')
    setIsComposing(false)
    setStarted(false)
    setFinished(false)
    setNickname('')
    setSaved(false)
    setPaused(false)
    isComposingRef.current = false
    startTimeRef.current = null
    everWrongRef.current = new Set()
    finishedElapsedRef.current = 0
    pausedAtRef.current = null
    totalPausedMsRef.current = 0
    setSentenceIndex(nextIndex)
    void list
  }

  const handleModeChange = (nextMode) => {
    if (started && !finished) return // D-09:測驗進行中鎖定,按鈕本身也會 disabled
    if (nextMode === mode) return
    const nextList = nextMode === 'zh' ? ZH_SENTENCES : EN_SENTENCES
    resetRun(nextList, Math.floor(Math.random() * nextList.length))
    onModeChange(nextMode)
  }

  const handleUpload = async () => {
    const name = nickname.trim()
    if (!name || saving) return
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/leaderboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game_type: mode === 'zh' ? 'typing_zh' : 'typing_en',
          player_name: name,
          score: Math.round(speedValue),
          accuracy: Math.round(accuracyValue),
        }),
      })
      if (!res.ok) throw new Error('伺服器回應錯誤')
      setSaved(true)
      if (onNewScore) onNewScore()
    } catch (err) {
      console.error('[TypingRaceUploadError]', err)
      addToast({ title: '上傳失敗', description: '連線伺服器失敗,請稍後再試', variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const modeLocked = started && !finished

  const targetChars = toChars(target)
  const settledChars = toChars(settled)

  const speedValue = finished
    ? (mode === 'zh'
        ? calcCpmZh(toChars(settled).length, finishedElapsedRef.current)
        : calcWpmEn(toChars(settled).length, finishedElapsedRef.current))
    : 0
  const accuracyValue = finished ? calcAccuracy(target, everWrongRef.current) : 100

  // D-16:即時統計列——用同一條 getElapsedMs() 路徑(已排除暫停時長)。
  const showStatusLine = started && !finished
  const liveElapsedMs = showStatusLine ? getElapsedMs() : 0
  const liveElapsedSec = Math.floor(liveElapsedMs / 1000)
  const liveSpeedRaw = mode === 'zh'
    ? calcCpmZh(settledChars.length, liveElapsedMs)
    : calcWpmEn(settledChars.length, liveElapsedMs)
  // Pitfall 1:未滿 3 秒時顯示「--」,避免顯示外推暴衝的三位數
  const liveSpeedDisplay = liveElapsedMs < MIN_ELAPSED_FOR_LIVE_SPEED_MS ? '--' : Math.round(liveSpeedRaw)
  const liveAccuracyDisplay = Math.round(calcAccuracy(target, everWrongRef.current))

  const charState = (i) => {
    if (i < settledChars.length) {
      return settledChars[i] === targetChars[i] ? 'correct' : 'wrong'
    }
    if (i === settledChars.length) return 'cursor'
    return 'untyped'
  }

  return (
    <div className="typing-race">
      <style>{`
        .typing-race {
          --typing-correct: #4ade80;
          --typing-wrong-bg: #7a1f1f;
          --typing-wrong-text: #ffffff;
          --typing-untyped: rgba(245, 237, 224, 0.55);
          width: 100%;
          font-family: var(--font-sans);
        }

        .typing-mode-bar {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }
        .typing-mode-btn {
          padding: 10px 24px;
          background: none;
          border: 1px solid var(--border);
          color: var(--muted);
          cursor: pointer;
          font-family: var(--font-sans);
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          border-radius: 4px;
          transition: border-color 0.2s, color 0.2s;
        }
        .typing-mode-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--fg); }
        .typing-mode-btn--active { border-color: var(--accent); color: var(--accent); }
        .typing-mode-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .typing-passage {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 24px;
          max-width: 640px;
          margin: 0 auto 24px;
          font-size: 22px;
          line-height: 1.8;
          letter-spacing: 0.02em;
          min-height: 180px;
          overflow: visible;
          white-space: normal;
        }
        .typing-passage--zh { word-break: break-all; }
        .typing-passage--en { word-break: normal; overflow-wrap: break-word; }
        @media (max-width: 768px) {
          .typing-passage { font-size: 18px; max-height: 40vh; overflow-y: auto; }
        }
        @media (max-width: 480px) {
          .typing-passage { font-size: 16px; }
        }

        .typing-char { position: relative; }
        .typing-char--untyped { color: var(--typing-untyped); }
        .typing-char--correct { color: var(--typing-correct); }
        .typing-char--wrong {
          background: var(--typing-wrong-bg);
          color: var(--typing-wrong-text);
          border-radius: 2px;
        }
        .typing-char--cursor { color: var(--typing-untyped); }
        .typing-char--cursor::before {
          content: '';
          position: absolute;
          left: -1px;
          top: 1px;
          bottom: 1px;
          width: 2px;
          background: var(--accent);
          animation: typing-caret-blink 1s step-end infinite;
        }
        .typing-char--cursor.typing-char--composing::before {
          content: '';
          position: absolute;
          inset: -1px;
          width: auto;
          background: transparent;
          border: 1.5px solid var(--accent);
          border-radius: 2px;
          animation: none;
        }
        @keyframes typing-caret-blink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .typing-char--cursor::before { animation: none; }
        }

        .typing-status {
          display: flex;
          gap: 24px;
          align-items: baseline;
          margin: 0 auto 16px;
          max-width: 640px;
        }
        .typing-status-block {
          display: flex;
          align-items: baseline;
          gap: 8px;
        }
        .typing-status-label {
          font-family: var(--font-sans);
          font-size: 11px;
          font-weight: 800;
          line-height: 1.3;
          letter-spacing: 0.3em;
          color: var(--muted);
        }
        .typing-status-value {
          font-variant-numeric: tabular-nums;
          font-size: 18px;
          font-weight: 800;
          color: var(--accent);
          text-align: right;
          display: inline-block;
        }
        .typing-status-value--time { min-width: 3ch; }
        .typing-status-value--speed { min-width: 4ch; }
        .typing-status-value--accuracy { min-width: 3ch; }
        .typing-status-unit {
          font-size: 13px;
          font-weight: 400;
          color: var(--muted);
        }
        .typing-status-divider {
          width: 1px;
          align-self: stretch;
          background: var(--border);
        }

        .typing-input {
          width: 100%;
          max-width: 640px;
          display: block;
          margin: 0 auto;
          font-size: 16px;
          padding: 14px 16px;
          background: #111;
          border: 1px solid var(--border);
          color: var(--fg);
          font-family: var(--font-body);
          border-radius: 4px;
          outline: none;
        }
        .typing-input:focus { border-color: var(--accent); }
        .typing-input--paused {
          border-color: var(--muted);
          border-style: dashed;
          border-width: 1.5px;
        }

        .typing-input-wrap {
          max-width: 640px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .typing-input-wrap .typing-input { margin: 0; }
        .typing-pause-chip {
          background: rgba(200, 148, 42, 0.12);
          border: 1px solid var(--accent);
          border-radius: 999px;
          padding: 6px 16px;
          font-family: var(--font-sans);
          font-size: 13px;
          color: var(--fg);
          cursor: pointer;
        }

        .typing-result-card {
          max-width: 640px;
          margin: 0 auto;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 32px 24px;
          text-align: center;
        }
        .typing-result-title {
          font-family: var(--font-sans);
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 16px;
        }
        .typing-result-speed {
          font-family: var(--font-sans);
          font-size: 40px;
          font-weight: 800;
          line-height: 1.1;
          color: var(--accent);
        }
        .typing-result-unit { font-size: 16px; font-weight: 400; color: var(--muted); margin-left: 6px; }
        .typing-result-accuracy {
          margin-top: 8px;
          font-family: var(--font-sans);
          font-size: 16px;
          font-weight: 800;
          color: var(--fg);
        }

        .typing-upload-row {
          display: flex;
          gap: 8px;
          margin-top: 24px;
          justify-content: center;
          flex-wrap: wrap;
        }
        .typing-nickname-input {
          padding: 14px 16px;
          background: #111;
          border: 1px solid var(--border);
          color: var(--fg);
          font-family: var(--font-body);
          font-size: 16px;
          border-radius: 4px;
          outline: none;
        }
        .typing-nickname-input:focus { border-color: var(--accent); }
        .typing-btn {
          padding: 12px 28px;
          border: none;
          cursor: pointer;
          font-family: var(--font-sans);
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          border-radius: 4px;
          transition: opacity 0.3s;
        }
        .typing-btn--primary { background: var(--accent); color: var(--bg); }
        .typing-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .typing-upload-success { margin-top: 12px; color: var(--accent); font-size: 14px; }

        @media (max-width: 768px) {
          .typing-mode-btn, .typing-btn { min-height: 44px; }
        }
      `}</style>

      <div className="typing-mode-bar">
        <button
          type="button"
          className={`typing-mode-btn ${mode === 'zh' ? 'typing-mode-btn--active' : ''}`}
          onClick={() => handleModeChange('zh')}
          disabled={modeLocked}
        >
          中文
        </button>
        <button
          type="button"
          className={`typing-mode-btn ${mode === 'en' ? 'typing-mode-btn--active' : ''}`}
          onClick={() => handleModeChange('en')}
          disabled={modeLocked}
        >
          英文
        </button>
      </div>

      <div className={`typing-passage ${mode === 'zh' ? 'typing-passage--zh' : 'typing-passage--en'}`}>
        {targetChars.map((ch, i) => {
          const state = charState(i)
          const isCursor = state === 'cursor'
          const className = [
            'typing-char',
            `typing-char--${state}`,
            isCursor && isComposing ? 'typing-char--composing' : '',
          ].filter(Boolean).join(' ')
          return (
            <span key={i} className={className}>
              {ch}
            </span>
          )
        })}
      </div>

      {showStatusLine && (
        <div className="typing-status">
          <div className="typing-status-block">
            <span className="typing-status-label">已用時間</span>
            <span className="typing-status-value typing-status-value--time">{liveElapsedSec}</span>
          </div>
          <span className="typing-status-divider" />
          <div className="typing-status-block">
            <span className="typing-status-label">速度</span>
            <span
              className="typing-status-value typing-status-value--speed"
              style={liveSpeedDisplay === '--' ? { color: 'var(--typing-untyped)' } : undefined}
            >
              {liveSpeedDisplay}
            </span>
            <span className="typing-status-unit">{mode === 'zh' ? '字/分' : 'WPM'}</span>
          </div>
          <span className="typing-status-divider" />
          <div className="typing-status-block">
            <span className="typing-status-label">正確率</span>
            <span className="typing-status-value typing-status-value--accuracy">{liveAccuracyDisplay}</span>
            <span className="typing-status-unit">%</span>
          </div>
        </div>
      )}

      {!finished ? (
        <div className="typing-input-wrap">
          <input
            ref={inputRef}
            className={`typing-input ${paused ? 'typing-input--paused' : ''}`}
            type="text"
            value={typed}
            onChange={handleChange}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onBlur={handlePause}
            onFocus={handleResume}
            aria-label="打字輸入框"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
          />
          {paused && (
            <button
              type="button"
              className="typing-pause-chip"
              onClick={() => inputRef.current && inputRef.current.focus()}
            >
              已暫停 —— 點輸入框繼續
            </button>
          )}
        </div>
      ) : (
        <div className="typing-result-card">
          <p className="typing-result-title">測驗完成</p>
          <div className="typing-result-speed">
            {Math.round(speedValue)}
            <span className="typing-result-unit">{mode === 'zh' ? '字/分' : 'WPM'}</span>
          </div>
          <p className="typing-result-accuracy">正確率 {Math.round(accuracyValue)}%</p>

          <div className="typing-upload-row">
            <input
              className="typing-nickname-input"
              type="text"
              placeholder="你的暱稱"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              disabled={saving || saved}
            />
            <button
              type="button"
              className="typing-btn typing-btn--primary"
              onClick={handleUpload}
              disabled={saving || saved || !nickname.trim()}
            >
              {saving ? '儲存中...' : '上傳排名'}
            </button>
          </div>
          {saved && <p className="typing-upload-success">已上傳!你的成績已加入排行榜。</p>}
        </div>
      )}
    </div>
  )
}
