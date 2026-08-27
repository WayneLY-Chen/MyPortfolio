// 點狀思考球 —— 取代 .ai-spinner 那顆單純轉圈圈的圓環。
//
// 為什麼值得換掉轉圈圈:轉圈圈只說得出「還在忙」,說不出「忙什麼」。這個站有兩處
// 等待特別長 —— 面試出題實測 1.8–7.3 秒(極端值到 65 秒)、評分 2.5–6.7 秒 ——
// 這段時間全靠載入畫面撐住注意力,而多層不同速度的點環比單環轉圈圈更耐看。
//
// 【三個實作上的約束,都不是風格偏好】
//   1. DOM 要精簡:每環 6–8 顆點,總共 14 個節點。原始設計是三環 54 顆,
//      在手機上同時跑 54 個 opacity + transform 動畫會發熱。
//   2. 半徑必須跟著 size 縮放,否則同一個元件沒辦法同時服務 28px 的聊天泡泡
//      與 44px 的載入畫面。用 calc(var(--orb-size) * k) 而不是寫死 px。
//   3. prefers-reduced-motion 下所有旋轉與脈動全停(見 index.css)。
//      這是專案層級的約束,不是加分項。
//
// 樣式在 index.css(.orbs-*),因為 InterviewTab / FunPage / AIAssistant 三個
// 不同檔案共用它 —— 放在任何單一元件的 <style> 裡都會變成另外兩個的隱形相依。

// 每顆點的角度。ring1 八顆、ring2 六顆,兩環反向轉,交錯時會出現疏密變化。
const RING_1 = [0, 45, 90, 135, 180, 225, 270, 315]
const RING_2 = [0, 60, 120, 180, 240, 300]

// delay 讓脈動繞著環跑而不是整環一起亮。除以環的顆數 → 一圈剛好一個週期。
function dots(angles, radius) {
  return angles.map((deg, i) => (
    <span
      key={deg}
      className="orbs-dot"
      style={{
        '--orb-tf': `rotate(${deg}deg) translateX(calc(var(--orb-size) * ${radius}))`,
        animationDelay: `${((i / angles.length) * 1.8).toFixed(2)}s`,
      }}
    />
  ))
}

/**
 * @param {number} size   外框邊長(px)。28 給聊天泡泡,36–44 給載入畫面。
 * @param {string} label  給螢幕閱讀器的狀態描述。省略時整顆球對輔助技術隱藏
 *                        —— 旁邊通常已經有一行可見的狀態文字在講同一件事。
 */
export default function ThinkingOrbs({ size = 36, label }) {
  return (
    <div
      className="orbs"
      style={{ '--orb-size': `${size}px` }}
      role={label ? 'status' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : 'true'}
    >
      <span className="orbs-meridian" />
      <span className="orbs-ring orbs-ring--1">{dots(RING_1, 0.42)}</span>
      <span className="orbs-ring orbs-ring--2">{dots(RING_2, 0.26)}</span>
    </div>
  )
}
