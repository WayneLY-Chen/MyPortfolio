import { useEffect } from 'react'
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// 任務 4：確認不設 ScrollTrigger.defaults({ scroller })，
// 依賴 lenis.on('scroll', ScrollTrigger.update) 來驅動 ScrollTrigger
// ScrollTrigger 預設 scroller 為 window/document.documentElement，與 Lenis 相容

let lenisInstance = null

export function getLenis() {
  return lenisInstance
}

export default function useLenis(enabled = true) {
  useEffect(() => {
    if (!enabled) return
    // 防止瀏覽器預設的捲動還原，因為它會跟 Lenis 跟 ScrollTrigger 計算衝突
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }

    // Lenis 設定：lerp 0.12 讓虛擬滾動快速追上實際位置，
    // 減少在 pin 邊界附近的震盪，避免 ScrollTrigger 反覆觸發 onEnter/onLeave
    lenisInstance = new Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 1 })

    // 將 Lenis 與 GSAP Ticker 綁定 (這對於 ScrollTrigger Pin 能否順滑釋放是絕對必要的！)
    // 必須使用 time * 1000 讓兩者的時鐘完全同步
    const tickerFn = (time) => {
      lenisInstance?.raf(time * 1000)
    }
    gsap.ticker.add(tickerFn)

    // 關閉 GSAP 的滯後平滑，因為 Lenis 需要無縫連續的時間輸入
    gsap.ticker.lagSmoothing(0)

    // 每次 Lenis 滾動時通知 ScrollTrigger 立即更新
    const handleScroll = () => {
      ScrollTrigger.update()
    }
    lenisInstance.on('scroll', handleScroll)

    // 延遲 refresh，確保所有元件的 ScrollTrigger 都已初始化完成
    // 只在用戶尚未滾動時才 refresh，避免 refresh 觸發 Hero pin 的 unpin/repin 閃爍
    const refreshTimer = setTimeout(() => {
      if (window.scrollY < 10) {
        ScrollTrigger.refresh()
      }
    }, 500)

    return () => {
      clearTimeout(refreshTimer)
      gsap.ticker.remove(tickerFn)
      if (lenisInstance) {
        lenisInstance.off('scroll', handleScroll)
        lenisInstance.destroy()
        lenisInstance = null
      }
    }
  }, [enabled])
}
