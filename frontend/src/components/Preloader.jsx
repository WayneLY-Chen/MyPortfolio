import { useEffect, useRef, useMemo, useState } from 'react' // useState kept for allLoaded
import { gsap } from 'gsap'
import { motion } from 'framer-motion'
import { setPreloadedImages, setPreloadedBitmaps } from './Hero'

// Deterministic pseudo-random to avoid hydration issues
function seededRandom(seed) {
  let s = seed
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646 }
}

const FRAME_COUNT = 231

export default function Preloader({ onComplete }) {
  const containerRef = useRef(null)
  const barRef = useRef(null)
  const lettersRef = useRef([])
  const subtitleRef = useRef(null)
  const [allLoaded, setAllLoaded] = useState(false)
  const imagesRef = useRef([])
  const bitmapsRef = useRef([])
  const progressNumRef = useRef(null)
  const targetProgressRef = useRef(0)

  // 平滑化百分比數字 — 直接操作 DOM 避免 React 18 batching 跳幀
  useEffect(() => {
    let raf
    let currentDisplay = 0
    const update = () => {
      const target = targetProgressRef.current
      const diff = target - currentDisplay
      if (diff > 0.01) {
        currentDisplay += diff * 0.05
      } else if (target === 100 && currentDisplay < 100) {
        currentDisplay = 100
      }
      if (progressNumRef.current) {
        progressNumRef.current.textContent = Math.round(currentDisplay) + '%'
      }
      raf = requestAnimationFrame(update)
    }
    update()
    return () => cancelAnimationFrame(raf)
  }, [])

  // Start loading all images in batches to reduce memory pressure
  useEffect(() => {
    const BATCH_SIZE = 4
    let loadedCount = 0
    let cancelled = false

    const updateProgress = (count) => {
      if (cancelled) return
      const progress = Math.min(Math.round((count / FRAME_COUNT) * 100), 100)
      targetProgressRef.current = progress

      // 讓進度條也稍微等一下 displayProgress
      if (count >= FRAME_COUNT) {
        setPreloadedImages(imagesRef.current)
        setPreloadedBitmaps(bitmapsRef.current)
        // 延遲一點點時間讓百分比能跑完
        setTimeout(() => setAllLoaded(true), 600)
      }
    }

    const loadBatch = (startIdx) => {
      if (cancelled) return
      const end = Math.min(startIdx + BATCH_SIZE, FRAME_COUNT)
      let currentBatchLoaded = 0
      const toLoad = end - startIdx

      for (let i = startIdx; i < end; i++) {
        const img = new Image()
        const num = String(i + 1).padStart(3, '0')
        img.src = `/image/ezgif-frame-${num}.png`
        img.decoding = 'async'
        imagesRef.current[i] = img

        const onDone = () => {
          if (cancelled) return
          loadedCount++
          currentBatchLoaded++
          updateProgress(loadedCount)

          // Kick off next batch ONLY when ALL images of the current batch are finished
          if (currentBatchLoaded === toLoad && end < FRAME_COUNT) {
            setTimeout(() => loadBatch(end), 30) // Breather for main thread
          }

          // Bitmap 轉換移至 Hero.jsx 的 convertBitmaps()，Preloader 階段不做，減少 CPU 競爭
        }

        if (img.complete && img.naturalWidth > 0) {
          onDone()
        } else {
          img.onload = onDone
          img.onerror = onDone // Important to also proceed on error!
        }
      }
    }

    // Start first batch
    loadBatch(0)

    // Fallback: force complete after 8 seconds
    const timeout = setTimeout(() => {
      if (!cancelled) {
        setPreloadedImages(imagesRef.current)
        setPreloadedBitmaps(bitmapsRef.current)
        targetProgressRef.current = 100
        setAllLoaded(true)
      }
    }, 8000)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [])

  // Freeze particle values on mount — seeded so they're deterministic
  const particles = useMemo(() => {
    const rng = seededRandom(42)
    return Array.from({ length: 28 }, (_, i) => ({
      left:     rng() * 100,
      bottom:   rng() * 40 + 5,
      size:     rng() * 3 + 1.5,
      delay:    rng() * 3,
      duration: rng() * 4 + 4,
      drift:    (rng() - 0.5) * 60,
      opacity:  rng() * 0.45 + 0.1,
      color:    i % 5 === 0 ? '#fff' : '#C8942A',
    }))
  }, [])

  const glowOrbs = useMemo(() => {
    const rng = seededRandom(99)
    return Array.from({ length: 5 }, () => ({
      left:    rng() * 80 + 10,
      top:     rng() * 80 + 10,
      size:    rng() * 160 + 80,
      delay:   rng() * 2,
    }))
  }, [])

  useEffect(() => {
    // Don't start animation until all frames are loaded
    if (!allLoaded) return

    const tl = gsap.timeline({
      onComplete: () => {
        gsap.to(containerRef.current, {
          opacity: 0,
          duration: 0.6,
          ease: 'power2.inOut',
          onComplete,
        })
      }
    })

    // Letters stagger in
    tl.fromTo(
      lettersRef.current.filter(Boolean),
      { y: 60, opacity: 0, rotateX: -90 },
      { y: 0, opacity: 1, rotateX: 0, duration: 0.6, stagger: 0.08, ease: 'back.out(1.5)' },
      0
    )
    // Subtitle
    tl.fromTo(
      subtitleRef.current,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' },
      0.5
    )
    // Progress bar
    tl.fromTo(
      barRef.current,
      { scaleX: 0 },
      { scaleX: 1, duration: 1.8, ease: 'power1.inOut', transformOrigin: 'left center' },
      0.3
    )
    // Hold, then exit
    tl.to({}, { duration: 0.5 })

    return () => tl.kill()
  }, [onComplete, allLoaded])

  const letters = 'WAYNE'.split('')

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: '#080808',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {/* ── Background grid ── */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
        backgroundSize: '60px 60px',
        pointerEvents: 'none',
      }} />

      {/* ── Animated glow orbs ── */}
      {glowOrbs.map((orb, i) => (
        <motion.div
          key={i}
          style={{
            position: 'absolute',
            left: `${orb.left}%`,
            top: `${orb.top}%`,
            width: orb.size,
            height: orb.size,
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(200,148,42,0.07) 0%, transparent 70%)`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
          animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 3 + orb.delay, repeat: Infinity, ease: 'easeInOut', delay: orb.delay }}
        />
      ))}

      {/* ── Floating particles ── */}
      <style>{`
        @keyframes preloader-float {
          0%   { transform: translateY(0px) translateX(0px); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { transform: translateY(var(--rise)) translateX(var(--drift)); opacity: 0; }
        }
        .pl-particle {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          animation: preloader-float var(--dur) ease-in var(--delay) infinite;
        }
        
        /* Mobile responsive styles */
        @media (max-width: 768px) {
          .preloader-side-label {
            display: none !important;
          }
        }
        
        @media (max-width: 480px) {
          .preloader-corner-accent {
            width: 12px !important;
            height: 12px !important;
          }
        }
      `}</style>

      {particles.map((p, i) => (
        <div
          key={i}
          className="pl-particle"
          style={{
            left: `${p.left}%`,
            bottom: `${p.bottom}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            opacity: p.opacity,
            '--rise': `-${200 + Math.abs(p.drift)}px`,
            '--drift': `${p.drift}px`,
            '--dur': `${p.duration}s`,
            '--delay': `${p.delay}s`,
          }}
        />
      ))}

      {/* ── Corner accents ── */}
      {[{top:20,left:20},{top:20,right:20},{bottom:20,left:20},{bottom:20,right:20}].map((s, i) => (
        <div key={i} className="preloader-corner-accent" style={{
          position: 'absolute', ...s,
          width: 20, height: 20,
          borderTop:    i < 2  ? '1px solid rgba(200,148,42,0.4)' : 'none',
          borderBottom: i >= 2 ? '1px solid rgba(200,148,42,0.4)' : 'none',
          borderLeft:   i % 2 === 0 ? '1px solid rgba(200,148,42,0.4)' : 'none',
          borderRight:  i % 2 === 1 ? '1px solid rgba(200,148,42,0.4)' : 'none',
        }} />
      ))}

      {/* ── Scan lines ── */}
      <div style={{ position: 'absolute', left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(200,148,42,0.15), transparent)', top: '35%', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, rgba(200,148,42,0.08), transparent)', top: '65%', pointerEvents: 'none' }} />

      {/* ── Side labels ── */}
      <div className="preloader-side-label preloader-side-label-left" style={{ position: 'absolute', left: 32, top: '50%', transform: 'translateY(-50%) rotate(-90deg)', fontSize: 9, letterSpacing: '0.4em', color: 'rgba(255,255,255,0.08)', textTransform: 'uppercase', pointerEvents: 'none' }}>Portfolio 2026</div>
      <div className="preloader-side-label preloader-side-label-right" style={{ position: 'absolute', right: 32, top: '50%', transform: 'translateY(-50%) rotate(90deg)', fontSize: 9, letterSpacing: '0.4em', color: 'rgba(255,255,255,0.08)', textTransform: 'uppercase', pointerEvents: 'none' }}>Wayne Chen</div>

      {/* ── Main content ── */}
      <div style={{ position: 'relative', textAlign: 'center', zIndex: 10, width: '100%', maxWidth: '90vw', margin: '0 auto', padding: '0 20px' }}>

        {/* Ring pulse behind letters */}
        <motion.div
          style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'clamp(200px, 60vw, 320px)', 
            height: 'clamp(200px, 60vw, 320px)',
            borderRadius: '50%',
            border: '1px solid rgba(200,148,42,0.12)',
            pointerEvents: 'none',
          }}
          animate={{ scale: [0.8, 1.4], opacity: [0.6, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
        />
        <motion.div
          style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'clamp(200px, 60vw, 320px)', 
            height: 'clamp(200px, 60vw, 320px)',
            borderRadius: '50%',
            border: '1px solid rgba(200,148,42,0.08)',
            pointerEvents: 'none',
          }}
          animate={{ scale: [0.8, 1.4], opacity: [0.4, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut', delay: 1.2 }}
        />

        {/* Letters */}
        <div style={{ display: 'flex', gap: '0.05em', perspective: '400px', justifyContent: 'center', width: '100%' }}>
          {letters.map((l, i) => (
            <span
              key={i}
              ref={el => lettersRef.current[i] = el}
              style={{
                fontFamily: 'var(--font-display, serif)',
                fontSize: 'clamp(64px, 12vw, 120px)',
                fontWeight: 900,
                color: '#fff',
                lineHeight: 1,
                letterSpacing: '-0.02em',
                display: 'inline-block',
              }}
            >
              {l}
            </span>
          ))}
        </div>

        {/* Subtitle */}
        <p
          ref={subtitleRef}
          style={{
            fontSize: 'clamp(10px, 2.5vw, 12px)', 
            letterSpacing: 'clamp(0.2em, 0.5vw, 0.5em)', 
            textTransform: 'uppercase',
            color: 'var(--accent, #C8942A)', 
            marginTop: 16, 
            marginBottom: 40, 
            opacity: 0,
            padding: '0 20px',
          }}
        >
          Portfolio · Developer · Creator
        </p>

        {/* Progress bar */}
        <div style={{
          width: 'clamp(180px, 60vw, 400px)', height: 2,
          background: 'rgba(255,255,255,0.06)', borderRadius: 1,
          overflow: 'hidden', margin: '0 auto', position: 'relative',
        }}>
          <div
            ref={barRef}
            style={{
              height: '100%',
              background: 'linear-gradient(90deg, var(--accent, #C8942A), #fff)',
              transformOrigin: 'left center',
              position: 'relative', overflow: 'hidden',
            }}
          >
            {/* Shimmer sweep */}
            <motion.div
              style={{
                position: 'absolute', top: 0, left: 0,
                width: '35%', height: '100%',
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.65), transparent)',
                pointerEvents: 'none',
              }}
              animate={{ x: ['-100%', '400%'] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
            />
          </div>
        </div>

        {/* Loading percentage */}
        <motion.div
          style={{ marginTop: 16, fontSize: '11px', letterSpacing: '0.2em', color: 'rgba(200,148,42,0.6)', textAlign: 'center' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <span ref={progressNumRef}>0%</span>
        </motion.div>

        {/* Percentage-like dots */}
        <motion.div
          style={{ marginTop: 12, display: 'flex', justifyContent: 'center', gap: 6 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(200,148,42,0.5)' }}
              animate={{ scale: [1, 1.6, 1], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </motion.div>
      </div>
    </div>
  )
}
