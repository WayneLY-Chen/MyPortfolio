import TopNav from '../components/TopNav'
import Footer from '../components/Footer'
import Blog from '../components/Blog'
import useLenis from '../hooks/useLenis'

export default function BlogPage() {
  useLenis()
  
  return (
    <>
      <TopNav />
      <div style={{ paddingTop: '100px', minHeight: 'calc(100vh - 200px)' }}>
        <Blog limit={0} />
      </div>
      <Footer />
    </>
  )
}
