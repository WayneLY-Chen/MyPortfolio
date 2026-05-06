import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ToastProvider } from './components/ui/Toast'
import Preloader from './components/Preloader'
import TopNav from './components/TopNav'
import Cursor from './components/Cursor'
import Hero from './components/Hero'
import About from './components/About'
import Certificates from './components/Certificates'
import Projects from './components/Projects'
import WorkTimeline from './components/WorkTimeline'
import Marquee from './components/Marquee'
import Blog from './components/Blog'
import Footer from './components/Footer'
import Login from './pages/Login'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import ProjectsPage from './pages/ProjectsPage'
import BlogPage from './pages/BlogPage'
import BlogPostPage from './pages/BlogPostPage'
import FunPage from './pages/FunPage'
import AuthCallback from './pages/AuthCallback'
import Verify from './components/Verify'
import AIAssistant from './components/AIAssistant'
import useLenis, { getLenis } from './hooks/useLenis'
import useAuthStore from './store/authStore'
import useTodoNotifier from './hooks/useTodoNotifier'

function RouteScrollManager() {
  const location = useLocation()
  const isFirstMount = useRef(true)
  useEffect(() => {
    // 首次掛載（首頁初始載入）跳過，避免與 useLenis 的 refresh 競爭
    if (isFirstMount.current) {
      isFirstMount.current = false
      return
    }

    document.body.style.overflow = ''

    const lenis = getLenis()
    if (lenis) {
      lenis.scrollTo(0, { immediate: true })
    } else {
      window.scrollTo(0, 0)
    }

    if (location.pathname !== '/') {
      ScrollTrigger.getAll()
        .filter(st => st.vars?.pin)
        .forEach(st => st.kill())
    }

    // 延遲 refresh，確保 DOM 在路由切換後完全 mount
    // 路由切換後已 scrollTo(0)，所以 scrollY 應為 0，可以安全 refresh
    gsap.delayedCall(0.15, () => {
      ScrollTrigger.refresh()
    })
  }, [location.pathname])
  return null
}

function HomePage({ loaded, setLoaded, hasSeenPreloader }) {
  useLenis(loaded) // Preloader 結束後才啟動 Lenis，避免載入期間空跑 RAF
  return (
    <>
      {!loaded && !hasSeenPreloader && <Preloader onComplete={() => setLoaded(true)} />}
      <TopNav />
      <main>
        <Hero animate={loaded} />
        <About />
        <Certificates />
        <WorkTimeline />
        <Marquee />
        <Projects limit={3} />
        <Blog />
        <Footer />
      </main>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
      <AppInner />
    </BrowserRouter>
  )
}

function TodoNotifierRunner() {
  useTodoNotifier()
  return null
}

function AppInner() {
  const [loaded, setLoaded] = useState(false)
  const [hasSeenPreloader, setHasSeenPreloader] = useState(false)
  const silentRefresh = useAuthStore(s => s.silentRefresh)

  useEffect(() => { silentRefresh() }, [])

  // Check if user has already seen the preloader in this session
  useEffect(() => {
    const preloaderSeen = sessionStorage.getItem('preloaderSeen')
    if (preloaderSeen === 'true') {
      setHasSeenPreloader(true)
      setLoaded(true)
    }
  }, [])

  const handlePreloaderComplete = () => {
    sessionStorage.setItem('preloaderSeen', 'true')
    setLoaded(true)
  }

  return (
    <ToastProvider>
      {/* <TodoNotifierRunner /> */}
      <Cursor />
      <AIAssistant />
      <RouteScrollManager />
      <Routes>
        <Route path="/" element={<HomePage loaded={loaded} setLoaded={handlePreloaderComplete} hasSeenPreloader={hasSeenPreloader} />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route path="/fun" element={<FunPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Login mode="register" />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/login/callback" element={<AuthCallback />} />
        <Route path="/verify" element={<Verify />} />
      </Routes>
    </ToastProvider>
  )
}
