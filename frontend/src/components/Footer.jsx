import { useEffect, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'

function Particles() {
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const count = typeof window !== 'undefined' && window.innerWidth < 768 ? 15 : 28

  // Freeze random values so they don't regenerate on every re-render
  const particles = useMemo(() => Array.from({ length: count }, () => ({
    size: Math.random() * 3 + 1.5,
    left: Math.random() * 100,
    delay: Math.random() * 5,
    duration: Math.random() * 6 + 5,
    drift: (Math.random() - 0.5) * 40,
    rise: 300 + Math.random() * 200,
    opacity: Math.random() * 0.4 + 0.15,
  })), [count])

  if (reduced) return null
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 1 }}>
      {particles.map((p, i) => (
        <motion.div
          key={i}
          style={{
            position: 'absolute',
            width: p.size, height: p.size,
            borderRadius: '50%',
            background: `rgba(200,148,42,${p.opacity})`,
            left: `${p.left}%`,
            bottom: '-10px',
            willChange: 'transform',
          }}
          animate={{ y: [0, -p.rise], x: [0, p.drift], opacity: [0, 0.8, 0] }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'easeOut' }}
        />
      ))}
    </div>
  )
}

const YEAR = new Date().getFullYear()

// SVG Icons
const IconGitHub = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
    <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
  </svg>
)

const IconCodePen = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
    <path d="M18.144 13.067l-4.144 2.762V21.5l7.5-5v-6.666l-3.356 3.233zM12 15.543L7.856 13.067 4.5 9.834v6.666l7.5 5 7.5-5V9.834L15.644 13.067 12 15.543zm6.144-4.61L21.5 7.5 12 1.5 2.5 7.5l3.356 3.433L12 8.457l6.144 2.476zM5.856 13.067L2.5 9.834V16.5l7.5 5v-5.671L5.856 13.067z"/>
  </svg>
)

const IconInstagram = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
)

const IconEmail = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <path d="M2 7l10 7 10-7"/>
  </svg>
)

const IconArrow = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.6 }}>
    <path d="M7 17L17 7M17 7H7M17 7v10"/>
  </svg>
)

// Sitemap icons
const IconPerson = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.5 }}>
    <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
  </svg>
)

const IconFolder = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.5 }}>
    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
  </svg>
)

const IconPen = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.5 }}>
    <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
)

const IconGame = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.5 }}>
    <rect x="2" y="6" width="20" height="12" rx="2"/>
    <path d="M6 12h4m-2-2v4"/><circle cx="16" cy="11" r="1" fill="currentColor"/><circle cx="18" cy="13" r="1" fill="currentColor"/>
  </svg>
)

const SOCIAL_LINKS = [
  { label: 'GitHub',    url: 'https://github.com/WayneLY-Chen',                    icon: <IconGitHub />,    external: true  },
  { label: 'CodePen',   url: 'https://codepen.io/WayneLY-Chen',                    icon: <IconCodePen />,   external: true  },
  { label: 'Instagram', url: 'https://www.instagram.com/mr.w_1022/?hl=zh-tw',      icon: <IconInstagram />, external: true  },
  { label: 'Email',     url: 'mailto:qweasd226410@gmail.com',                       icon: <IconEmail />,     external: false },
]

const NAV_LINKS = [
  { label: '關於我',   href: '/',         icon: <IconPerson /> },
  { label: '我的專案', href: '/projects', icon: <IconFolder /> },
  { label: '部落格',   href: '/blog',     icon: <IconPen />    },
  { label: '功能頁',   href: '/fun',      icon: <IconGame />   },
]

export default function Footer() {
  const scrollToTop = (e) => {
    e.preventDefault()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      <style>{`
        #footer {
          position: relative;
          background: #050505;
          color: var(--fg);
          padding: 40px 6vw 28px;
          border-top: 1px solid rgba(255,255,255,0.05);
          overflow: hidden;
        }
        .footer-bg-glow {
          position: absolute;
          top: -50%;
          left: 50%;
          transform: translateX(-50%);
          width: 600px;
          height: 400px;
          background: radial-gradient(circle, rgba(200,148,42,0.04) 0%, transparent 70%);
          pointer-events: none;
        }
        .footer-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
          position: relative;
          z-index: 2;
        }
        .footer-title {
          font-family: var(--font-sans);
          font-size: clamp(20px, 3.5vw, 48px);
          font-weight: 800;
          line-height: 0.9;
          text-transform: uppercase;
          letter-spacing: -0.03em;
          max-width: 900px;
          color: #fff;
        }
        .footer-title span { color: var(--accent); }
        .footer-contact-btn {
          display: inline-block;
          margin-top: 30px;
          padding: 9px 24px;
          border: 1px solid var(--accent);
          border-radius: 100px;
          font-family: var(--font-sans);
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--accent);
          text-decoration: none;
          transition: background 0.4s, color 0.4s, transform 0.4s;
          cursor: none;
        }
        .footer-contact-btn:hover { background: var(--accent); color: #000; transform: translateY(-4px); }
        .footer-middle {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          margin-bottom: 24px;
          padding-top: 24px;
          border-top: 1px solid rgba(255,255,255,0.05);
          position: relative;
          z-index: 2;
        }
        .footer-nav-col { display: flex; flex-direction: column; gap: 16px; }
        .footer-nav-title {
          font-size: 11px;
          color: var(--accent);
          text-transform: uppercase;
          letter-spacing: 0.3em;
          margin-bottom: 4px;
          font-weight: 700;
        }
        .footer-nav-links { display: flex; flex-direction: column; gap: 10px; }
        .footer-nav-links a {
          font-family: var(--font-sans);
          color: #888;
          text-decoration: none;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
          width: fit-content;
          transition: color 0.25s, transform 0.25s;
        }
        .footer-nav-links a:hover { color: #fff; transform: translateX(4px); }
        .footer-link-label { display: flex; align-items: center; gap: 6px; }
        .footer-link-external {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          letter-spacing: 0.05em;
          opacity: 0.45;
          margin-left: 2px;
          transition: opacity 0.25s;
        }
        .footer-nav-links a:hover .footer-link-external { opacity: 0.85; }
        .footer-bottom {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          padding-top: 16px;
          border-top: 1px solid rgba(255,255,255,0.05);
          font-size: 13px;
          color: #666;
          position: relative;
          z-index: 2;
        }
        .back-to-top {
          background: none;
          border: none;
          color: var(--accent);
          text-transform: uppercase;
          letter-spacing: 0.2em;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: color 0.3s, transform 0.3s;
        }
        .back-to-top:hover { color: #fff; transform: translateY(-4px); }
        @media (max-width: 768px) {
          #footer { padding: 32px 5vw 20px; }
          .footer-top { flex-direction: column; margin-bottom: 20px; }
          .footer-middle { grid-template-columns: 1fr; gap: 40px; margin-bottom: 20px; }
          .footer-bottom { flex-direction: column; align-items: flex-start; gap: 32px; }
          .back-to-top { align-self: flex-end; margin-top: -50px; }
        }
        @media (max-width: 480px) {
          #footer {
            padding: 28px 4vw 16px;
          }
          .footer-middle {
            gap: 32px;
            margin-bottom: 16px;
          }
          .footer-bottom {
            gap: 24px;
          }
        }
      `}</style>
      <footer id="footer">
        <Particles />
        <div className="footer-bg-glow" />
        <div className="footer-top">
          <div className="footer-left">
            <h2 className="footer-title">Let's work<br /><span>together.</span></h2>
            <a href="mailto:qweasd226410@gmail.com" className="footer-contact-btn">
              Get in touch ↗
            </a>
          </div>
        </div>

        <div className="footer-middle">
          {/* Sitemap column */}
          <div className="footer-nav-col">
            <div className="footer-nav-title">Sitemap</div>
            <div className="footer-nav-links">
              {NAV_LINKS.map((link, idx) => (
                <a key={idx} href={link.href}>
                  <span className="footer-link-label">
                    {link.icon}
                    {link.label}
                  </span>
                </a>
              ))}
            </div>
          </div>

          {/* Link (Socials) column */}
          <div className="footer-nav-col">
            <div className="footer-nav-title">Link</div>
            <div className="footer-nav-links">
              {SOCIAL_LINKS.map((s, idx) => (
                <a
                  key={idx}
                  href={s.url}
                  {...(s.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  <span className="footer-link-label">
                    {s.icon}
                    {s.label}
                  </span>
                  {s.external && (
                    <span className="footer-link-external">
                      <IconArrow />
                    </span>
                  )}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-copyright">
            &copy; {YEAR} Wayne 陳林淯. All rights reserved.
          </div>
          <button className="back-to-top" onClick={scrollToTop}>
            ↑ Back to top
          </button>
        </div>
      </footer>
    </>
  )
}
