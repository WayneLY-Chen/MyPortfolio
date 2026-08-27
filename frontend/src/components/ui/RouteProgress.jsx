// 換頁頂部細進度條(NProgress 風格)。
//
// 【誠實聲明:這條不是真的載入進度】
// 本站所有路由都是 eager import(App.jsx 沒有任何 React.lazy),所以「換頁」本身
// 不需要下載任何東西。真正的等待來自各頁自己的資料請求(Blog 抓文章、Projects
// 抓 GitHub),而那些頁面各自有自己的載入狀態。
//
// 那為什麼還要有它?因為在手機上點導覽列到畫面真的換掉之間,有一段 React 重新
// 渲染大頁面(FunPage 兩千多行)的空窗期,期間畫面完全沒有反應 —— 使用者會不確定
// 剛剛那一下到底有沒有點到。這條的職責就只有這個:「你點到了」。
//
// 所以它跑固定 ~400ms 就收掉,不假裝在等資料、也不停在 90% 等一個永遠不會來的
// 完成事件。要是哪天真的導入 code splitting,再把它接上 Suspense。
//
// 樣式在 index.css(.route-progress),z-index 8500 —— 必須低於 8999,
// body::after 的雜訊層疊在那個高度,爬上去會跟導覽列產生色差。

import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

export default function RouteProgress() {
  const { pathname } = useLocation()
  // width 用數字(0–100)而不是布林,才能做出「先衝再收」的兩段感覺。
  const [width, setWidth] = useState(0)
  const [visible, setVisible] = useState(false)
  const isFirstMount = useRef(true)
  const timers = useRef([])

  useEffect(() => {
    // 首次進站不觸發 —— 那是 Preloader 的場子,再疊一條進度條只是雜訊。
    if (isFirstMount.current) {
      isFirstMount.current = false
      return
    }

    // 連續快速換頁時,上一輪的 timer 必須清掉,否則舊的收尾會把新的一輪關掉。
    timers.current.forEach(clearTimeout)
    timers.current = []

    setVisible(true)
    setWidth(0)

    const push = (fn, ms) => timers.current.push(setTimeout(fn, ms))

    // 0 → 70:一個 frame 之後才設,否則和 setWidth(0) 在同一批更新裡被合併掉,
    // CSS transition 就沒有起點可以補間。
    push(() => setWidth(70), 20)
    push(() => setWidth(100), 260)
    push(() => setVisible(false), 420)
    // 收尾必須等淡出真的跑完才卸載。opacity 的 transition 是 0.15s 延遲 + 0.3s,
    // 從 420ms 起算要到 870ms 才淡完 —— 早於這個時間把 width 歸零會讓元件直接
    // 卸載,淡出被砍在一半,看起來是「啪」一聲不見而不是淡掉。
    push(() => setWidth(0), 900)

    return () => {
      timers.current.forEach(clearTimeout)
      timers.current = []
    }
  }, [pathname])

  if (!visible && width === 0) return null

  return (
    <div
      className="route-progress"
      style={{ width: `${width}%`, opacity: visible ? 1 : 0 }}
      aria-hidden="true"
    />
  )
}
