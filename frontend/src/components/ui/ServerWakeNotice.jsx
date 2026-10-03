// 伺服器喚醒提示。
//
// 後端跑在 Render 免費方案,閒置會自動休眠(保活排程只在 08:00–24:00 跑,
// 深夜一定在睡),冷啟動要 50 秒以上。這段時間訪客點開專案或部落格,畫面
// 只會一直轉圈 —— 從訪客的角度看,那就是網站壞了。這個元件把一個「看起來
// 像 bug」的等待,換成一句誠實的說明。
//
// 做法:進站時打一次 /health。
//   - 2.5 秒內回應 → 後端醒著,什麼都不顯示(絕大多數情況)。
//   - 超過 2.5 秒 → 顯示「正在喚醒」,持續重試直到成功或 90 秒上限。
// 這個請求本身也順便把後端叫醒:訪客還在看首頁動畫時冷啟動就已經開始跑,
// 等他點進專案頁,後端多半已經好了。
//
// 整頁生命週期只跑一次(模組層旗標),路由切換不會重打。

import { useEffect, useState } from 'react'
import { HEALTH_URL } from '../../config/api'
import ThinkingOrbs from './ThinkingOrbs'

const SHOW_AFTER_MS = 2500     // 這麼快就回應的話,訪客根本不會察覺,不必打擾
const REQUEST_TIMEOUT_MS = 15000 // 單次請求上限;Render 冷啟動期間連線可能直接懸著
const RETRY_DELAY_MS = 3000
const GIVE_UP_AFTER_MS = 90000 // 冷啟動實測 50 秒上下,90 秒還沒好就是別的問題了

// 探測流程放在模組層,元件只負責訂閱狀態。
//
// 不能把迴圈寫在 useEffect 裡再用 cleanup 取消:開發模式的 StrictMode 會
// 「掛載 → 卸載 → 再掛載」一次,第一次卸載就把迴圈取消了,而「只跑一次」的
// 旗標又讓第二次掛載不再啟動 —— 結果是提示永遠不出現。探測本身有 90 秒上限、
// 不會無限跑,讓它跑完不取消是安全的。
let started = false
let current = 'idle' // 'idle' 不顯示 / 'waking' 喚醒中 / 'failed' 放棄
const listeners = new Set()

function setWakeStatus(next) {
  current = next
  listeners.forEach((fn) => fn(next))
}

async function pingOnce() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(HEALTH_URL, { signal: controller.signal, cache: 'no-store' })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

function startProbe() {
  if (started) return
  started = true
  const startedAt = Date.now()
  let resolved = false

  // 只有「超過 2.5 秒還沒好」才顯示。用計時器而不是等第一次請求失敗,
  // 因為冷啟動期間第一次請求可能一路懸到 15 秒逾時才回來。
  setTimeout(() => {
    if (!resolved) setWakeStatus('waking')
  }, SHOW_AFTER_MS)

  ;(async () => {
    for (;;) {
      if (await pingOnce()) {
        resolved = true
        setWakeStatus('idle')
        return
      }
      if (Date.now() - startedAt >= GIVE_UP_AFTER_MS) {
        resolved = true
        setWakeStatus('failed')
        return
      }
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
    }
  })()
}

export default function ServerWakeNotice() {
  const [status, setStatus] = useState(current)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    listeners.add(setStatus)
    setStatus(current)
    startProbe()
    return () => { listeners.delete(setStatus) }
  }, [])

  if (status === 'idle' || dismissed) return null

  const waking = status === 'waking'
  return (
    <div className="wake-notice" role="status" aria-live="polite">
      {waking && <ThinkingOrbs size={22} />}
      <span className="wake-notice-text">
        {waking
          ? '伺服器正在喚醒,大約需要 50 秒 —— 專案與部落格稍後就會出現'
          : '伺服器暫時沒有回應,請稍後再重新整理'}
      </span>
      <button
        type="button"
        className="wake-notice-close"
        onClick={() => setDismissed(true)}
        aria-label="關閉提示"
      >
        ×
      </button>
    </div>
  )
}
