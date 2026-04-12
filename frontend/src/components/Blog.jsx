import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import { useNavigate } from 'react-router-dom'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import useAuthStore from '../store/authStore'
import Comments from './Comments'
import { WobotSVG } from './AIAssistant'
import YorkieDog from './YorkieDog'
import * as Dialog from '@radix-ui/react-dialog'
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion'
import * as Tooltip from '@radix-ui/react-tooltip'
import { Button } from './ui/button'
import { useToast } from './ui/Toast'
import fetchBlogCached from '../utils/fetchBlog'
import { API_URL } from '../config/api'

function TiltCard({ children, onClick }) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const mouseX = useSpring(x, { stiffness: 150, damping: 20 })
  const mouseY = useSpring(y, { stiffness: 150, damping: 20 })
  const rotateX = useTransform(mouseY, [-0.5, 0.5], ['10deg', '-10deg'])
  const rotateY = useTransform(mouseX, [-0.5, 0.5], ['-10deg', '10deg'])
  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const xPos = (e.clientX - rect.left) / rect.width - 0.5
    const yPos = (e.clientY - rect.top) / rect.height - 0.5
    x.set(xPos); y.set(yPos)
  }
  const handleMouseLeave = () => { x.set(0); y.set(0) }
  return (
    <motion.div
      className="blog-card-wrapper"
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d', transformOrigin: 'center center' }}
      whileHover={{ scale: 1.02 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      {children}
    </motion.div>
  )
}

function AiSummaryButton({ type, title, content }) {
  const [summary, setSummary] = useState('')
  const [loading, setLoading] = useState(false)
  const [shown, setShown] = useState(false)

  const getSummary = async () => {
    if (loading) return
    setLoading(true); setShown(true)
    try {
      const res = await fetch(`${API_URL}/ai/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, title, content })
      })
      const data = await res.json()
      setSummary(data.success ? data.summary : '摘要生成失敗，請稍後再試')
    } catch { setSummary('連線失敗') }
    setLoading(false)
  }

  return (
    <div style={{ marginBottom: '32px' }}>
      {!shown && (
        <button
          onClick={getSummary}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', background: 'rgba(212,240,41,0.08)', border: '1px solid rgba(212,240,41,0.25)', borderRadius: 8, color: '#d4f029', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}
        >
          <WobotSVG color="#d4f029" size={18} /> Wobot AI 總結重點
        </button>
      )}
      {shown && (
        <div style={{ background: 'rgba(212,240,41,0.05)', border: '1px solid rgba(212,240,41,0.2)', borderRadius: 10, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <WobotSVG color="#d4f029" size={18} />
            <span style={{ fontSize: 12, color: '#d4f029', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Wobot AI 摘要</span>
          </div>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#666', fontSize: 14 }}>
              <div style={{ width: 16, height: 16, border: '2px solid #333', borderTopColor: '#d4f029', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              AI 整理中...
            </div>
          ) : (
            <div className="ai-summary-content" style={{ fontSize: '13.5px', color: '#bbb', lineHeight: 1.7 }}>
              <ReactMarkdown 
                rehypePlugins={[rehypeRaw]}
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({node, ...props}) => <p style={{ margin: 0 }} {...props} />,
                  strong: ({node, ...props}) => <strong style={{ color: '#fff', fontWeight: 700 }} {...props} />,
                  ul: ({node, ...props}) => <ul style={{ paddingLeft: '18px', margin: '8px 0', listStyleType: 'disc' }} {...props} />,
                  li: ({node, ...props}) => <li style={{ marginBottom: '4px', color: '#aaa' }} {...props} />,
                }}
              >
                {summary}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function Blog({ limit = 3 }) {
  const sectionRef = useRef(null)
  const navigate = useNavigate()
  const { toast } = useToast()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const modalBoxRef = useRef(null)

  const { user, accessToken, silentRefresh, clearAuth } = useAuthStore()
  const isAdmin = user?.email === 'qweasd226410@gmail.com'
  const [isEditing, setIsEditing] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  
  const [editTitle, setEditTitle] = useState('')
  const [editSlug, setEditSlug] = useState('')
  const [editSummary, setEditSummary] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editCoverImage, setEditCoverImage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (modal) {
      setEditTitle(modal.title || '')
      setEditSummary(modal.summary || '')
      setEditContent(modal.content || '')
      setEditCoverImage(modal.cover_image || '')
      setIsEditing(false)
    }
  }, [modal])
  
  const handleSaveBlog = async () => {
    if (!accessToken) return toast.error('請先登入')
    setSaving(true)
    
    const performRequest = async (token) => {
      return fetch(`${API_URL}/blog/${modal.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: editTitle, content: editContent, cover_image: editCoverImage, summary: editSummary })
      })
    }

    try {
      let res = await performRequest(accessToken)
      
      // Handle Token Expiration
      if (res.status === 401) {
        const data = await res.json().catch(() => ({}))
        if (data.message === 'TOKEN_EXPIRED') {
          const success = await silentRefresh()
          if (success) {
            // Retry with new token
            const newAccessToken = useAuthStore.getState().accessToken
            res = await performRequest(newAccessToken)
          } else {
            clearAuth()
            throw new Error('登入已逾時，請重新登入')
          }
        } else {
          throw new Error(data.message || '驗證失敗')
        }
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.message || '儲存失敗')
      }
      
      const data = await res.json()
      if (data.success) {
        setModal(data.data)
        setPosts(prev => {
          const updated = prev.map(p => p.id === data.data.id ? data.data : p)
          sessionStorage.setItem('blogListCache', JSON.stringify(updated))
          return updated
        })
        setIsEditing(false)
        toast.success('文章已更新')
      }
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleCreateBlog = async () => {
    if (!accessToken) return toast.error('請先登入')
    if (!editTitle || !editSlug || !editContent) return toast.error('標題、路徑與內容為必填')
    setSaving(true)

    const performRequest = async (token) => {
      return fetch(`${API_URL}/blog`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          title: editTitle, 
          slug: editSlug, 
          summary: editSummary, 
          content: editContent, 
          cover_image: editCoverImage 
        })
      })
    }

    try {
      let res = await performRequest(accessToken)

      // Handle Token Expiration
      if (res.status === 401) {
        const data = await res.json().catch(() => ({}))
        if (data.message === 'TOKEN_EXPIRED') {
          const success = await silentRefresh()
          if (success) {
            const newAccessToken = useAuthStore.getState().accessToken
            res = await performRequest(newAccessToken)
          } else {
            clearAuth()
            throw new Error('登入已逾時，請重新登入')
          }
        } else {
          throw new Error(data.message || '建立失敗')
        }
      }

      const data = await res.json()
      if (!res.ok) throw new Error(data.message || '建立失敗')
      if (data.success) {
        setPosts(prev => {
          const updated = [data.data, ...prev]
          sessionStorage.setItem('blogListCache', JSON.stringify(updated))
          return updated
        })
        setIsCreating(false)
        resetEditFields()
        toast.success('文章已發佈')
      }
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteBlog = async (id) => {
    if (!window.confirm('確定要刪除這篇文章嗎？')) return
    try {
      const res = await fetch(`${API_URL}/blog/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      if (res.ok) {
        setPosts(prev => {
          const updated = prev.filter(p => p.id !== id)
          sessionStorage.setItem('blogListCache', JSON.stringify(updated))
          return updated
        })
        setModal(null)
      }
    } catch (e) { alert('刪除失敗') }
  }

  const resetEditFields = () => {
    setEditTitle('')
    setEditSlug('')
    setEditSummary('')
    setEditContent('')
    setEditCoverImage('')
  }

  useEffect(() => {
    fetchBlogCached()
      .then(all => {
        setPosts(limit > 0 ? all.slice(0, limit) : all)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    const ctx = gsap.context(() => {
      const blogTitleEl = sectionRef.current?.querySelector('.blog-title')
      const blogSubEl = sectionRef.current?.querySelector('.blog-sub')
      const blogPostListEl = sectionRef.current?.querySelector('.blog-posts-list')
      const blogPostRowEls = sectionRef.current?.querySelectorAll('.blog-post-row')

      if (blogTitleEl) {
        gsap.from(blogTitleEl, {
          y: 60, opacity: 0, duration: 1, ease: 'power4.out', force3D: true,
          scrollTrigger: { trigger: blogTitleEl, start: 'top 85%', once: true }
        })
      }
      if (blogSubEl) {
        gsap.from(blogSubEl, {
          y: 30, opacity: 0, duration: 0.8, delay: 0.2, ease: 'power3.out', force3D: true,
          scrollTrigger: { trigger: blogSubEl, start: 'top 85%', once: true }
        })
      }
      if (blogPostRowEls && blogPostRowEls.length > 0) {
        gsap.from(blogPostRowEls, {
          y: 30, opacity: 0, duration: 0.7, stagger: 0.1, ease: 'power3.out', force3D: true,
          scrollTrigger: { trigger: blogPostListEl, start: 'top 85%', once: true }
        })
      }
    }, sectionRef)

    return () => ctx.revert()
  }, [loading])

  const closeModal = () => setModal(null)

  const [sortBy, setSortBy] = useState('newest')

  const sortedPosts = [...posts].sort((a, b) => {
    if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at)
    return new Date(b.created_at) - new Date(a.created_at)
  })

  return (
    <>
      <style>{`
        #blog {
          min-height: 60vh;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          padding: 120px 6vw;
          border-bottom: 1px solid var(--muted);
          gap: 24px;
        }
        .blog-tag {
          font-size: 11px;
          letter-spacing: 0.4em;
          text-transform: uppercase;
          color: var(--accent);
        }
        .blog-title {
          font-family: var(--font-display);
          font-size: clamp(36px, 6vw, 80px);
          font-weight: 800;
          text-transform: uppercase;
          line-height: 1;
        }
        .blog-sub {
          font-size: 15px;
          color: #666;
          letter-spacing: 0.15em;
          text-transform: uppercase;
        }
        .blog-divider {
          width: 40px;
          height: 1px;
          background: var(--muted);
          margin: 8px 0;
        }
        .blog-posts-list {
          width: 100%;
          margin: 8px 0 0;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }
        @media (max-width: 900px) {
          .blog-posts-list { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 560px) {
          .blog-posts-list { grid-template-columns: 1fr; }
        }
        @media (max-width: 480px) {
          #blog {
            padding: 80px 4vw;
            gap: 16px;
          }
          .blog-title {
            font-size: clamp(28px, 8vw, 36px);
          }
          .blog-sub {
            font-size: 12px;
            letter-spacing: 0.1em;
          }
          .blog-tag {
            font-size: 10px;
          }
          .blog-posts-list {
            gap: 16px;
          }
          .blog-card-cover {
            height: 140px;
          }
          .blog-card-cover-title {
            font-size: 13px;
          }
          .blog-card-body {
            padding: 12px 14px 16px;
          }
          .blog-post-summary {
            font-size: 12px;
          }
          .blog-view-all {
            padding: 10px 20px;
            font-size: 11px;
          }
          .blog-sort-btn {
            padding: 6px 12px;
            font-size: 10px;
          }
        }
        .blog-post-card {
          display: flex;
          flex-direction: column;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 12px;
          overflow: hidden;
          cursor: pointer;
          background: rgba(255,255,255,0.02);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .blog-post-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 16px 48px rgba(0,0,0,0.6);
        }
        .blog-card-cover {
          position: relative;
          height: 180px;
          overflow: hidden;
          flex-shrink: 0;
        }
        .blog-card-cover img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .blog-card-cover-gradient {
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #1c1c1c 0%, #0a0a0a 100%);
        }
        .blog-card-cover-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 55%);
          display: flex;
          align-items: flex-end;
          padding: 12px 14px;
        }
        .blog-card-cover-title {
          font-family: var(--font-display);
          font-size: 15px;
          font-weight: 700;
          color: #fff;
          line-height: 1.35;
          letter-spacing: -0.01em;
          text-shadow: 0 1px 4px rgba(0,0,0,0.8);
        }
        .blog-card-body {
          padding: 14px 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex: 1;
        }
        .blog-post-date {
          font-size: 11px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #666;
        }
        .blog-post-summary {
          font-size: 13.5px;
          color: #999;
          line-height: 1.6;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .blog-loading {
          font-size: 13px;
          color: #666;
          letter-spacing: 0.1em;
          padding: 16px 0;
        }
        .blog-view-all {
          display: inline-block;
          margin-top: 32px;
          padding: 12px 28px;
          border: 1px solid var(--muted, #e0e0e0);
          font-size: 12px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          cursor: pointer;
          background: transparent;
          color: inherit;
          font-family: var(--font-display);
          font-weight: 700;
          transition: background 0.2s, color 0.2s, border-color 0.2s;
        }
        .blog-view-all:hover {
          background: var(--accent, #d4f029);
          color: #000;
          border-color: var(--accent, #d4f029);
        }
        /* Hide scrollbar in modal */
        .blog-modal-scroll::-webkit-scrollbar { display: none; }
        .blog-modal-scroll { -ms-overflow-style: none; scrollbar-width: none; }
        /* Hide scrollbar on textarea in edit mode */
        textarea::-webkit-scrollbar { display: none; }
        textarea { -ms-overflow-style: none; scrollbar-width: none; }
        .blog-sort-bar {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 8px;
          align-self: flex-end;
        }
        .blog-sort-btn {
          padding: 7px 16px;
          border: 1px solid rgba(255,255,255,0.1);
          background: transparent;
          color: #666;
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          border-radius: 100px;
          cursor: pointer;
          transition: all 0.2s;
          font-family: var(--font-sans);
        }
        .blog-sort-btn.active {
          border-color: var(--accent);
          color: var(--accent);
          background: rgba(212,240,41,0.06);
        }
        .blog-sort-btn:hover:not(.active) {
          border-color: rgba(255,255,255,0.25);
          color: #aaa;
        }
        .blog-dialog-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.75);
          backdrop-filter: blur(4px); z-index: 1000;
          display: flex; align-items: center; justify-content: center; padding: 20px;
        }
        .blog-dialog-content {
          position: fixed; top: 50%; left: 50%;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 16px; width: calc(100% - 48px); max-width: 860px; max-height: 92vh;
          overflow-y: auto; z-index: 1001;
        }
        @media (max-width: 480px) {
          .blog-dialog-content {
            width: calc(100% - 24px);
            max-height: 95vh;
            border-radius: 12px;
          }
        }
        .blog-dialog-content::-webkit-scrollbar { display: none; }
        .blog-dialog-content { -ms-overflow-style: none; scrollbar-width: none; }
        .blog-hover-tooltip {
          background: var(--surface); border: 1px solid var(--border); border-radius: 12px;
          padding: 12px; max-width: 280px; font-size: 13px; color: var(--fg);
          box-shadow: 0 20px 40px rgba(0,0,0,0.5); z-index: 9999; line-height: 1.5;
        }
        .blog-card-wrapper {
          position: relative;
          width: 100%;
          height: 100%;
          cursor: pointer;
        }
      `}</style>
      <section id="blog" ref={sectionRef}>
        <span className="blog-tag">Blog</span>
        <div className="blog-divider"></div>
        <div style={{ marginBottom: -28, position: 'relative', zIndex: 2 }}>
          <YorkieDog variant="blog" size={110} />
        </div>
        <h2 className="blog-title" style={{ position: 'relative', zIndex: 1 }}>部落格</h2>

        <p className="blog-sub">想法 · 技術 · 分享</p>

        {isAdmin && !isCreating && (
          <Button
            variant="accent"
            size="sm"
            onClick={() => { setIsCreating(true); resetEditFields(); }}
            style={{ marginTop: 10 }}
          >
            + 發佈新文章
          </Button>
        )}

        {loading && <p className="blog-loading">載入中...</p>}

        {!loading && posts.length > 0 && (
          <>
            {limit === 0 && (
              <div className="blog-sort-bar">
                <span style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#444', marginRight: 4 }}>排序</span>
                {[
                  { key: 'newest', label: '最新' },
                  { key: 'oldest', label: '最早' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    className={`blog-sort-btn${sortBy === opt.key ? ' active' : ''}`}
                    onClick={() => setSortBy(opt.key)}
                  >{opt.label}</button>
                ))}
              </div>
            )}
            <div className="blog-posts-list">
            <Tooltip.Provider delayDuration={500}>
            {(limit > 0 ? posts : sortedPosts).map((post, idx) => {
              const gradients = [
                'linear-gradient(135deg, #1a1a2e, #16213e)',
                'linear-gradient(135deg, #0f3460, #533483)',
                'linear-gradient(135deg, #1b1b2f, #2b2d42)',
                'linear-gradient(135deg, #162447, #1f4068)',
                'linear-gradient(135deg, #1a0533, #4a0e8f)',
              ]
              const date = new Date(post.created_at).toLocaleDateString('zh-TW', {
                year: 'numeric', month: 'long', day: 'numeric'
              })
              return (
                <Tooltip.Root key={post.id}>
                  <Tooltip.Trigger asChild>
                    <div style={{ perspective: '800px', width: '100%', height: '100%' }}>
                      <TiltCard onClick={() => setModal(post)}>
                        <div className="blog-post-card" style={{ height: '100%', margin: 0 }}>
                          <div className="blog-card-cover">
                            {post.cover_image ? (
                              <img
                                src={post.cover_image}
                                alt={post.title}
                                onError={e => {
                                  // Hide broken image and show gradient fallback
                                  e.target.style.display = 'none'
                                  const fallback = e.target.parentNode.querySelector('.blog-card-cover-gradient-fallback')
                                  if (fallback) fallback.style.display = 'block'
                                }}
                              />
                            ) : null}
                            {/* Gradient fallback: shown when no cover_image or when img fails */}
                            <div
                              className="blog-card-cover-gradient blog-card-cover-gradient-fallback"
                              style={{
                                background: gradients[idx % gradients.length] || gradients[0],
                                display: post.cover_image ? 'none' : 'block',
                              }}
                            />
                            <div className="blog-card-cover-overlay">
                              <span className="blog-card-cover-title">{post.title}</span>
                            </div>
                          </div>
                          <div className="blog-card-body">
                            <span className="blog-post-date">{date}</span>
                            {post.summary && (
                              <span className="blog-post-summary">{post.summary}</span>
                            )}
                          </div>
                        </div>
                      </TiltCard>
                    </div>
                  </Tooltip.Trigger>
                  {post.summary && (
                    <Tooltip.Portal>
                      <Tooltip.Content className="blog-hover-tooltip" sideOffset={8}>
                        <p style={{ margin: 0, lineHeight: 1.6 }}>{post.summary.slice(0, 140)}{post.summary.length > 140 ? '...' : ''}</p>
                        <Tooltip.Arrow style={{ fill: 'var(--border)' }} />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  )}
                </Tooltip.Root>
              )
            })}
            </Tooltip.Provider>
            </div>
          </>
        )}

        {limit > 0 && (
          <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            <Button
              variant="outline"
              size="default"
              className="blog-view-all"
              onClick={() => { navigate('/blog'); window.scrollTo({ top: 0, behavior: 'instant' }) }}
            >
              查看全部文章 →
            </Button>
          </div>
        )}

        {/* Modal */}
        <Dialog.Root open={!!modal} onOpenChange={(open) => { if (!open) setModal(null) }}>
          <AnimatePresence>
            {modal && (
              <Dialog.Portal forceMount>
                <Dialog.Overlay asChild>
                  <motion.div className="blog-dialog-overlay"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => setModal(null)}
                  />
                </Dialog.Overlay>
                <Dialog.Content asChild onOpenAutoFocus={e => e.preventDefault()}>
                  <motion.div className="blog-dialog-content blog-modal-scroll"
                    style={{ x: '-50%', y: '-50%' }}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    onWheel={e => e.stopPropagation()}
                    onClick={e => e.stopPropagation()}
                  >
                    {/* Hidden DialogTitle for accessibility */}
                    <Dialog.Title style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
                      {modal.title}
                    </Dialog.Title>
                    <Dialog.Description style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
                      {modal.excerpt || '部落格文章內容'}
                    </Dialog.Description>
                    
                    {modal.cover_image ? (
                      <div style={{ 
                        position: 'relative', 
                        width: '100%', 
                        height: '380px', 
                        maxHeight: '420px', 
                        overflow: 'hidden', 
                        background: '#0c0c0f', 
                        borderBottom: '1px solid rgba(255,255,255,0.08)', 
                        flexShrink: 0 
                      }}>
                        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 120%, rgba(200,148,42,0.08), transparent 70%)' }} />
                        <img
                          src={modal.cover_image}
                          alt=""
                          onError={(e) => { e.currentTarget.style.display = 'none' }}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.4) 40%, transparent 80%)', display: 'flex', alignItems: 'flex-end', padding: '0 40px 32px' }}>
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, color: '#fff', textShadow: '0 4px 20px rgba(0,0,0,0.9)', lineHeight: 1.2, maxWidth: '90%' }}>{modal.title}</span>
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        width: '100%',
                        height: '220px',
                        background: [
                          'linear-gradient(135deg, #0d1b2a 0%, #1a1a3e 50%, #0f0f1e 100%)',
                          'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
                          'linear-gradient(135deg, #1a0533 0%, #2d1b69 50%, #11998e 100%)',
                        ][Math.abs(modal.id || 0) % 3],
                        flexShrink: 0,
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        display: 'flex',
                        alignItems: 'flex-end',
                        padding: '24px 40px',
                        position: 'relative',
                        overflow: 'hidden',
                      }}>
                        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 30% 50%, rgba(255,255,255,0.03) 0%, transparent 70%)' }} />
                        <div style={{ position: 'relative', zIndex: 1, padding: '0 40px 24px', width: '100%', boxSizing: 'border-box' }}>
                          <span style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 800, color: '#fff', textShadow: '0 2px 16px rgba(0,0,0,0.9)', lineHeight: 1.2 }}>{modal.title}</span>
                        </div>
                      </div>
                    )}

                    <div style={{ padding: '36px 40px' }}>
                      <span style={{ display: 'block', marginBottom: '20px', fontSize: '11px', letterSpacing: '0.25em', textTransform: 'uppercase', color: '#444', fontWeight: 600 }}>
                        {new Date(modal.created_at).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </span>

                      {isEditing ? (
                        <>
                          <label style={{ display: 'block', fontSize: '12px', color: '#555', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '6px' }}>封面圖片 URL</label>
                          <input
                            value={editCoverImage}
                            onChange={(e) => setEditCoverImage(e.target.value)}
                            placeholder="https://..."
                            style={{ width: '100%', background: 'rgba(255,255,255,0.03)', color: '#eee', border: '1px solid rgba(255,255,255,0.1)', padding: '10px 12px', marginBottom: '16px', borderRadius: '8px', outline: 'none', fontSize: '13px', boxSizing: 'border-box' }}
                          />
                          <label style={{ display: 'block', fontSize: '12px', color: '#555', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '6px' }}>標題</label>
                          <input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            style={{ width: '100%', fontSize: '24px', fontWeight: 800, background: '#111', color: '#fff', border: '1px solid #333', marginBottom: '16px', padding: '12px', borderRadius: '8px', outline: 'none' }}
                          />
                          <label style={{ display: 'block', fontSize: '12px', color: '#555', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '6px' }}>摘要</label>
                          <textarea
                            value={editSummary}
                            onChange={(e) => setEditSummary(e.target.value)}
                            style={{ width: '100%', minHeight: '60px', fontSize: '14px', background: '#111', color: '#ccc', border: '1px solid #333', marginBottom: '16px', padding: '12px', borderRadius: '8px', outline: 'none', resize: 'vertical' }}
                          />
                          <label style={{ display: 'block', fontSize: '12px', color: '#555', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '6px' }}>內容 (Markdown)</label>
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            style={{ width: '100%', minHeight: '300px', fontSize: '15px', lineHeight: 1.8, background: '#111', color: '#fff', border: '1px solid #333', marginBottom: '24px', padding: '12px', borderRadius: '8px', outline: 'none', resize: 'vertical' }}
                          />
                        </>
                      ) : (
                        <>
                          <div className="blog-content-markdown" style={{ fontSize: '15px', color: '#b0b0b0', lineHeight: 2, marginBottom: '28px', fontWeight: 300, letterSpacing: '0.01em', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                            <ReactMarkdown
                              rehypePlugins={[rehypeRaw]}
                              remarkPlugins={[remarkGfm]}
                              components={{
                                h1: ({node, ...props}) => <h1 style={{ color: '#fff', fontSize: '28px', fontWeight: 800, margin: '32px 0 16px', fontFamily: 'var(--font-display)' }} {...props} />,
                                h2: ({node, ...props}) => <h2 style={{ color: '#fff', fontSize: '22px', fontWeight: 800, margin: '32px 0 16px', borderLeft: '3px solid var(--accent)', paddingLeft: '12px', fontFamily: 'var(--font-display)' }} {...props} />,
                                h3: ({node, ...props}) => <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 700, margin: '24px 0 12px' }} {...props} />,
                                p: ({node, ...props}) => <p style={{ marginBottom: '18px', lineHeight: 1.8 }} {...props} />,
                                ul: ({node, ...props}) => <ul style={{ paddingLeft: '20px', marginBottom: '18px', listStyleType: 'square' }} {...props} />,
                                li: ({node, ...props}) => <li style={{ marginBottom: '8px' }} {...props} />,
                                a: ({node, ...props}) => <a style={{ color: 'var(--accent)', textDecoration: 'underline', pointerEvents: 'auto', position: 'relative', zIndex: 1 }} target="_blank" rel="noopener noreferrer" {...props} />,
                                strong: ({node, ...props}) => <strong style={{ color: '#fff', fontWeight: 700 }} {...props} />,
                                img: ({node, ...props}) => <img style={{ maxWidth: '100%', height: 'auto', borderRadius: '8px', margin: '16px 0' }} {...props} />,
                                code: ({node, inline, ...props}) => (
                                  <code style={{ 
                                    background: 'rgba(255,255,255,0.06)', 
                                    padding: inline ? '2px 6px' : '12px 16px', 
                                    borderRadius: '6px', 
                                    fontSize: '0.9em',
                                    display: inline ? 'inline' : 'block',
                                    fontFamily: 'monospace',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    overflowX: 'auto',
                                    whiteSpace: inline ? 'normal' : 'pre-wrap',
                                    wordBreak: 'break-all',
                                    maxWidth: '100%',
                                    margin: inline ? '0' : '12px 0'
                                  }} {...props} />
                                )
                              }}
                            >
                              {modal.content || modal.summary || '此文章尚無內容...'}
                            </ReactMarkdown>
                          </div>
                          <AiSummaryButton type="blog" title={modal.title} content={modal.content || modal.summary || ''} />
                        </>
                      )}

                      <Comments type="blog" id={modal.id} />

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        {isAdmin && (
                          isEditing ? (
                            <>
                              <button onClick={handleSaveBlog} disabled={saving} style={{ padding: '10px 24px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                                {saving ? '儲存中...' : '儲存'}
                              </button>
                              <button onClick={() => setIsEditing(false)} style={{ padding: '10px 24px', background: 'none', border: '1px solid #444', color: '#888', borderRadius: '6px', cursor: 'pointer' }}>取消</button>
                            </>
                          ) : (
                            <div style={{ display: 'flex', gap: 10 }}>
                              <button onClick={() => setIsEditing(true)} style={{ padding: '10px 24px', background: 'none', border: '1px solid var(--accent)', color: 'var(--accent)', borderRadius: '6px', cursor: 'pointer' }}>編輯</button>
                              <button onClick={() => handleDeleteBlog(modal.id)} style={{ padding: '10px 24px', background: 'rgba(255,0,0,0.1)', border: '1px solid #ff4444', color: '#ff4444', borderRadius: '6px', cursor: 'pointer' }}>刪除</button>
                            </div>
                          )
                        )}

                        {!isEditing && (
                          <button
                            onClick={closeModal}
                            style={{
                              padding: '12px 28px',
                              background: 'none',
                              border: '1px solid rgba(255,255,255,0.15)',
                              color: '#aaa',
                              fontFamily: 'var(--font-sans)',
                              fontSize: '14px',
                              fontWeight: 500,
                              borderRadius: '8px',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                              e.currentTarget.style.color = '#fff';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                              e.currentTarget.style.color = '#aaa';
                            }}
                          >
                            關閉文章
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                </Dialog.Content>
              </Dialog.Portal>
            )}
          </AnimatePresence>
        </Dialog.Root>

        <AnimatePresence>
        {isCreating && (
          <Dialog.Root open={isCreating} onOpenChange={(open) => { if (!open) setIsCreating(false) }}>
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild>
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  exit={{ opacity: 0 }}
                  style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} 
                  onClick={() => setIsCreating(false)} 
                />
              </Dialog.Overlay>
              <Dialog.Content asChild>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, x: '-50%', y: '-40%' }}
                  animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
                  exit={{ opacity: 0, scale: 0.95, x: '-50%', y: '-48%' }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  style={{ position: 'fixed', top: '50%', left: '50%', width: '90%', maxWidth: '800px', maxHeight: '92vh', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px', zIndex: 10001, overflowY: 'auto', padding: '40px' }}
                  className="blog-modal-scroll"
                >
                  <Dialog.Title style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
                    發佈新文章
                  </Dialog.Title>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', marginBottom: '32px', fontWeight: 800 }}>發佈新文章</h2>
              
              <label style={{ display: 'block', fontSize: '12px', color: '#555', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '6px' }}>封面圖片 URL</label>
              <input value={editCoverImage} onChange={(e) => setEditCoverImage(e.target.value)} placeholder="https://..." style={{ width: '100%', background: 'rgba(255,255,255,0.03)', color: '#eee', border: '1px solid rgba(255,255,255,0.1)', padding: '12px', marginBottom: '20px', borderRadius: '8px', outline: 'none' }} />

              <label style={{ display: 'block', fontSize: '12px', color: '#555', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '6px' }}>標題</label>
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ width: '100%', fontSize: '24px', fontWeight: 800, background: '#111', color: '#fff', border: '1px solid #333', marginBottom: '20px', padding: '12px', borderRadius: '8px', outline: 'none' }} />
              
              <label style={{ display: 'block', fontSize: '12px', color: '#555', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '6px' }}>網址路徑 (Slug)</label>
              <input value={editSlug} onChange={(e) => setEditSlug(e.target.value)} placeholder="my-new-post" style={{ width: '100%', background: '#111', color: '#eee', border: '1px solid #333', marginBottom: '20px', padding: '12px', borderRadius: '8px', outline: 'none' }} />

              <label style={{ display: 'block', fontSize: '12px', color: '#555', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '6px' }}>摘要</label>
              <textarea value={editSummary} onChange={(e) => setEditSummary(e.target.value)} style={{ width: '100%', minHeight: '60px', background: '#111', color: '#ccc', border: '1px solid #333', marginBottom: '20px', padding: '12px', borderRadius: '8px', outline: 'none', resize: 'vertical' }} />

              <label style={{ display: 'block', fontSize: '12px', color: '#555', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '6px' }}>內容 (Markdown)</label>
              <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} style={{ width: '100%', minHeight: '300px', background: '#111', color: '#fff', border: '1px solid #333', marginBottom: '32px', padding: '12px', borderRadius: '8px', outline: 'none', resize: 'vertical' }} />

              <div style={{ display: 'flex', gap: '16px', justifyContent: 'flex-end' }}>
                <button onClick={() => setIsCreating(false)} style={{ padding: '12px 28px', background: 'none', border: '1px solid #333', color: '#666', borderRadius: '8px', cursor: 'pointer' }}>取消</button>
                <button onClick={handleCreateBlog} disabled={saving} style={{ padding: '12px 32px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 800, cursor: 'pointer' }}>{saving ? '發佈中...' : '確認發佈'}</button>
              </div>
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        )}
        </AnimatePresence>
      </section>
    </>
  )
}
