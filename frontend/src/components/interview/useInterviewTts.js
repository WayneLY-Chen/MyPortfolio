// 面試語音播放的唯一入口 —— D-31 的收斂點。
//
// 播放 / 停止 / 重聽 / 靜音 / 語速這五件事全部經過這個 hook。整個
// frontend/src/components/interview/ 目錄裡,只有這個檔案可以建立瀏覽器音訊
// 播放器實例;其他面試檔案連註解都不要出現那個建構式的字面,驗收會用目錄級的
// 字面掃描把關。
//
// 【為什麼要收斂在這裡 —— 給之後改這個檔案的人】
// 下一階段(音樂視覺化)會新增一個共用音訊頻道 store:背景音樂跨分頁續播,
// 遇到 TTS 時淡出暫停、TTS 結束後淡入接回。那項決策原文就點名會動到 Wobot
// 與這裡的面試官兩處。如果播放邏輯散落在各個面試元件裡,接 store 時就得翻修
// 整個面試 UI;收斂在這一個檔案之後,屆時只要改這裡的內部實作 ——
// speak() 開頭通知「TTS 開始」、結束/停止時通知「TTS 結束」,介面不必動。
// 這就是 D-31 存在的全部理由,請不要把播放器搬出去。
//
// 其他已鎖定的行為:
// - D-17 整題一次合成,不做分句。AIAssistant.jsx 的 splitForTts 是參考對象,
//   不是複製對象 —— 面試題只有一兩句,分句帶來的狀態複雜度(要跟重聽 / 停止 /
//   靜音三個控制交互)不划算。
// - D-21 失敗靜默降級:不 throw、不設錯誤狀態、不跳 toast,只留一行 console.warn。
//   題目照常顯示、面試繼續。語音是加分項,不是必要條件。
// - D-14 使用者點「開始面試」那一下就是 autoplay policy 需要的互動,之後每題自動播都合法。
// - 不讀 matchMedia:播放指示是純 CSS keyframes,prefers-reduced-motion 由 CSS 攔截,
//   這個 hook 只把 isPlaying 布林值往上傳。

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchQuestionAudio } from './interviewApi'
import { DEFAULT_SPEED, normalizeSpeed, resolveVoice } from './ttsOptions'

/**
 * @param {{
 *   language?: 'zh'|'en',
 *   muted?: boolean,            // 選填:由外部狀態機控管時傳入(受控模式)
 *   speed?: number,             // 選填:同上
 *   onMutedChange?: (next:boolean) => void,
 *   onSpeedChange?: (next:number) => void,
 * }} options
 */
export function useInterviewTts({
  language = 'zh',
  muted: mutedProp,
  speed: speedProp,
  onMutedChange,
  onSpeedChange,
} = {}) {
  // 受控 / 非受控兩用:面試狀態機也存了 muted 與 rate(切分頁保留),由它傳進來時
  // 以它為準,沒傳時 hook 自己管。兩份狀態各自為政是這裡最容易長出來的 bug,
  // 所以寧可多這幾行,也不要讓畫面上的靜音鈕與實際播放行為對不上。
  const [mutedState, setMutedState] = useState(false)
  const [speedState, setSpeedState] = useState(DEFAULT_SPEED)
  const muted = typeof mutedProp === 'boolean' ? mutedProp : mutedState
  const speed = normalizeSpeed(typeof speedProp === 'number' ? speedProp : speedState)

  const [isPlaying, setIsPlaying] = useState(false)

  const audioRef = useRef(null)
  const urlRef = useRef(null)
  const lastTextRef = useRef('')
  // 遞增的 session 編號(比照 AIAssistant.jsx 的 speakSessionRef):切到下一題或
  // 卸載時 session 就前進,先前那次合成即使晚回來也不會播出。
  const sessionRef = useRef(0)

  // 釋放目前這一顆音訊與它的 object URL。不動 session,呼叫端自行決定要不要作廢。
  const teardown = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.onended = null
      audio.onerror = null
      audio.pause()
      audioRef.current = null
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    sessionRef.current += 1 // 作廢仍在飛的合成請求
    teardown()
    setIsPlaying(false)
  }, [teardown])

  const speak = useCallback(
    async (text) => {
      const session = (sessionRef.current += 1)
      teardown()
      setIsPlaying(false)

      if (typeof text !== 'string' || !text.trim()) return
      // 重聽要用的原文先記下來:即使現在是靜音,取消靜音後仍然聽得到這一題。
      lastTextRef.current = text

      // 靜音時直接返回,不打 /ai/tts —— 省流量也省限流額度。
      if (muted) return

      const url = await fetchQuestionAudio({
        text,
        voice: resolveVoice(language),
        rate: speed,
      })

      // D-21:合成失敗只留一行 warn,不設任何錯誤狀態。
      if (!url) {
        console.warn('[AI Interview] 題目語音合成失敗,改以純文字繼續')
        return
      }

      // 這次合成已經過期(使用者切了下一題、按了停止、或元件已卸載)。
      if (sessionRef.current !== session) {
        URL.revokeObjectURL(url)
        return
      }

      const audio = new Audio(url)
      audioRef.current = audio
      urlRef.current = url

      const finish = () => {
        if (sessionRef.current !== session) return
        teardown()
        setIsPlaying(false)
      }
      audio.onended = finish
      audio.onerror = finish

      try {
        await audio.play()
        if (sessionRef.current !== session) {
          teardown()
          return
        }
        setIsPlaying(true)
      } catch (err) {
        // 瀏覽器擋掉自動播放也算靜默降級的一種,不讓面試因此中斷。
        console.warn('[AI Interview] 題目語音無法播放,改以純文字繼續')
        if (sessionRef.current === session) teardown()
        setIsPlaying(false)
      }
    },
    [language, muted, speed, teardown]
  )

  // 重聽這題:重新合成(換過語速的話,這一次才會套用新速度 —— 已下載的音訊不改速)。
  const replay = useCallback(() => speak(lastTextRef.current), [speak])

  const toggleMute = useCallback(() => {
    const next = !muted
    // 切成靜音時若正在播,立刻停。
    if (next) stop()
    if (onMutedChange) onMutedChange(next)
    if (typeof mutedProp !== 'boolean') setMutedState(next)
  }, [muted, mutedProp, onMutedChange, stop])

  const setSpeed = useCallback(
    (value) => {
      const next = normalizeSpeed(value)
      // 只改設定,不重播 —— 下一次 speak() / replay() 才套用(重新合成)。
      if (onSpeedChange) onSpeedChange(next)
      if (typeof speedProp !== 'number') setSpeedState(next)
    },
    [onSpeedChange, speedProp]
  )

  // 卸載時作廢進行中的合成並釋放 object URL。
  useEffect(() => {
    return () => {
      sessionRef.current += 1
      teardown()
    }
  }, [teardown])

  return { speak, stop, replay, isPlaying, muted, toggleMute, speed, setSpeed }
}

export default useInterviewTts
