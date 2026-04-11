import { useEffect, useRef, useState, useMemo } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { motion, useInView } from 'framer-motion'
import { useButton } from '@react-aria/button'
import YorkieDog from './YorkieDog'
import { Badge } from './ui/badge'

const SKILLS = [
  'React / Next.js',
  'GSAP',
  'Node.js',
  'TypeScript',
  'Python',
  'AI / Machine Learning',
  'UI/UX Design',
  'Figma',
  'MySQL',
  'Git'
]

const NAV_ITEMS = [
  { id: 'who-i-am', label: 'WHO I AM' },
  { id: 'skills', label: 'SKILLS' },
  { id: 'experience', label: 'ACADEMIC' },
  { id: 'contact', label: 'CONTACT' },
]

const STATS = [
  { value: 1, suffix: '', label: '年開發經驗' },
  { value: 10, suffix: '+', label: '技術棧' },
  { value: 1, suffix: '', label: '發明專利' },
]

const TIMELINE = [
  {
    year: '2023',
    title: '中國科大校園創新創業提案競賽',
    desc: '代表隊伍參賽，以「寵物餵食器之餘糧清除裝置」獲得發明專利',
  },
  {
    year: '2024',
    title: '中國科技大學 資訊工程系',
    desc: '畢業，考取多張專業證照',
  },
]

function BlurText({ text, className, style }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-50px' })
  const words = text.split(' ')
  return (
    <span ref={ref} className={className} style={{ display: 'inline', ...style }}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          style={{ display: 'inline-block', marginRight: '0.25em', willChange: 'transform, opacity' }}
          initial={{ opacity: 0, y: 15 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: i * 0.04, ease: 'easeOut' }}
        >
          {word}
        </motion.span>
      ))}
    </span>
  )
}

function NavButton({ label, isActive, onPress }) {
  const ref = useRef(null)
  const { buttonProps } = useButton({ onPress, 'aria-pressed': isActive }, ref)
  return (
    <span
      ref={ref}
      {...buttonProps}
      className={`outline-item${isActive ? ' active' : ''}`}
      style={{ cursor: 'pointer', userSelect: 'none' }}
    >
      <span className="outline-line" />
      {label}
    </span>
  )
}

export default function About() {
  const sectionRef = useRef(null)
  const [activeNav, setActiveNav] = useState('who-i-am')

  // Memoize skill tags to avoid re-creating on every render
  const skillTags = useMemo(() => SKILLS.map((skill) => (
    <motion.div
      key={skill}
      whileHover={{ y: -2, color: 'var(--accent)', borderColor: 'var(--accent)' }}
      transition={{ duration: 0.2 }}
    >
      <Badge variant="outline" className="skill-tag">{skill}</Badge>
    </motion.div>
  )), [])

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Title reveal — use x (translateX) which is GPU-composited
      const aboutHeadingEl = sectionRef.current?.querySelector('.about-left h2')
      if (aboutHeadingEl) {
        gsap.from(aboutHeadingEl, {
          x: -60,
          opacity: 0,
          duration: 1,
          ease: 'power4.out',
          force3D: true,
          scrollTrigger: {
            trigger: sectionRef.current,
            start: 'top 70%',
            once: true,
          }
        })
      }

      // Photo reveal — y is transform-based, safe
      const aboutPhoto = sectionRef.current?.querySelector('.about-photo')
      if (aboutPhoto) {
        gsap.from(aboutPhoto, {
          opacity: 0,
          y: 40,
          duration: 1,
          ease: 'power4.out',
          force3D: true,
          scrollTrigger: {
            trigger: aboutPhoto,
            start: 'top 85%',
            once: true,
          }
        })
      }

      // Nav outline items — x is transform-based, safe
      const outlineItems = sectionRef.current?.querySelectorAll('.outline-item')
      if (outlineItems && outlineItems.length > 0) {
        gsap.from(outlineItems, {
          opacity: 0,
          x: -20,
          stagger: 0.1,
          duration: 0.6,
          ease: 'power3.out',
          force3D: true,
          scrollTrigger: {
            trigger: sectionRef.current?.querySelector('.about-outline'),
            start: 'top 90%',
            once: true,
          }
        })
      }

      // Text reveal lines — y:'100%' is translateY, GPU composited
      const aboutTextTrigger = sectionRef.current?.querySelector('.about-text')
      const revealInners = sectionRef.current?.querySelectorAll('.about-reveal-inner')
      if (revealInners && revealInners.length > 0) {
        gsap.from(revealInners, {
          y: '100%',
          duration: 1,
          ease: 'power4.out',
          stagger: 0.08,
          force3D: true,
          scrollTrigger: {
            trigger: aboutTextTrigger,
            start: 'top 85%',
            toggleActions: 'play none none none',
            once: true,
          }
        })
      }

      // Stats count-up — scoped to sectionRef, no global DOM query
      STATS.forEach((stat, i) => {
        const el = sectionRef.current?.querySelector(`.stat-number-${i}`)
        if (!el) return
        const obj = { val: 0 }
        const statsRowEl = sectionRef.current?.querySelector('.stats-row')
        gsap.to(obj, {
          val: stat.value,
          duration: 1.6,
          ease: 'power2.out',
          onUpdate: () => {
            el.textContent = Math.round(obj.val) + stat.suffix
          },
          scrollTrigger: {
            trigger: statsRowEl,
            start: 'top 85%',
            once: true,
          }
        })
      })

      // Stats row fade in — y is transform-based, safe
      const statItems = sectionRef.current?.querySelectorAll('.stat-item')
      if (statItems && statItems.length > 0) {
        gsap.from(statItems, {
          opacity: 0,
          y: 30,
          stagger: 0.15,
          duration: 0.8,
          ease: 'power3.out',
          force3D: true,
          scrollTrigger: {
            trigger: sectionRef.current?.querySelector('.stats-row'),
            start: 'top 85%',
            once: true,
          }
        })
      }

      // Timeline items slide in — x is transform-based, safe
      const timelineItems = sectionRef.current?.querySelectorAll('.timeline-item')
      if (timelineItems && timelineItems.length > 0) {
        gsap.from(timelineItems, {
          opacity: 0,
          x: -40,
          stagger: 0.18,
          duration: 0.8,
          ease: 'power3.out',
          force3D: true,
          scrollTrigger: {
            trigger: sectionRef.current?.querySelector('.about-timeline'),
            start: 'top 85%',
            once: true,
          }
        })
      }

      // Skills stagger — y is transform-based, safe
      const skillTags = sectionRef.current?.querySelectorAll('.skill-tag')
      if (skillTags && skillTags.length > 0) {
        gsap.from(skillTags, {
          opacity: 0,
          y: 20,
          stagger: 0.06,
          duration: 0.6,
          ease: 'power3.out',
          force3D: true,
          scrollTrigger: {
            trigger: sectionRef.current?.querySelector('.skills-grid'),
            start: 'top 85%',
            once: true,
          }
        })
      }

      // Active nav tracking via ScrollTrigger
      const sectionIds = ['who-i-am', 'skills', 'experience', 'contact']
      sectionIds.forEach((id) => {
        const target = sectionRef.current?.querySelector(`[data-section="${id}"]`)
        if (!target) return
        ScrollTrigger.create({
          trigger: target,
          start: 'top 60%',
          end: 'bottom 60%',
          onEnter: () => setActiveNav(id),
          onEnterBack: () => setActiveNav(id),
        })
      })
    }, sectionRef)

    return () => {
      ctx.revert()
    }
  }, [])

  return (
    <>
      <style>{`
        #about {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          border-bottom: 1px solid var(--muted);
        }
        @media (max-width: 768px) {
          #about { grid-template-columns: 1fr; }
          .about-left { border-right: none !important; border-bottom: 1px solid var(--muted); }
          .stats-row { gap: 20px; }
          .about-right { padding: 60px 6vw; }
        }
        @media (max-width: 480px) {
          .about-left {
            padding: 60px 4vw;
          }
          .about-right {
            padding: 50px 4vw;
          }
          .stats-row {
            gap: 16px;
          }
        }

        /* ── LEFT COLUMN ── */
        .about-left {
          padding: 80px 6vw;
          border-right: 1px solid var(--muted);
          display: flex;
          flex-direction: column;
          gap: 32px;
          position: sticky;
          top: 0;
          height: fit-content;
        }
        .about-left h2 {
          font-family: var(--font-display);
          font-size: clamp(24px, 4vw, 52px);
          font-weight: 800;
          text-transform: uppercase;
          line-height: 1;
        }
        .about-left h2 em {
          font-style: normal;
          color: var(--accent);
        }
        .about-photo {
          width: 100%;
          max-width: 380px;
          aspect-ratio: 3/4;
          object-fit: cover;
          border-radius: 4px;
          border: 1px solid var(--muted);
          will-change: transform, opacity;
        }

        /* ── OUTLINE NAV ── */
        .about-outline {
          display: flex;
          flex-direction: column;
          gap: 14px;
          margin-top: 8px;
        }
        .outline-item {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: default;
          font-size: 11px;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: var(--muted);
          transition: color 0.3s;
          will-change: transform, opacity;
        }
        .outline-item.active {
          color: var(--accent);
        }
        .outline-item.active .outline-line {
          background: var(--accent);
        }
        .outline-line {
          display: inline-block;
          width: 24px;
          height: 1px;
          background: var(--muted);
          flex-shrink: 0;
          transition: background 0.3s;
        }

        /* ── RIGHT COLUMN ── */
        .about-right {
          padding: 80px 6vw;
          display: flex;
          flex-direction: column;
          gap: 56px;
        }
        .about-tag {
          font-size: 11px;
          letter-spacing: 0.4em;
          text-transform: uppercase;
          color: var(--accent);
        }
        .section-label {
          font-size: 11px;
          letter-spacing: 0.4em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 20px;
        }
        .about-text {
          font-size: clamp(15px, 1.5vw, 18px);
          line-height: 1.8;
          color: #aaa;
        }
        .about-reveal-line {
          overflow: hidden;
        }
        .about-reveal-inner {
          display: block;
          will-change: transform;
        }

        /* ── STATS ROW ── */
        .stats-row {
          display: flex;
          align-items: stretch;
          gap: 0;
          border: 1px solid var(--muted);
          border-radius: 4px;
          overflow: hidden;
        }
        .stat-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 24px 16px;
          gap: 6px;
          position: relative;
        }
        .stat-item + .stat-item::before {
          content: '';
          position: absolute;
          left: 0;
          top: 20%;
          height: 60%;
          width: 1px;
          background: var(--muted);
        }
        .stat-number {
          font-family: var(--font-display);
          font-size: clamp(28px, 3.5vw, 44px);
          font-weight: 800;
          line-height: 1;
          color: #fff;
        }
        .stat-label {
          font-size: 11px;
          letter-spacing: 0.15em;
          color: var(--muted);
          text-align: center;
        }

        /* ── TIMELINE ── */
        .about-timeline {
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        .timeline-item {
          display: grid;
          grid-template-columns: 52px 1fr;
          gap: 16px;
          padding: 20px 0;
          border-bottom: 1px solid color-mix(in srgb, var(--muted) 50%, transparent);
        }
        .timeline-item:first-child {
          border-top: 1px solid color-mix(in srgb, var(--muted) 50%, transparent);
        }
        .timeline-year {
          font-family: var(--font-display);
          font-size: 13px;
          font-weight: 700;
          color: var(--accent);
          padding-top: 2px;
          letter-spacing: 0.05em;
        }
        .timeline-content {}
        .timeline-title {
          font-size: 14px;
          font-weight: 600;
          color: #fff;
          margin-bottom: 4px;
          line-height: 1.4;
        }
        .timeline-desc {
          font-size: 12px;
          color: var(--muted);
          line-height: 1.6;
        }

        /* ── SKILLS GRID ── */
        .skills-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .skill-tag {
          padding: 8px 16px;
          border: 1px solid var(--muted);
          font-size: 12px;
          letter-spacing: 0.1em;
          border-radius: 2px;
          color: #888;
          /* transition removed: framer-motion whileHover handles all hover animation */
          cursor: default;
        }

        /* ── SECTION BLOCKS ── */
        .about-section {
          display: flex;
          flex-direction: column;
        }
      `}</style>

      <section id="about" ref={sectionRef}>
        {/* ── LEFT COLUMN ── */}
        <div className="about-left">
          <div style={{ marginBottom: -24, position: 'relative', zIndex: 2 }}>
            <YorkieDog variant="about" size={100} />
          </div>
          <h2 style={{ position: 'relative', zIndex: 1 }}>About<br /><em>Me.</em></h2>

          <img
            src="/123.jpg"
            alt="陳林淯"
            className="about-photo"
          />

          <nav className="about-outline">
            {NAV_ITEMS.map(({ id, label }) => (
              <NavButton
                key={id}
                label={label}
                isActive={activeNav === id}
                onPress={() =>
                  document.querySelector(`[data-section="${id}"]`)?.scrollIntoView({ behavior: 'smooth' })
                }
              />
            ))}
          </nav>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="about-right">

          {/* Section A — Bio */}
          <div className="about-section" data-section="who-i-am">
            <p className="section-label">Who I Am</p>
            <div className="about-text">
              <div className="about-reveal-line"><span className="about-reveal-inner">您好，我是陳林淯，畢業於中國科技大學資訊工程系，</span></div>
              <div className="about-reveal-line"><span className="about-reveal-inner">在大學期間考取了很多張證照，</span></div>
              <div className="about-reveal-line"><span className="about-reveal-inner">並且與團隊共同在專題上實作獲得專利。</span></div>
              <div className="about-reveal-line"><span className="about-reveal-inner">名為「寵物餵食器之餘糧清除裝置」，</span></div>
              <div className="about-reveal-line"><span className="about-reveal-inner">利用這個專題參加了 2023 中國科大 校園創新創業提案競賽。</span></div>
            </div>
            <div className="about-text" style={{ marginTop: '16px' }}>
              <BlurText text="個人特質：熱心助人且善於換位思考，熱愛學習ＡＩ的知識，學習ＡＩ技術來讓ＡＩ幫忙做事。" />
            </div>
          </div>

          {/* Section B — Stats */}
          <div className="stats-row">
            {STATS.map((stat, i) => (
              <div className="stat-item" key={i}>
                <span className={`stat-number stat-number-${i}`}>0{stat.suffix}</span>
                <span className="stat-label">{stat.label}</span>
              </div>
            ))}
          </div>

          {/* Section C — Experience / Timeline */}
          <div className="about-section" data-section="experience">
            <p className="section-label" style={{ opacity: 0.7 }}>Academic History</p>
            <div className="about-timeline">
              {TIMELINE.map((item, i) => (
                <div className="timeline-item" key={i}>
                  <span className="timeline-year">{item.year}</span>
                  <div className="timeline-content">
                    <p className="timeline-title">{item.title}</p>
                    <p className="timeline-desc">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section D — Skills */}
          <div className="about-section" data-section="skills">
            <p className="section-label">Skills</p>
            <div className="skills-grid">
              {skillTags}
            </div>
          </div>

          {/* Section E — Contact anchor (for nav tracking) */}
          <div data-section="contact" style={{ height: '1px', marginTop: '-1px' }} />

        </div>
      </section>
    </>
  )
}
