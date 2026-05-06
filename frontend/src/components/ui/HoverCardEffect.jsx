import { useState } from "react"
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from "framer-motion"
import { Star } from "lucide-react"
import { cn } from "../../lib/utils"

// 響應式格線：電腦 3 欄、平板 2 欄、手機 1 欄（用 CSS-in-JS + <style> tag）
// 響應式格線：電腦 5 欄、平板 3 欄、手機 1 欄（用 CSS-in-JS + <style> tag）
const GRID_STYLE_ID = "hover-card-grid-style"

function injectGridStyle() {
  if (typeof document === "undefined") return
  if (document.getElementById(GRID_STYLE_ID)) return
  const style = document.createElement("style")
  style.id = GRID_STYLE_ID
  style.textContent = `
    .hce-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 22px;
      padding: 32px 0;
      box-sizing: border-box;
      width: 100%;
      margin: 0;
      align-items: stretch;
    }
    @media (max-width: 1400px) {
      .hce-grid { grid-template-columns: repeat(4, 1fr); }
    }
    @media (max-width: 1100px) {
      .hce-grid { grid-template-columns: repeat(3, 1fr); }
    }
    @media (max-width: 800px) {
      .hce-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 500px) {
      .hce-grid { grid-template-columns: 1fr; }
    }
    .hce-card-wrapper {
      position: relative;
      display: block;
      height: 100%;
      cursor: pointer;
    }
    .hce-card {
      display: flex;
      flex-direction: column;
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 14px;
      overflow: hidden;
      background: rgba(255,255,255,0.02);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease;
      height: 100%;
      position: relative;
      z-index: 20;
    }
    .hce-card-wrapper:hover .hce-card {
      transform: translateY(-5px);
      box-shadow: 0 16px 48px rgba(0,0,0,0.6);
      border-color: rgba(200, 148, 42, 0.3);
    }
    /* Blog Style Cover */
    .hce-cover {
      position: relative;
      height: 160px;
      overflow: hidden;
      flex-shrink: 0;
      background: #0b0b0d;
    }
    .hce-lang-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 4px;
      display: flex;
      z-index: 2;
    }
    .hce-cover img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.6s cubic-bezier(0.19, 1, 0.22, 1);
    }
    .hce-card-wrapper:hover .hce-cover img {
      transform: scale(1.08);
    }
    .hce-cover-overlay {
      position: absolute;
      inset: 0;
      background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 60%);
      display: flex;
      align-items: flex-end;
      padding: 14px 16px;
    }
    .hce-cover-title {
      font-family: var(--font-display);
      font-size: 15.5px;
      font-weight: 700;
      color: #fff;
      line-height: 1.4;
      text-shadow: 0 2px 8px rgba(0,0,0,0.6);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      letter-spacing: 0.01em;
    }
    .hce-body {
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      flex: 1;
    }
    .hce-desc {
      margin-top: 0;
      color: rgba(255,255,255,0.3);
      font-size: 13px;
      line-height: 1.7;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      height: calc(1.7em * 2); /* Premium Grid Sync */
      margin-bottom: 20px;
      letter-spacing: 0.01em;
      transition: color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .hce-card-wrapper:hover .hce-desc {
      color: rgba(255,255,255,0.55);
    }
    .hce-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: auto;
      padding-top: 12px;
      border-top: 1px solid rgba(255,255,255,0.04);
      height: 40px;
      flex-shrink: 0;
      overflow: hidden;
    }
    .hce-status-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .hce-stars {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      color: #C8942A;
      font-weight: 800;
    }
    .hce-tag {
      font-size: 10px;
      letter-spacing: 0.05em;
      padding: 2px 7px;
      border-radius: 4px;
      background: rgba(200, 148, 42, 0.12);
      color: #C8942A;
      text-transform: uppercase;
      font-weight: 800;
      border: 1px solid rgba(200, 148, 42, 0.2);
    }
  `
  document.head.appendChild(style)
}

// 3D Tilt 傾斜元件
function TiltCard({ children, onClick, onMouseEnter, onMouseLeave }) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)

  const mouseX = useSpring(x, { stiffness: 300, damping: 30 })
  const mouseY = useSpring(y, { stiffness: 300, damping: 30 })

  const rotateX = useTransform(mouseY, [-0.5, 0.5], ['10deg', '-10deg'])
  const rotateY = useTransform(mouseX, [-0.5, 0.5], ['-10deg', '10deg'])

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const xPos = (e.clientX - rect.left) / rect.width - 0.5
    const yPos = (e.clientY - rect.top) / rect.height - 0.5
    x.set(xPos)
    y.set(yPos)
  }

  const handleMouseLeave = (e) => {
    x.set(0)
    y.set(0)
    if (onMouseLeave) onMouseLeave(e)
  }

  const handleMouseEnter = (e) => {
    if (onMouseEnter) onMouseEnter(e)
  }

  return (
    <motion.div
      className="hce-card-wrapper"
      style={{
        rotateX,
        rotateY,
        transformStyle: 'preserve-3d',
        transformOrigin: 'center center',
      }}
      whileHover={{ scale: 1.02 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={handleMouseEnter}
      onClick={onClick}
    >
      {children}
    </motion.div>
  )
}

const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5',
  HTML: '#e34c26', CSS: '#563d7c', SCSS: '#c6538c', Vue: '#41b883',
  Go: '#00ADD8', Rust: '#dea584', Java: '#b07219', 'C++': '#f34b7d',
  C: '#555555', Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138',
  Kotlin: '#A97BFF', Dart: '#00B4AB', Shell: '#89e051',
}

export const HoverEffect = ({ items, className }) => {
  const [hoveredIndex, setHoveredIndex] = useState(null)
  injectGridStyle()

  return (
    <div className={`hce-grid${className ? " " + className : ""}`}>
      {items.map((item, idx) => (
        <div
          key={item?.link || idx}
          style={{ perspective: '800px' }}
        >
          <TiltCard
            onClick={() => item.onClick && item.onClick(item)}
            onMouseEnter={() => setHoveredIndex(idx)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {/* 移除懸停時的背景光暈，僅保留 3D 翻牌 */}

            <Card>
              {/* 部落格樣式封面 (大圖 + 漸層標題) */}
              <div className="hce-cover">
                {item.image ? (
                  <img src={item.image} alt={item.title} onError={e => { e.target.style.display = 'none' }} />
                ) : (
                  <div className="hce-card-cover-gradient" style={{ background: 'linear-gradient(45deg, #1a1a1e, #0e0a06)' }} />
                )}
                <div className="hce-cover-overlay">
                  <h4 className="hce-cover-title">{item.title}</h4>
                </div>
                {item.language_stats && Object.keys(item.language_stats).length > 0 && (
                  <div className="hce-lang-bar">
                    {Object.entries(item.language_stats).map(([lang, pct]) => (
                      <div key={lang} title={`${lang}: ${pct}%`} style={{ width: `${pct}%`, background: LANG_COLORS[lang] || '#888', height: '100%' }} />
                    ))}
                  </div>
                )}
              </div>

              {/* 卡片客體 (描述、標籤、星星) */}
              <div className="hce-body">
                <p className="hce-desc">{item.description || "暫無描述"}</p>

                <div className="hce-footer">
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', overflow: 'hidden', alignItems: 'center' }}>
                    {(item.topics || []).slice(0, 3).map(t => (
                      <span key={t} className="hce-tag" style={{ whiteSpace: 'nowrap' }}>
                        {t}
                      </span>
                    ))}
                    {(!item.topics || item.topics.length === 0) && <div />}
                  </div>
                  
                  {item.stars > 0 && (
                    <span className="hce-stars">
                      <Star size={12} fill="#C8942A" stroke="#C8942A" />
                      {item.stars}
                    </span>
                  )}
                </div>
              </div>
            </Card>
          </TiltCard>
        </div>
      ))}
    </div>
  )
}

export const Card = ({ children }) => (
  <div className="hce-card">
    {children}
  </div>
)

export const CardTitle = ({ children }) => (
  <h4 className="hce-title">{children}</h4>
)

export const CardDescription = ({ children }) => (
  <p className="hce-desc">{children || "暫無描述"}</p>
)
