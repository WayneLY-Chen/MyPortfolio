import { useEffect } from 'react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import TopNav from '../components/TopNav'
import Footer from '../components/Footer'
import Projects from '../components/Projects'
import useLenis from '../hooks/useLenis'

export default function ProjectsPage() {
  useLenis()

  useEffect(() => {
    // 確保進入頁面時 ScrollTrigger 重新計算，清除殘留的 pin offset
    ScrollTrigger.refresh()
    window.scrollTo(0, 0)
  }, [])

  return (
    <>
      <TopNav />
      <div style={{ paddingTop: '100px', minHeight: 'calc(100vh - 200px)' }}>
        <Projects limit={0} />
      </div>
      <Footer />
    </>
  )
}
