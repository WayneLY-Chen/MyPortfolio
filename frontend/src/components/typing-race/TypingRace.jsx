import { useEffect, useRef, useState } from 'react'
import { Trophy } from 'lucide-react'
import { API_URL } from '../../config/api'
import { useToast } from '../ui/Toast'
import { ZH_SENTENCES, EN_SENTENCES } from './typingCorpus'
import {
  toChars,
  markWrongIndices,
  isComplete,
  deletesCommitted,
  clampToTarget,
  calcAccuracy,
  calcWpmEn,
  calcCpmZh,
  calcElapsedMs,
  pickNextSentence,
  ACCURACY_THRESHOLD,
  MIN_ELAPSED_FOR_LIVE_SPEED_MS,
} from './typingEngine'

// TypingRace —— 打字競速主要元件(03-01 tracer + 03-03 進行中回饋)。
//
// 核心狀態架構:`typed` 永遠原封不動鏡射 e.target.value(供受控 input 使用,
// 不能被組字打斷);`settled` 只在組字結束或非組字輸入時才更新,是比對/著色/
// 完成判定的唯一依據。isComposingRef 是「目前是否在組字中」的唯一真相來源
// (見 03-RESEARCH.md Pattern 1)。everWrongRef 用全量重算模型(Pattern 2),
// 只增不刪。
//
// 嚴格模式(D-31/D-32,2026-08-02,取代 D-13/D-14):已上屏字元(settledRef)一律
// 不可刪除——handleChange 前置一道用 deletesCommitted() 判斷的前綴不變式守衛,
// 命中即擋下並把 DOM value 寫回,IME 組字緩衝區內的編輯不受影響。completion 條件
// 也從「逐字完全相等」改為「輸入字數達到題目字數」(isComplete),未修正的錯字
// 不再擋住測驗結束;超長輸入由 clampToTarget() 截斷。everWrongRef 的永久性因此
// 從「規則規定不還清白」變成「結構上根本改不了」——已上屏字元既然不可修改,
// 全量重算結果天然只增不減。
//
// 03-03 新增:即時統計列(D-16,由 setInterval 驅動的 tick state 逼出重新渲染,
// 實際時間計算走 calcElapsedMs 純函式)、失焦暫停(D-17,pausedAtRef/
// totalPausedMsRef 排除暫停時長)、打錯字視覺回饋(D-18,ref 直接操作 class
// 強制 reflow,並依 prefers-reduced-motion 切換抖動/瞬時外框兩種路徑)。
//
// 03-04 補完:完整結果卡(D-26)、上傳門檻事前灰化(D-25)、暱稱前端驗證
// (D-23)、行動裝置適配(D-06/INT-02)。
//
// D-23:暱稱規則逐字沿用 backend/src/config/leaderboardValidation.js 的
// NICKNAME_STRICT_RE——專案沒有 monorepo,前後端規則各自維護一份,任何一邊
// 改動都要同步修改另一邊,否則會出現「前端擋不住、後端擋得住」或反過來的落差。
const NICKNAME_STRICT_RE = /^[一-鿿A-Za-z0-9_]{1,12}$/

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
  const flashTimeoutRef = useRef(null) // D-18:reduced-motion 瞬間外框的移除計時器
  // D-31:settled 的 ref 版本,守衛必須讀這個而不是 settled state——組字相關事件
  // 是連續多個原生事件,同一輪事件內讀 state 會拿到舊值,與 isComposingRef 是
  // 同一個理由的先例。runComparison 設定 settled 的同時同步寫入這裡。
  const settledRef = useRef('')
  const lockedFlashTimeoutRef = useRef(null) // D-33:刪除被擋下的中性外框移除計時器(獨立於 flashTimeoutRef,兩者可能同時在計時)

  const [paused, setPaused] = useState(false)
  const [, setLiveTick] = useState(0) // D-16:每 200ms 遞增以驅動即時統計列重新渲染

  // D-26:榜首資料由本元件自行抓取,與左側 Leaderboard 各自獨立、不共用 state
  // (Leaderboard 不 export 其內部 scores)。topScoreLoaded 用來避免資料抓回來前
  // 顯示錯誤的差距情境。
  const [topScore, setTopScore] = useState(null)
  const [topScoreLoaded, setTopScoreLoaded] = useState(false)

  // D-18:沿用全站唯一既有先例(Footer.jsx:5)的寫法,全站無全域 CSS 層級的
  // prefers-reduced-motion 規則可依賴,必須自己在 JS 層判斷。
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

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

  // D-18:打錯字的一次性視覺回饋。用 ref 直接操作 DOM class 並強制 reflow,
  // 而非 React state toggle——連續打錯的間隔可能小於動畫時長,state 值不變
  // 會讓 React 判定不需要重渲染,動畫因此不會重播(03-RESEARCH.md Pattern 3)。
  const triggerWrongFeedback = () => {
    const el = inputRef.current
    if (!el) return
    if (prefersReducedMotion) {
      // 降級路徑:紅底本身已持續存在,這裡只疊加一次無過渡效果的瞬間外框
      clearTimeout(flashTimeoutRef.current)
      el.classList.remove('typing-flash-wrong')
      void el.offsetWidth // 強制 reflow
      el.classList.add('typing-flash-wrong')
      flashTimeoutRef.current = setTimeout(() => {
        el.classList.remove('typing-flash-wrong')
      }, 180)
    } else {
      el.classList.remove('typing-shake')
      void el.offsetWidth // 強制 reflow,讓瀏覽器「忘記」剛剛移除過這個 class
      el.classList.add('typing-shake')
    }
  }

  // D-33:被擋下的刪除給「中性」回饋,刻意不重用 triggerWrongFeedback()——那個
  // 回饋在 D-18 語意裡等同「你剛剛打錯一個字」的計分事件訊號,拿來表示刪除被擋
  // 會讓使用者誤以為又被扣了一次分,正是這次要消滅的困惑。手法沿用同一套
  // classList.remove → 強制 reflow → classList.add(連續觸發時才會重播),但用
  // 獨立的 class 與獨立的 timeout ref,不與 flashTimeoutRef 共用(兩者可能同時
  // 在計時)。
  const triggerLockedFeedback = () => {
    const el = inputRef.current
    if (!el) return
    clearTimeout(lockedFlashTimeoutRef.current)
    el.classList.remove('typing-locked-flash')
    void el.offsetWidth // 強制 reflow
    el.classList.add('typing-locked-flash')
    lockedFlashTimeoutRef.current = setTimeout(() => {
      el.classList.remove('typing-locked-flash')
    }, 200)
  }

  // 全量重算的逐字比對(Pattern 2):每次「值已確定」都拿完整字串重新掃一次。
  // D-31:進入函式後先截斷超長輸入,markWrongIndices/setSettled/isComplete 全部
  // 改用截斷後的值——截斷值同時也是速度計算的來源(settled),否則超打的字元
  // 會灌水 calcCpmZh/calcWpmEn 的字元數。截斷一旦發生也把受控值同步成截斷值,
  // 避免輸入框留下超過題目長度的文字。這條路徑不需要額外的 DOM value 回寫
  // (與 handleChange 的前綴守衛不同):長度一旦達標就立刻進入結果卡、輸入框
  // 隨之卸載。runComparison 只會在非組字或 compositionEnd 時被呼叫,符合
  // clampToTarget 「不得在組字進行中呼叫」的使用前提。
  const runComparison = (rawValue) => {
    const value = clampToTarget(rawValue, target)
    if (value !== rawValue) setTyped(value)

    const wrongCountBefore = everWrongRef.current.size
    markWrongIndices(value, target, everWrongRef.current)
    if (everWrongRef.current.size > wrongCountBefore) {
      // 只有「這次輸入產生了新錯字」才觸發回饋,不是「目前存在任何錯字」就抖
      triggerWrongFeedback()
    }
    setSettled(value)
    settledRef.current = value
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
    const composing = isComposingRef.current || e.nativeEvent?.isComposing

    // D-31:前綴不變式守衛——必須放在 beginTimerIfNeeded() 之前,一次被拒絕的
    // 按鍵不應該啟動計時器。組字進行中(composing 為 true)一律不執行這段拒絕/
    // 還原邏輯,維持現行的純鏡射行為:若在組字中強制把 DOM value 寫回已上屏
    // 字串,會直接破壞 IME 狀態,這是不可妥協的約束(注音組字緩衝區的
    // Backspace 必須能用)。不新增 onKeyDown 或任何按鍵層攔截器——判斷準則是
    // 前綴不變式,天生與按鍵事件、組字狀態的判斷正確與否無關。
    if (!composing && deletesCommitted(value, settledRef.current)) {
      const settledValue = settledRef.current
      // 兩件事都要做,不能只做 setter:受控 input 在「新 state 與現有 state
      // 相等」時 React 會跳過重新渲染,DOM 就會停留在使用者剛剛刪掉的那個值,
      // 守衛表面上生效實際上沒生效——這是這個任務最容易寫錯的一行。
      e.target.value = settledValue
      setTyped(settledValue)
      triggerLockedFeedback()
      return
    }

    setTyped(value) // 永遠鏡射,不論是否組字中——避免打斷 IME 候選字視窗
    beginTimerIfNeeded()

    // 優先信任自己的 ref;e.nativeEvent.isComposing 當次要保險(Safari 不穩定)
    if (composing) return
    runComparison(value) // 非組字輸入(英文直接鍵入、刪除鍵、貼上)才即時比對
  }

  // D-17:輸入框失焦時自動暫停。尚未開始或已結束就不需要暫停。
  const handlePause = () => {
    if (!startTimeRef.current || finished) return
    setPaused(true)
    pausedAtRef.current = Date.now()
  }

  // D-17:輸入框重新取得焦點時恢復,並把這段暫停時長累加進總計。
  // 行動裝置(D-06/INT-02):同一個 onFocus 事件也負責把輸入框捲到軟體鍵盤
  // 彈出後仍可見的位置——這兩件事共用同一個焦點事件,不需要另外綁一個 handler。
  const handleResume = () => {
    if (pausedAtRef.current) {
      totalPausedMsRef.current += Date.now() - pausedAtRef.current
      pausedAtRef.current = null
    }
    setPaused(false)
    if (inputRef.current) {
      inputRef.current.scrollIntoView({
        block: 'center',
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      })
    }
  }

  // D-16:測驗進行中(未暫停、未結束)每 200ms 逼出一次重新渲染,驅動即時統計列。
  // 暫停或結束時清除計時器,讓數字自然凍結在原地。
  useEffect(() => {
    if (!started || finished || paused) return
    const id = setInterval(() => setLiveTick((t) => t + 1), 200)
    return () => clearInterval(id)
  }, [started, finished, paused])

  // 元件卸載時清除瞬間外框的計時器,避免對已卸載元件操作 DOM。
  useEffect(() => {
    return () => {
      clearTimeout(flashTimeoutRef.current)
      clearTimeout(lockedFlashTimeoutRef.current)
    }
  }, [])

  // D-26:測驗結束時才抓一次榜首,與左側 Leaderboard 各自獨立查詢、不共用 state。
  // 查詢失敗或榜單是空的都退回「排行榜是空的」那個情境的文案。
  useEffect(() => {
    if (!finished) return
    let cancelled = false
    const gameType = mode === 'zh' ? 'typing_zh' : 'typing_en'
    fetch(`${API_URL}/leaderboard?game=${gameType}&limit=1`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        const list = Array.isArray(d) ? d : (d?.data && Array.isArray(d.data) ? d.data : [])
        setTopScore(list.length > 0 ? list[0].score : null)
        setTopScoreLoaded(true)
      })
      .catch((err) => {
        console.error('[TypingTopScore Error]', err)
        if (cancelled) return
        setTopScore(null)
        setTopScoreLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [finished, mode])

  const resetRun = (list, nextIndex) => {
    setTyped('')
    setSettled('')
    setIsComposing(false)
    setStarted(false)
    setFinished(false)
    setNickname('')
    setSaved(false)
    setPaused(false)
    setTopScore(null)
    setTopScoreLoaded(false)
    isComposingRef.current = false
    startTimeRef.current = null
    everWrongRef.current = new Set()
    finishedElapsedRef.current = 0
    pausedAtRef.current = null
    totalPausedMsRef.current = 0
    settledRef.current = ''
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

  // 「重來」:同一題重新開始,中途重來不計分不上傳。
  const handleRestartSame = () => {
    resetRun(sentenceList, sentenceIndex)
  }

  // 「換一題」/ 結果卡「再玩一次」:抽新題(D-08 保證不連續抽到同一題),
  // 同模式直接回到測驗畫面——兩者行為相同,只是入口不同。
  const handleNextSentence = () => {
    resetRun(sentenceList, pickNextSentence(sentenceList, sentenceIndex))
  }

  // D-25:正確率門檻與暱稱格式都是事前 UX 層攔阻,後端仍是最終把關——這裡的
  // 兩個 guard 只是防禦性重複檢查(按鈕本身已經 disabled),不取代後端驗證。
  const handleUpload = async () => {
    const name = nickname.trim()
    if (!name || !NICKNAME_STRICT_RE.test(name) || saving) return
    if (Math.round(accuracyValue) < ACCURACY_THRESHOLD) return
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
      if (!res.ok) {
        // D-35:內容檢查刻意只在伺服器端做(黑名單本身不進前端 bundle),
        // 所以後端 400 的 error 訊息必須原樣呈現給使用者——這裡也順帶修好
        // 分數上限、正確率門檻、game_type 三種既有 400,原本全部被下面
        // catch 的回退字串蓋掉,誤導成「連線失敗」。
        let serverMessage = '連線伺服器失敗,請稍後再試'
        try {
          const body = await res.json()
          if (body && typeof body.error === 'string' && body.error) {
            serverMessage = body.error
          }
        } catch {
          // 回應不是合法 JSON 或空 body,保留上面的回退字串。
        }
        addToast({ title: '上傳失敗', description: serverMessage, variant: 'error' })
        return
      }
      setSaved(true)
      addToast({
        title: '上傳成功',
        description: `你的成績已加入${mode === 'zh' ? '中文' : '英文'}排行榜!`,
        variant: 'success',
      })
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

  const speedUnitLabel = mode === 'zh' ? '字/分' : 'WPM' // D-29:單位不共用同一個詞
  const totalSeconds = finished ? Math.round(finishedElapsedRef.current / 1000) : 0
  const totalChars = targetChars.length
  const wrongCount = everWrongRef.current.size

  // D-26:榜首差距三種互斥情境——使用者是榜首 / 落後 / 排行榜是空的。
  // myScore 與 handleUpload 實際送出的 score 口徑一致(四捨五入整數)。
  const myScore = Math.round(speedValue)
  let gapState = null
  if (topScoreLoaded) {
    if (topScore === null) gapState = 'empty'
    else if (myScore >= topScore) gapState = 'top'
    else gapState = 'behind'
  }
  const gap = gapState === 'behind' ? topScore - myScore : 0

  // D-23:前端暱稱格式驗證,與後端 NICKNAME_STRICT_RE 逐字一致。
  const nicknameTrimmed = nickname.trim()
  const nicknameValid = NICKNAME_STRICT_RE.test(nicknameTrimmed)
  // D-25:正確率門檻取自 typingEngine.js 的 ACCURACY_THRESHOLD,不寫死 90。
  const accuracyMet = Math.round(accuracyValue) >= ACCURACY_THRESHOLD
  const canUpload = !saving && !saved && nicknameValid && accuracyMet

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

        .typing-shake {
          animation: typing-shake 220ms ease-in-out;
        }
        @keyframes typing-shake {
          0% { transform: translateX(0); }
          15% { transform: translateX(-4px); }
          30% { transform: translateX(4px); }
          45% { transform: translateX(-3px); }
          60% { transform: translateX(3px); }
          75% { transform: translateX(-1px); }
          90% { transform: translateX(1px); }
          100% { transform: translateX(0); }
        }
        .typing-flash-wrong {
          outline: 2px solid var(--typing-wrong-text);
          outline-offset: 2px;
        }
        .typing-locked-flash {
          /* D-33:被擋下的刪除,中性瞬時外框——沒有位移也沒有補間動畫(刻意不宣告
             transition),語彙是「這裡是鎖著的」而非「你錯了」,因此不需要
             prefers-reduced-motion 分支。不得使用 --typing-wrong-bg / --typing-wrong-text
             這組錯誤色票,以免使用者誤讀成又被扣分。 */
          outline: 2px solid var(--muted);
          outline-offset: 2px;
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
        .typing-result-primary { margin-bottom: 8px; }
        .typing-result-speed-label,
        .typing-result-accuracy-label {
          font-family: var(--font-sans);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--muted);
          margin-top: 4px;
        }
        .typing-result-accuracy {
          margin-top: 16px;
          font-family: var(--font-sans);
          font-size: 24px;
          font-weight: 800;
        }

        .typing-result-rows { margin-top: 24px; text-align: left; }
        .typing-result-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 12px 0;
          border-bottom: 1px solid var(--border);
          font-family: var(--font-sans);
        }
        .typing-result-row-label {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.1em;
          color: var(--muted);
        }
        .typing-result-row-value { font-size: 14px; font-weight: 400; color: var(--fg); }

        .typing-review-section { margin-top: 24px; text-align: left; }
        .typing-review-title {
          font-family: var(--font-sans);
          font-size: 14px;
          font-weight: 800;
          color: var(--fg);
          margin-bottom: 8px;
        }
        .typing-review-perfect {
          font-family: var(--font-sans);
          font-size: 14px;
          color: var(--typing-correct);
          margin-bottom: 8px;
        }
        .typing-review { font-size: 16px; line-height: 1.8; letter-spacing: 0.02em; color: var(--fg); }
        .typing-review-char { color: var(--fg); }
        .typing-review-char--wrong {
          background: var(--typing-wrong-bg);
          color: var(--typing-wrong-text);
          border-radius: 2px;
        }

        .typing-gap-banner {
          margin-top: 24px;
          padding: 14px 20px;
          border-radius: 8px;
          border: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-family: var(--font-sans);
          font-size: 14px;
          color: var(--fg);
        }
        .typing-gap-banner--top { border-color: var(--accent); font-weight: 800; }
        .typing-gap-banner--behind { border-color: var(--border); }

        .typing-actions {
          display: flex;
          gap: 12px;
          margin-top: 24px;
          justify-content: center;
        }
        .typing-actions--inline { margin-top: 16px; }
        @media (max-width: 480px) {
          .typing-actions { flex-direction: column; }
        }

        .typing-btn--secondary {
          background: none;
          border: 1px solid var(--border);
          color: var(--fg);
        }
        .typing-btn--secondary:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }

        .typing-upload-row {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          margin-top: 24px;
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
        .typing-hint {
          font-family: var(--font-sans);
          font-size: 12px;
          color: var(--muted);
          text-align: center;
          margin: 0;
        }
        .typing-hint--warning { color: var(--typing-wrong-text); }
        .typing-nickname-error {
          font-family: var(--font-sans);
          font-size: 12px;
          color: var(--typing-wrong-text);
          text-align: center;
          margin: 0;
        }
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
        .typing-btn:disabled,
        .typing-btn--disabled { opacity: 0.4; cursor: not-allowed; }
        .typing-upload-success { margin-top: 12px; color: var(--accent); font-size: 14px; }

        .typing-mobile-hint {
          display: none;
          font-family: var(--font-sans);
          font-size: 14px;
          color: var(--muted);
          margin: 0 0 16px;
        }
        @media (max-width: 768px) {
          .typing-mode-btn, .typing-btn { min-height: 44px; }
          .typing-mobile-hint { display: block; }
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

      {/* D-06:不偵測裝置,純 CSS 媒體查詢在 ≤768px 顯示;開始測驗後不佔用版面。 */}
      {!started && <p className="typing-mobile-hint">建議使用電腦鍵盤以取得最佳成績</p>}

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
        <>
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
            {/* D-33:常駐說明文字——事先講清楚規則,第一次被擋下時就不會意外;
                也是無障礙路徑,螢幕閱讀器使用者靠這行常駐文字取得規則,不依賴
                視覺閃動。重用既有 .typing-hint class,不新增樣式。 */}
            <p className="typing-hint">不能退格 —— 打錯的字會直接算進錯字數</p>
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
          <div className="typing-actions typing-actions--inline">
            <button type="button" className="typing-btn typing-btn--secondary" onClick={handleRestartSame}>
              重來
            </button>
            <button type="button" className="typing-btn typing-btn--secondary" onClick={handleNextSentence}>
              換一題
            </button>
          </div>
        </>
      ) : (
        <div className="typing-result-card">
          <p className="typing-result-title">測驗完成</p>

          <div className="typing-result-primary">
            <div className="typing-result-speed">
              {Math.round(speedValue)}
              <span className="typing-result-unit">{speedUnitLabel}</span>
            </div>
            <p className="typing-result-speed-label">打字速度</p>

            <div
              className="typing-result-accuracy"
              style={{ color: accuracyMet ? 'var(--typing-correct)' : 'var(--typing-wrong-text)' }}
            >
              {Math.round(accuracyValue)}%
            </div>
            <p className="typing-result-accuracy-label">正確率</p>
          </div>

          <div className="typing-result-rows">
            <div className="typing-result-row">
              <span className="typing-result-row-label">總秒數</span>
              <span className="typing-result-row-value">{totalSeconds}</span>
            </div>
            <div className="typing-result-row">
              <span className="typing-result-row-label">總字數</span>
              <span className="typing-result-row-value">{totalChars}</span>
            </div>
            <div className="typing-result-row">
              <span className="typing-result-row-label">錯字數</span>
              <span className="typing-result-row-value">{wrongCount}</span>
            </div>
          </div>

          <div className="typing-review-section">
            <p className="typing-review-title">作答回顧</p>
            {wrongCount === 0 && <p className="typing-review-perfect">完美!全程零失誤</p>}
            <div className={`typing-review ${mode === 'zh' ? 'typing-passage--zh' : 'typing-passage--en'}`}>
              {targetChars.map((ch, i) => (
                <span
                  key={i}
                  className={`typing-review-char ${everWrongRef.current.has(i) ? 'typing-review-char--wrong' : ''}`}
                >
                  {ch}
                </span>
              ))}
            </div>
          </div>

          {topScoreLoaded && (
            <div
              className={`typing-gap-banner ${
                gapState === 'behind' || !accuracyMet
                  ? 'typing-gap-banner--behind'
                  : 'typing-gap-banner--top'
              }`}
            >
              {/* 正確率未達門檻時,速度再快也不會進榜(D-25 已灰化上傳鈕)。
                  此時若照說「你就是榜首」/「你將成為第一位」,畫面等於一邊宣告
                  你贏了、一邊拒絕你上傳,自相矛盾。改為保留「你確實有那個速度」
                  的事實、同時講明差在哪 —— 這比單純藏起來更貼近 D-26 的本意
                  (製造再玩一場的動機),因為它明確告訴使用者要補的是正確率。 */}
              {gapState === 'top' && accuracyMet && (
                <>
                  <Trophy size={18} />
                  <span>🏆 你就是目前的榜首!</span>
                </>
              )}
              {gapState === 'empty' && accuracyMet && (
                <span>目前還沒有人上榜,你將成為第一位!</span>
              )}
              {(gapState === 'top' || gapState === 'empty') && !accuracyMet && (
                <span>
                  這個速度足以排第 1 —— 但正確率 {Math.round(accuracyValue)}% 未達{' '}
                  {ACCURACY_THRESHOLD}%,這次不列入排行榜
                </span>
              )}
              {gapState === 'behind' && (
                <span>
                  距離榜首還差 {gap} {speedUnitLabel}
                </span>
              )}
            </div>
          )}

          <div className="typing-upload-row">
            <input
              className="typing-nickname-input"
              type="text"
              placeholder="你的暱稱"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              disabled={saving || saved}
            />
            <p className="typing-hint">1–12 字,限中文、英數字或底線</p>
            {nicknameTrimmed.length > 0 && !nicknameValid && (
              <p className="typing-nickname-error">暱稱格式不符(1–12 字,限中文/英數字/底線)</p>
            )}
            {!accuracyMet && (
              <p className="typing-hint typing-hint--warning">
                正確率需達 {ACCURACY_THRESHOLD}% 才能上榜(你的成績:{Math.round(accuracyValue)}%)
              </p>
            )}
          </div>

          <div className="typing-actions">
            <button type="button" className="typing-btn typing-btn--primary" onClick={handleNextSentence}>
              再玩一次
            </button>
            <button
              type="button"
              className={`typing-btn typing-btn--secondary ${!canUpload ? 'typing-btn--disabled' : ''}`}
              onClick={handleUpload}
              disabled={!canUpload}
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
