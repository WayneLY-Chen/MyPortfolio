import { useState, useEffect, useRef, useCallback } from 'react'
import { gsap } from 'gsap'
import { useNavigate } from 'react-router-dom'
import { getLenis } from '../hooks/useLenis'
import useAuthStore from '../store/authStore'

function ScrambleText({ text }) {
  const [display, setDisplay] = useState(text)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const scramble = useCallback(() => {
    let iterations = 0
    const interval = setInterval(() => {
      setDisplay(text.split('').map((char, i) =>
        i < iterations ? text[i] : chars[Math.floor(Math.random() * chars.length)]
      ).join(''))
      iterations += 1
      if (iterations > text.length) { clearInterval(interval); setDisplay(text) }
    }, 40)
  }, [text])
  return <span onMouseEnter={scramble}>{display}</span>
}

const NAV_LINKS = [
  { label: '關於我', href: '#about' },
  { label: '我的專案', href: '/projects' },
  { label: '部落格', href: '/blog' },
  { label: '功能頁', href: '/fun' },
]

export default function TopNav() {
  const { user, clearAuth } = useAuthStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const overlayRef = useRef(null)
  const linksRef = useRef([])

  useEffect(() => {
    let lastScrolled = false
    const handleScroll = () => {
      const isScrolled = window.scrollY > 60
      if (isScrolled !== lastScrolled) {
        lastScrolled = isScrolled
        setScrolled(isScrolled)
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (!overlayRef.current) return
    const overlay = overlayRef.current
    const els = linksRef.current.filter(Boolean)
    gsap.killTweensOf(overlay)
    gsap.killTweensOf(els)
    if (open) {
      document.body.style.overflow = 'hidden'
      gsap.to(overlay, { opacity: 1, duration: 0.4, ease: 'power2.out', pointerEvents: 'all', force3D: true })
      gsap.fromTo(els, { y: 60, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.08, duration: 0.6, ease: 'power4.out', delay: 0.15, force3D: true })
    } else {
      document.body.style.overflow = ''
      gsap.to(overlay, { opacity: 0, duration: 0.3, ease: 'power2.in', pointerEvents: 'none', force3D: true })
    }
    return () => {
      gsap.killTweensOf(overlay)
      gsap.killTweensOf(els)
    }
  }, [open])

  const handleNavClick = (href) => {
    setOpen(false)
    if (href.startsWith('#')) {
      if (window.location.pathname !== '/') {
        navigate('/')
        setTimeout(() => {
          const el = document.querySelector(href)
          if (el) {
            const lenis = getLenis()
            lenis ? lenis.scrollTo(el, { offset: -80 }) : el.scrollIntoView({ behavior: 'smooth' })
          }
        }, 400)
        return
      }
      setTimeout(() => {
        const el = document.querySelector(href)
        if (el) {
          const lenis = getLenis()
          lenis ? lenis.scrollTo(el, { offset: -80 }) : el.scrollIntoView({ behavior: 'smooth' })
        }
      }, 50)
    } else {
      navigate(href)
    }
  }

  return (
    <>
      <style>{`
        #topnav {
          position: fixed; top: 0 !important; left: 0; right: 0;
          margin-top: 0 !important;
          z-index: 1000;
          display: flex; justify-content: space-between; align-items: center;
          padding: 32px 8vw;
          padding-top: max(32px, env(safe-area-inset-top));
          transition: background 0.4s, backdrop-filter 0.4s;
        }
        #topnav.scrolled {
          background: rgba(8,8,8,0.92);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border-bottom: 1px solid #1c1c1c;
        }
        .nav-icon { height: 40px; width: auto; object-fit: contain; display: block; }
        .nav-icon-link { cursor: pointer; flex-shrink: 0; }
        .nav-links-center {
          display: flex; list-style: none; gap: 36px; align-items: center;
          position: absolute; left: 50%; transform: translateX(-50%);
        }
        .nav-links-center li button {
          background: none; border: none; cursor: pointer;
          font-family: var(--font-sans); font-size: 16px;
          letter-spacing: 0.3em; text-transform: uppercase;
          color: #999; transition: all 0.3s; padding: 10px 0;
          font-weight: 500;
        }
        .nav-links-center li button:hover { color: var(--fg); transform: translateY(-2px); }
        .nav-right { display: flex; align-items: center; gap: 20px; flex-shrink: 0; }
        .nav-login {
          font-family: var(--font-sans); font-size: 15px;
          letter-spacing: 0.2em; text-transform: uppercase;
          color: var(--muted); text-decoration: none; transition: all 0.3s; cursor: pointer;
          font-weight: 700;
        }
        .nav-login:hover { color: var(--fg); border-bottom: 2px solid var(--accent); }
        
        .nav-user-info { display: flex; align-items: center; gap: 15px; }
        .nav-username {
          font-family: var(--font-sans); font-size: 14px;
          color: var(--accent); font-weight: 700; letter-spacing: 0.1em;
        }
        .nav-logout {
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
          color: #888; padding: 6px 14px; borderRadius: 6px; font-size: 11px;
          text-transform: uppercase; letter-spacing: 0.1em; cursor: pointer;
          transition: all 0.3s; font-weight: 600;
        }
        .nav-logout:hover { background: rgba(212,240,41,0.1); color: var(--accent); border-color: var(--accent); }
        .nav-github { color: var(--muted); transition: color 0.3s; cursor: pointer; display: flex; align-items: center; }
        .nav-github:hover { color: var(--fg); }
        .nav-hamburger {
          display: none; flex-direction: column; gap: 5px;
          background: none; border: none; cursor: pointer; padding: 4px;
        }
        .nav-hamburger span {
          display: block; width: 24px; height: 1px; background: var(--fg);
          transition: transform 0.4s cubic-bezier(0.76,0,0.24,1), opacity 0.3s;
          transform-origin: center;
        }
        .nav-hamburger.active span:nth-child(1) { transform: translateY(6px) rotate(45deg); }
        .nav-hamburger.active span:nth-child(2) { opacity: 0; }
        .nav-hamburger.active span:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }
        @media (max-width: 900px) {
          .nav-links-center { display: none; }
          .nav-hamburger { display: flex; }
        }
        @media (max-width: 480px) {
          #topnav {
            padding: 20px 4vw;
            padding-top: max(20px, env(safe-area-inset-top));
          }
          .nav-icon { height: 32px; }
          .nav-right { gap: 12px; }
          .nav-login {
            font-size: 12px;
            letter-spacing: 0.15em;
          }
          .nav-username {
            font-size: 11px;
            max-width: 60px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .nav-logout {
            padding: 5px 10px;
            font-size: 10px;
          }
          .nav-github svg {
            width: 16px;
            height: 16px;
          }
          .nav-hamburger span {
            width: 20px;
          }
          .nav-overlay {
            justify-content: flex-start !important;
            padding: 100px 4vw 120px !important;
          }
          .overlay-links {
            gap: 4px !important;
          }
          .overlay-links li button {
            padding: 8px 0 !important;
          }
          .link-num {
            font-size: 11px !important;
            width: 20px !important;
          }
          .link-label {
            font-size: clamp(22px, 7vw, 28px) !important;
          }
          .overlay-footer {
            bottom: 30px !important;
            left: 4vw !important;
            gap: 16px !important;
            flex-direction: column !important;
          }
          .overlay-footer a {
            font-size: 10px !important;
          }
        }
        .nav-overlay {
          position: fixed; inset: 0; background: #080808;
          z-index: 999; opacity: 0; pointer-events: none;
          display: flex; flex-direction: column;
          justify-content: center; padding: 80px 6vw 60px;
        }
        .overlay-links { list-style: none; display: flex; flex-direction: column; gap: 8px; }
        .overlay-links li button {
          display: flex; align-items: baseline; gap: 20px;
          background: none; border: none; cursor: pointer;
          text-align: left; padding: 12px 0;
          border-bottom: 1px solid #1c1c1c; width: 100%;
        }
        .link-num { font-family: var(--font-body); font-size: 12px; color: var(--muted); width: 24px; }
        .link-label {
          font-family: var(--font-sans); font-size: clamp(32px, 6vw, 72px);
          font-weight: 800; color: var(--fg); text-transform: uppercase; transition: color 0.3s;
        }
        .overlay-links li button:hover .link-label { color: var(--accent); }
        .overlay-footer { position: absolute; bottom: 60px; left: 6vw; display: flex; gap: 32px; }
        .overlay-footer a {
          font-size: 12px; letter-spacing: 0.2em; text-transform: uppercase;
          color: var(--muted); text-decoration: none; transition: color 0.3s;
        }
        .overlay-footer a:hover { color: var(--fg); }
      `}</style>

      <nav id="topnav" className={scrolled ? 'scrolled' : ''}>
        <a href="/" className="nav-icon-link" onClick={(e) => { e.preventDefault(); navigate('/') }}>
        </a>

        <ul className="nav-links-center">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <button 
                onClick={() => handleNavClick(link.href)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {link.label === '關於我' && (
                  <img 
                    src="/topnavicon.png" 
                    alt="icon" 
                    style={{ 
                      width: '40px', 
                      height: '40px',
                      objectFit: 'cover',
                      clipPath: 'circle(50% at 50% 50%)',
                      mixBlendMode: 'screen',
                      filter: 'contrast(1.2) drop-shadow(0 0 10px rgba(212,240,41,0.4))',
                      transform: 'translateX(-8px)'
                    }} 
                  />
                )}
                <ScrambleText text={link.label} />
              </button>
            </li>
          ))}
        </ul>

        <div className="nav-right">
          {user ? (
            <div className="nav-user-info">
              <span className="nav-username">{user.display_name || user.email?.split('@')[0]}</span>
              <button className="nav-logout" onClick={clearAuth}>登出</button>
            </div>
          ) : (
            <a href="/login" className="nav-login" onClick={e => { e.preventDefault(); navigate('/login') }}>登入</a>
          )}
          <a href="https://github.com/WayneLY-Chen" target="_blank" rel="noopener" className="nav-github">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
          </a>
          <button
            className={`nav-hamburger ${open ? 'active' : ''}`}
            onClick={() => setOpen(!open)}
            aria-label="選單"
          >
            <span></span><span></span><span></span>
          </button>
        </div>
      </nav>

      <div ref={overlayRef} className="nav-overlay">
        <ul className="overlay-links">
          {NAV_LINKS.map((link, i) => (
            <li key={link.href}>
              <button ref={el => linksRef.current[i] = el} onClick={() => handleNavClick(link.href)}>
                <span className="link-num">0{i + 1}</span>
                <span className="link-label"><ScrambleText text={link.label} /></span>
              </button>
            </li>
          ))}
        </ul>
        <div className="overlay-footer">
          <a href="https://github.com/WayneLY-Chen" target="_blank" rel="noopener">GitHub</a>
          <a href="https://www.instagram.com/mr.w_1022/?hl=zh-tw" target="_blank" rel="noopener">Instagram</a>
          <a href="mailto:qweasd226410@gmail.com">Email</a>
        </div>
      </div>
    </>
  )
}
