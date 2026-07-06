import { useEffect, useRef } from 'react'

export default function Cursor() {
  const cursorRef = useRef(null)

  useEffect(() => {
    const cursor = cursorRef.current
    if (!cursor) return

    // Check if it's a touch device
    const isTouchDevice = ('ontouchstart' in window) || 
                         (navigator.maxTouchPoints > 0) || 
                         (navigator.msMaxTouchPoints > 0)
    
    // Don't run on touch devices
    if (isTouchDevice) return

    let mx = 0, my = 0, cx = 0, cy = 0
    let rafId = null
    let visible = false
    let ticking = false

    const onMouseMove = (e) => {
      mx = e.clientX
      my = e.clientY
      if (!visible) {
        cx = mx; cy = my
        visible = true
        cursor.style.opacity = '1'
        cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%)`
      }
      // 只在靜止時重新啟動 RAF，避免永久空轉
      if (!ticking) {
        ticking = true
        rafId = requestAnimationFrame(tick)
      }
    }

    const tick = () => {
      cx += (mx - cx) * 0.15
      cy += (my - cy) * 0.15
      cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%)`
      // 座標收斂後停止，不再空跑 RAF
      if (Math.abs(mx - cx) < 0.5 && Math.abs(my - cy) < 0.5) {
        ticking = false
        rafId = null
        return
      }
      rafId = requestAnimationFrame(tick)
    }

    const onMouseOver = (e) => {
      const target = e.target.closest('a, button, [role="button"], input, textarea, .clickable, .outline-item, .nav-login, label')
      if (target) cursor.classList.add('hovering')
      else cursor.classList.remove('hovering')
    }

    document.addEventListener('mousemove', onMouseMove, { passive: true })
    document.addEventListener('mouseover', onMouseOver, { passive: true })
    // RAF 改為 on-demand，由 mousemove 觸發，不在此啟動

    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseover', onMouseOver)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <>
      <style>{`
        #custom-cursor {
          position: fixed;
          top: 0; left: 0;
          width: 14px;
          height: 14px;
          background: #fff;
          border-radius: 50%;
          pointer-events: none;
          z-index: 9999999;
          mix-blend-mode: exclusion;
          opacity: 0;
          transition: width 0.3s cubic-bezier(0.2, 0, 0, 1), height 0.3s cubic-bezier(0.2, 0, 0, 1);
          will-change: transform, width, height;
        }
        
        /* Hide on touch devices */
        @media (hover: none) and (pointer: coarse) {
          #custom-cursor {
            display: none !important;
          }
        }
        
        #custom-cursor.hovering {
          width: 32px;
          height: 32px;
        }
      `}</style>
      <div id="custom-cursor" ref={cursorRef} />
    </>
  )
}
