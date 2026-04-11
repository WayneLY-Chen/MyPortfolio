import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { motion, useMotionValue, useMotionTemplate } from 'framer-motion'

const FRAME_COUNT = 231
const FRAMES = Array.from({ length: FRAME_COUNT }, (_, i) => {
  const num = String(i + 1).padStart(3, '0')
  return `/image/ezgif-frame-${num}.png`
})

// Module-level image cache — survives re-mounts
const _imgs = new Array(FRAME_COUNT).fill(null)
let _imagesLoaded = false

export function setPreloadedImages(images) {
  for (let i = 0; i < images.length && i < FRAME_COUNT; i++) {
    if (images[i]) _imgs[i] = images[i]
  }
}

export function setPreloadedBitmaps() {} // kept for Preloader compatibility

function preloadImages() {
  if (_imagesLoaded) return
  let loaded = 0
  for (let i = 0; i < FRAME_COUNT; i++) {
    if (_imgs[i]) { loaded++; continue }
    const img = new Image()
    img.decoding = 'async'
    img.src = FRAMES[i]
    _imgs[i] = img
    img.onload = () => { loaded++ }
  }
  _imagesLoaded = true
}

export function isFirstFrameReady() {
  return _imgs[0] && _imgs[0].complete && _imgs[0].naturalWidth > 0
}

export async function waitForFirstFrame() {
  preloadImages()
  if (_imgs[0] && !_imgs[0].complete) {
    await new Promise(res => { _imgs[0].onload = res; _imgs[0].onerror = res })
  }
  return isFirstFrameReady()
}

function SpotlightEffect({ mouseX, mouseY }) {
  const bg = useMotionTemplate`radial-gradient(600px circle at ${mouseX}px ${mouseY}px, rgba(200,148,42,0.10), transparent 70%)`
  return (
    <motion.div style={{ position: 'absolute', inset: 0, background: bg, zIndex: 20, pointerEvents: 'none' }} />
  )
}

export default function Hero({ animate }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const mouseX = useMotionValue(-9999)
  const mouseY = useMotionValue(-9999)

  useEffect(() => { preloadImages() }, [])

  useEffect(() => {
    if (!animate) return
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: false })
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'medium'

    // Track the frame object used by GSAP scrub
    const frameObj = { f: 0 }
    let lastDrawn = -1

    const draw = (idx) => {
      const i = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(idx)))
      if (i === lastDrawn) return
      const img = _imgs[i]
      if (!img || !img.complete || !img.naturalWidth) return
      const cw = canvas.width, ch = canvas.height
      const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight)
      const x = (cw - img.naturalWidth * scale) / 2
      const y = (ch - img.naturalHeight * scale) / 2
      ctx.clearRect(0, 0, cw, ch)
      ctx.drawImage(img, x, y, img.naturalWidth * scale, img.naturalHeight * scale)
      lastDrawn = i
    }

    const syncSize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(window.innerWidth * dpr)
      canvas.height = Math.round(window.innerHeight * dpr)
      canvas.style.width = window.innerWidth + 'px'
      canvas.style.height = window.innerHeight + 'px'
      draw(frameObj.f)
    }
    syncSize()
    window.addEventListener('resize', syncSize)

    // Draw frame 0 immediately
    draw(0)

    // GSAP scrub: tween frameObj.f from 0 to FRAME_COUNT-1 driven by scroll
    const tween = gsap.to(frameObj, {
      f: FRAME_COUNT - 1,
      ease: 'none',
      onUpdate: () => draw(frameObj.f),
    })

    const pinTrigger = ScrollTrigger.create({
      trigger: containerRef.current,
      start: 'top top',
      end: '+=500%',
      pin: true,
      scrub: 0.5,
      animation: tween,
    })

    // Scroll hint fade
    const hintTrigger = ScrollTrigger.create({
      trigger: containerRef.current,
      start: 'top top',
      end: '+=8%',
      scrub: true,
      onUpdate: (self) => {
        const el = document.getElementById('hero-scroll-hint')
        if (el) el.style.opacity = String(1 - self.progress)
      }
    })

    return () => {
      window.removeEventListener('resize', syncSize)
      tween.kill()
      pinTrigger.kill()
      hintTrigger.kill()
    }
  }, [animate])

  return (
    <section
      id="hero"
      ref={containerRef}
      onMouseMove={animate ? (e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        mouseX.set(e.clientX - rect.left)
        mouseY.set(e.clientY - rect.top)
      } : undefined}
      style={{ height: '100vh', width: '100%', position: 'relative', overflow: 'hidden', background: '#0e0a06' }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, display: 'block', zIndex: 1, willChange: 'transform', transform: 'translateZ(0)' }}
      />
      {animate && <SpotlightEffect mouseX={mouseX} mouseY={mouseY} />}
      <div
        id="hero-scroll-hint"
        style={{ position: 'absolute', bottom: '2.5rem', left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', zIndex: 30, pointerEvents: 'none', userSelect: 'none' }}
      >
        <span style={{ fontFamily: 'inherit', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}>Scroll</span>
        <div style={{ width: '1px', height: '3rem', background: 'linear-gradient(to bottom, rgba(255,255,255,0.7), transparent)', animation: 'scrollHintDrop 1.6s ease-in-out infinite' }} />
      </div>
      <style>{`
        @keyframes scrollHintDrop {
          0%   { transform: scaleY(0); transform-origin: top; opacity: 1; }
          50%  { transform: scaleY(1); transform-origin: top; opacity: 1; }
          100% { transform: scaleY(1); transform-origin: top; opacity: 0; }
        }
      `}</style>
    </section>
  )
}
