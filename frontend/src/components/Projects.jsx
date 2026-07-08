import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useNavigate } from 'react-router-dom'
import { AnimatedNumber } from './ui/AnimatedNumber'
import * as Dialog from '@radix-ui/react-dialog'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Copy, Check } from 'lucide-react'
import useAuthStore from '../store/authStore'
import Comments from './Comments'
import { WobotSVG } from './AIAssistant'
import YorkieDog from './YorkieDog'
import { Star, GitFork } from 'lucide-react'
import { HoverEffect } from './ui/HoverCardEffect'
import fetchProjectsCached from '../utils/fetchProjects'

import Reactions from './Reactions'
import { useToast } from './ui/Toast'
import { API_URL } from '../config/api'
const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      style={{
        position: 'absolute',
        top: '8px',
        right: '8px',
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '6px',
        padding: '6px',
        color: copied ? '#4ade80' : '#888',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        backdropFilter: 'blur(4px)',
        opacity: 0,
        visibility: 'hidden'
      }}
      className="code-copy-button"
      title="Copy to clipboard"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
};

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


const STYLES = `
  #projects {
    padding: 120px 6vw;
    background: #0e0a06;
    border-bottom: 1px solid rgba(255,255,255,0.03);
  }
  .project-tag {
    font-size: 11px;
    letter-spacing: 0.4em;
    text-transform: uppercase;
    color: #C8942A;
    display: block;
    margin-bottom: 24px;
  }
  .project-title {
    font-family: var(--font-display);
    font-size: clamp(40px, 8vw, 90px);
    font-weight: 900;
    line-height: 0.9;
    color: #fff;
    margin-bottom: 60px;
    text-transform: uppercase;
  }
  .project-card-v2 {
    background: rgba(255,255,255,0.02);
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 24px;
    overflow: hidden;
    transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1);
  }
  .project-row {
    padding: 32px 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    display: flex;
    align-items: center;
    cursor: pointer;
    transition: all 0.3s;
  }
  .project-row:hover {
    padding-left: 20px;
    background: rgba(200,148,42,0.03);
  }
  .row-num { font-size: 14px; color: #444; width: 60px; font-weight: 700; }
  .row-name { font-size: 24px; color: #fff; flex: 1; font-weight: 800; }
  .row-arrow { font-size: 24px; color: #C8942A; opacity: 0; transition: 0.3s; }
  .project-row:hover .row-arrow { opacity: 1; transform: translateX(10px); }

  .project-dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.85);
    backdrop-filter: blur(12px);
    z-index: 10000;
  }
  .project-dialog-content {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 90vw;
    max-width: 1000px;
    max-height: 92vh;
    background: #0e0a06;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 32px;
    overflow-y: auto;
    z-index: 10001;
    scrollbar-width: none;
  }
  .project-dialog-content::-webkit-scrollbar { display: none; }
  
  /* Mobile responsive styles */
  @media (max-width: 768px) {
    .project-dialog-content {
      width: 95vw;
      max-height: 95vh;
      border-radius: 20px;
      padding: 0;
    }
    .project-title {
      font-size: clamp(32px, 8vw, 60px);
    }
    .row-name {
      font-size: 18px;
    }
    .row-num {
      width: 40px;
      font-size: 12px;
    }
    .project-dialog-content h2 {
      font-size: 28px !important;
    }
    .project-dialog-content > div:first-of-type {
      height: 280px !important;
    }
    .project-dialog-content > div:first-of-type > div:last-child {
      left: 20px !important;
      right: 20px !important;
      bottom: 20px !important;
    }
    .project-dialog-content > div:last-child {
      padding: 24px 20px 32px !important;
    }
  }
  
  /* iPhone 4 & Small Devices */
  @media (max-width: 480px) {
    .project-title {
      font-size: clamp(28px, 10vw, 48px);
      margin-bottom: 40px;
    }
    .row-name {
      font-size: 15px;
    }
    .row-num {
      width: 32px;
      font-size: 11px;
    }
    .row-arrow {
      font-size: 18px;
    }
    .project-dialog-content h2 {
      font-size: 22px !important;
      margin-bottom: 10px !important;
    }
    .project-dialog-content > div:first-of-type {
      height: 220px !important;
    }
    .project-dialog-content > div:first-of-type > div:last-child {
      left: 16px !important;
      right: 16px !important;
      bottom: 16px !important;
    }
    .project-dialog-content > div:last-child {
      padding: 20px 16px 28px !important;
    }
    .project-view-all {
      padding: 14px 32px;
      font-size: 12px;
    }
  }

  .project-sort-bar {
    display: flex;
    gap: 12px;
    margin-bottom: 40px;
    justify-content: flex-end;
  }
  .project-sort-btn {
    padding: 8px 20px;
    background: transparent;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 100px;
    color: #666;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.3s;
  }
  .project-sort-btn.active {
    background: #C8942A;
    color: #000;
    border-color: #C8942A;
  }
  .project-view-all {
    margin-top: 60px;
    padding: 18px 48px;
    background: transparent;
    border: 1px solid #C8942A;
    color: #C8942A;
    font-size: 14px;
    font-weight: 800;
    border-radius: 100px;
    cursor: pointer;
    transition: all 0.3s;
  }
  .project-view-all:hover {
    background: #C8942A;
    color: #000;
  }
`

export default function Projects({ limit = 3 }) {
  const sectionRef = useRef(null)
  const navigate = useNavigate()
  const { toast } = useToast()
  useEffect(() => {
    const style = document.createElement('style')
    style.innerHTML = STYLES
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null)
  const [sortBy, setSortBy] = useState('stars')

  const { user, accessToken, silentRefresh, clearAuth } = useAuthStore()
  const isAdmin = user?.email === 'qweasd226410@gmail.com'
  const [isEditing, setIsEditing] = useState(false)
  const [editDesc, setEditDesc] = useState('')
  const [editImageUrl, setEditImageUrl] = useState('')
  const [editTech, setEditTech] = useState([])
  const [tempTech, setTempTech] = useState('')
  const [saving, setSaving] = useState(false)

  const LANG_COLORS = {
    JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5',
    HTML: '#e34c26', CSS: '#563d7c', SCSS: '#c6538c', Vue: '#41b883',
    Go: '#00ADD8', Rust: '#dea584', Java: '#b07219', 'C++': '#f34b7d',
    C: '#555555', Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138',
    Kotlin: '#A97BFF', Dart: '#00B4AB', Shell: '#89e051',
  }

  const detectLanguages = (p) => {
    if (!p) return []
    // 優先使用 GitHub Topics
    let langs = [...(p.topics || [])]
    
    // 加入主要語言
    if (p.language) langs.push(p.language)
    
    // 如果有語言統計，將佔比超過 1% 的語言也加入標籤
    if (p.language_stats) {
      Object.entries(p.language_stats).forEach(([lang, pct]) => {
        if (pct > 1) langs.push(lang)
      })
    }

    const n = (p.name || '').toLowerCase()
    if (n.includes('react')) langs.push('React')
    if (n.includes('node')) langs.push('Node.js')
    if (n.includes('typescript')) langs.push('TypeScript')
    if (n.includes('tailwind')) langs.push('Tailwind')
    if (n.includes('vite')) langs.push('Vite')
    if (n.includes('next')) langs.push('Next.js')
    
    // 過濾並去重
    return [...new Set(langs.filter(Boolean))]
  }

  useEffect(() => {
    if (modal) {
      setEditDesc(modal.description || '')
      setEditImageUrl(modal.image_url || '')
      setEditTech(modal.topics || detectLanguages(modal))
      setIsEditing(false)
      setTempTech('')
    }
  }, [modal])

  const handleSaveProject = async () => {
    if (!accessToken) return toast.error('請先登入')
    setSaving(true)
    const performRequest = async (token) => {
      return fetch(`${API_URL}/projects/${modal.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ description: editDesc, image_url: editImageUrl, topics: editTech, name: modal.name, github_id: modal.github_id })
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
        setProjects(prev => {
          const updated = prev.map(p =>
            (p.id && p.id === data.data.id) || (p.github_id && p.github_id === data.data.github_id)
              ? data.data
              : p
          )
          sessionStorage.setItem('projectsListCache', JSON.stringify(updated))
          return updated
        })
        setIsEditing(false)
        toast.success('專案更新成功')
      } else {
        toast.error(data.message || '儲存失敗，請稍後再試')
      }
    } catch (e) {
      toast.error(e.message || '存取失敗，請檢查網路連線')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    fetchProjectsCached()
      .then(listData => {
        const list = (listData || []).filter(p => p.name !== 'WayneLY-Chen')
        setProjects(list)
        setLoading(false)
        // 若有任何專案缺少語言統計，或快取的資料不完整，在背景靜默觸發一次同步
        const hasMissingData = list.some(p => !p.language_stats || Object.keys(p.language_stats).length === 0)
        if (hasMissingData) {
          console.log('[Projects] 偵測到部分資料缺失，正在背景同步...')
          fetch(`${API_URL}/projects/sync`, { method: 'POST' })
            .then(r => r.json())
            .then(syncData => {
              if (syncData.success && syncData.data) {
                const refreshed = syncData.data;
                sessionStorage.setItem('projectsListCache', JSON.stringify(refreshed));
                setProjects(refreshed.filter(p => p.name !== 'WayneLY-Chen'));
              }
            })
            .catch(() => {})
        }
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  useEffect(() => {
    if (loading) return
    const ctx = gsap.context(() => {
      // 修復：全部改用 sectionRef.current scoped query，避免跨元件污染全域 class
      const sectionTagEl = sectionRef.current.querySelector('.section-tag')
      const sectionTitleEl = sectionRef.current.querySelector('.section-title')
      const projectRowListEl = sectionRef.current.querySelector('.project-row-list')
      const projectRowEls = sectionRef.current.querySelectorAll('.project-row')

      if (sectionTagEl) {
        gsap.from(sectionTagEl, {
          y: 20, opacity: 0, duration: 0.6, ease: 'power3.out', force3D: true,
          scrollTrigger: { trigger: sectionTagEl, start: 'top 90%', once: true }
        })
      }
      if (sectionTitleEl) {
        gsap.from(sectionTitleEl, {
          y: 60, opacity: 0, duration: 1, ease: 'power4.out', force3D: true,
          scrollTrigger: { trigger: sectionTitleEl, start: 'top 85%', once: true }
        })
      }
      if (projectRowEls.length > 0) {
        // 修復：直接傳 NodeList 取代 class 字串，且加 once:true
        gsap.from(projectRowEls, {
          y: 30, opacity: 0, duration: 0.7, stagger: 0.1, ease: 'power3.out', force3D: true,
          scrollTrigger: { trigger: projectRowListEl, start: 'top 85%', once: true }
        })
      }
    }, sectionRef)
    return () => ctx.revert()
  }, [loading])

  const sortedProjects = [...projects].sort((a, b) => {
    if (sortBy === 'stars') return b.stars - a.stars
    if (sortBy === 'newest') return new Date(b.updated_at) - new Date(a.updated_at)
    if (sortBy === 'oldest') return new Date(a.updated_at) - new Date(b.updated_at)
    return 0
  })

  return (
    <section id="projects" ref={sectionRef} style={{ background: '#0e0a06', color: '#fff', padding: '120px 6vw', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <style>{`
        .section-tag { font-size: 11px; letter-spacing: 0.4em; text-transform: uppercase; color: #C8942A; font-weight: 700; margin-bottom: 12px; display: block; }
        .section-title { font-family: var(--font-display); font-size: clamp(40px, 8vw, 100px); font-weight: 800; text-transform: uppercase; line-height: 0.9; margin-bottom: 60px; }
        .yorkie-wrapper { text-align: center; margin-bottom: -28px; position: relative; z-index: 2; }
        @media (max-width: 768px) {
          .section-title { margin-bottom: 40px; }
          .yorkie-wrapper { margin-bottom: -10px; }
        }
        .project-row-list { border-top: 1px solid rgba(255,255,255,0.08); margin-top: 40px; }
        .project-row { display: grid; grid-template-columns: 80px 1fr 120px 60px 40px; align-items: center; padding: 40px 0; border-bottom: 1px solid rgba(255,255,255,0.08); cursor: pointer; transition: 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        .project-row:hover { padding-left: 24px; background: rgba(200,148,42,0.02); }
        .row-num { font-size: 14px; color: #444; font-weight: 600; }
        .row-name { font-size: clamp(20px, 3vw, 42px); font-weight: 800; }
        .row-arrow { font-size: 28px; color: #C8942A; opacity: 0; transition: 0.4s; text-align: right; }
        .project-row:hover .row-arrow { opacity: 1; transform: translateX(10px); }
        .project-view-all { margin-top: 60px; padding: 18px 48px; background: transparent; border: 1px solid rgba(200,148,42,0.3); color: #C8942A; font-weight: 700; border-radius: 100px; cursor: pointer; transition: 0.3s; font-size: 14px; letter-spacing: 0.1em; }
        .project-view-all:hover { background: #C8942A; color: #000; }
        .project-sort-bar { display: flex; gap: 12px; margin-bottom: 30px; justify-content: flex-end; }
        .project-sort-btn { padding: 9px 24px; background: transparent; border: 1px solid rgba(255,255,255,0.1); color: #666; border-radius: 100px; cursor: pointer; transition: 0.3s; font-size: 13px; font-weight: 600; }
        .project-sort-btn.active { border-color: #C8942A; color: #C8942A; background: rgba(200,148,42,0.08); }
        .project-dialog-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.9); backdrop-filter: blur(12px); z-index: 1000; }
        .project-dialog-content { position: fixed; top: 50%; left: 50%; width: 92vw; max-width: 960px; max-height: 92vh; max-height: 92dvh; background: #0e0a06; border: 1px solid rgba(200,148,42,0.2); border-radius: 24px; z-index: 1001; overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; }
        .project-dialog-content::-webkit-scrollbar { display: none; }
        /* 手機版彈窗：dvh 用「實際可視高度」計算，關閉鈕不會被推出螢幕外 */
        @media (max-width: 600px) {
          .project-dialog-content { width: 96vw; max-height: 88dvh; border-radius: 16px; }
          .pd-banner { height: 200px !important; }
          .pd-banner-text { bottom: 16px !important; left: 20px !important; right: 20px !important; }
          .pd-banner-text h2 { font-size: 26px !important; }
          .pd-body { padding: 24px 18px 36px !important; }
        }

        /* ── 全頁卡片格線 ── */
        .project-card-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
          margin: 32px 0 0;
          padding-bottom: 60px;
        }
        @media (max-width: 1024px) { .project-card-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 600px)  { .project-card-grid { grid-template-columns: 1fr; } }

        .proj-card {
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.08);
          background: var(--surface, #0e0a06);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          transition: border-color 0.3s, transform 0.3s, box-shadow 0.3s;
        }
        .proj-card:hover {
          border-color: rgba(200,148,42,0.5);
          transform: translateY(-4px);
          box-shadow: 0 20px 40px rgba(0,0,0,0.5);
        }
        .proj-card-img {
          width: 100%;
          aspect-ratio: 16 / 9;
          overflow: hidden;
          background: #0b0b0e;
          position: relative;
          flex-shrink: 0;
        }
        .proj-card-img img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          transition: transform 0.5s;
        }
        .proj-card:hover .proj-card-img img { transform: scale(1.05); }
        .proj-card-img-overlay {
          position: absolute; inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%);
          pointer-events: none;
        }
        .proj-card-body {
          padding: 16px 18px 20px;
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .proj-card-title {
          font-size: 15px;
          font-weight: 700;
          color: #fff;
          margin-bottom: 6px;
          line-height: 1.3;
        }
        .proj-card-desc {
          font-size: 13.5px;
          color: rgba(255,255,255,0.4);
          line-height: 1.7;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          height: calc(1.7em * 2); /* 確保卡片整齊劃一 */
          margin-bottom: 14px;
          transition: color 0.3s;
          letter-spacing: 0.01em;
        }
        .proj-card:hover .proj-card-desc {
          color: rgba(255,255,255,0.65);
        }
        .proj-card-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-top: auto;
        }
        .proj-card-tag {
          font-size: 10px;
          padding: 2px 8px;
          border: 1px solid rgba(200,148,42,0.3);
          color: rgba(200,148,42,0.75);
          border-radius: 3px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          font-weight: 600;
        }
        .proj-card-meta {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 10px;
          font-size: 11px;
          color: rgba(255,255,255,0.25);
        }

        /* ── 首頁專案卡片 ── */
        .home-project-card {
          display: flex;
          align-items: stretch;
          min-height: 340px;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 16px;
          overflow: hidden;
          background: rgba(255,255,255,0.02);
          cursor: pointer;
          position: relative;
          transition: border-color 0.3s, box-shadow 0.3s, transform 0.3s;
        }
        .home-project-card-img {
          width: 38%;
          flex-shrink: 0;
          position: relative;
          overflow: hidden;
          align-self: stretch;
        }
        .home-project-card-content {
          flex: 1;
          padding: 32px 36px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 12px;
        }
        .home-project-card-arrow {
          display: flex;
          align-items: center;
          padding-right: 32px;
          color: #C8942A;
          font-size: 26px;
          flex-shrink: 0;
        }
        @media (max-width: 768px) {
          .home-project-card {
            flex-direction: column;
            min-height: auto;
          }
          .home-project-card-img {
            width: 100%;
            height: 200px;
          }
          .home-project-card-content {
            padding: 24px 20px;
          }
          .home-project-card-arrow {
            display: none;
          }
        }
      `}</style>
      <style>{`
        .code-block-container:hover .code-copy-button {
          opacity: 1 !important;
          visibility: visible !important;
        }
        .code-copy-button:hover {
          background: rgba(255,255,255,0.15) !important;
          color: #fff !important;
        }
      `}</style>

      <span className="section-tag">Archive</span>
      <div style={{ position: 'relative' }}>
         <div className="yorkie-wrapper">
            <YorkieDog variant="projects" size={110} />
         </div>
         <h2 className="section-title">
           我的專案{limit === 0 && <> <AnimatedNumber value={projects.length} /></>}
         </h2>
      </div>

      {loading ? <div style={{ padding: '40px 0', color: '#444' }}>載入中...</div> : (
        <>
          {limit > 0 ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 40 }}>
                {projects.slice(0, limit).map(p => {
                  const imgSrc = p.image_url || `https://opengraph.githubassets.com/1/WayneLY-Chen/${p.name}`
                  const tags = detectLanguages(p)
                  return (
                    <div
                      key={p.id}
                      onClick={() => setModal(p)}
                      className="home-project-card"
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(200,148,42,0.5)'; e.currentTarget.style.boxShadow = '0 16px 48px rgba(0,0,0,0.5)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)' }}
                    >
                      {/* 縮圖 */}
                      <div className="home-project-card-img">
                        <img
                          src={imgSrc}
                          alt={p.name}
                          style={{ 
                            position: 'absolute', 
                            inset: 0, 
                            width: '100%', 
                            height: '107%', // 稍微拉高圖片以裁掉底部的 GitHub 比例條
                            objectFit: 'cover',
                            objectPosition: 'left top', // 靠左上對齊，OG 圖的重點資訊在左側不被裁掉
                            display: 'block', 
                            transition: 'transform 0.6s cubic-bezier(0.19,1,0.22,1)', 
                            background: '#111' 
                          }}
                          onError={e => {
                            const fb = `https://placehold.co/600x340/0b0b0d/333?text=${encodeURIComponent(p.name)}`
                            if (e.target.src !== fb) e.target.src = fb
                          }}
                        />
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, transparent 35%, rgba(14,10,6,0.45) 70%, rgba(14,10,6,0.95))' }} />
                        {/* 語言比例條 — 比照 /projects 樣式，精確壓在圖片下緣 */}
                        {p.language_stats && Object.keys(p.language_stats).length > 0 && (
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, display: 'flex', zIndex: 3, background: 'rgba(0,0,0,0.5)' }}>
                            {Object.entries(p.language_stats).map(([lang, pct]) => (
                              <div key={lang} title={`${lang}: ${pct}%`} style={{ width: `${pct}%`, background: LANG_COLORS[lang] || '#888', height: '100%' }} />
                            ))}
                          </div>
                        )}
                      </div>
                      {/* 內容 */}
                      <div className="home-project-card-content">
                        <p style={{ fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1.3 }}>{p.name}</p>
                        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description || '暫無描述'}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
                          {tags.length > 0 && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {tags.slice(0, 4).map(t => (
                                <span key={t} style={{ fontSize: 10, padding: '3px 10px', border: '1px solid rgba(200,148,42,0.3)', color: 'rgba(200,148,42,0.75)', borderRadius: 3, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>{t}</span>
                              ))}
                            </div>
                          )}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto', flexShrink: 0 }}>
                            {p.stars > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#C8942A', fontWeight: 700 }}><Star size={14} fill="#C8942A" stroke="#C8942A" />{p.stars}</span>}
                            {p.forks > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#aaa', fontWeight: 700 }}><GitFork size={14} />{p.forks}</span>}
                          </div>
                        </div>
                      </div>
                      {/* 箭頭 */}
                      <div className="home-project-card-arrow">→</div>
                    </div>
                  )
                })}
              </div>
              <div style={{ textAlign: 'center', marginTop: 48 }}>
                <button className="project-view-all" onClick={() => { navigate('/projects'); window.scrollTo({ top: 0, behavior: 'instant' }) }}>查看全部專案 →</button>
              </div>
            </>
          ) : (
            <>
              {/* 排序 */}
              <div className="project-sort-bar">
                <span style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#444', marginRight: 4 }}>排序</span>
                {[
                  { key: 'newest', label: '最新' },
                  { key: 'oldest', label: '最早' },
                  { key: 'stars', label: '熱門' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    className={`project-sort-btn${sortBy === opt.key ? ' active' : ''}`}
                    onClick={() => setSortBy(opt.key)}
                  >{opt.label}</button>
                ))}
              </div>

              {/* 部落格風格卡片格線 */}
              <HoverEffect
                items={sortedProjects.map(p => ({
                  title: p.name,
                  description: p.description || '暫無描述',
                  image: p.image_url || `https://opengraph.githubassets.com/1/WayneLY-Chen/${p.name}`,
                  topics: detectLanguages(p),
                  stars: p.stars || 0,
                  language_stats: p.language_stats || {},
                  onClick: () => setModal(p),
                }))}
              />
            </>
          )}
        </>
      )}

      <Dialog.Root open={!!modal} onOpenChange={o => { if (!o) { setModal(null); setIsEditing(false) } }}>
        <AnimatePresence>
          {modal && (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild><motion.div className="project-dialog-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /></Dialog.Overlay>
              <Dialog.Content asChild onOpenAutoFocus={e => e.preventDefault()}>
                <motion.div className="project-dialog-content" style={{ x: '-50%', y: '-50%' }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} onWheel={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                   {/* Hidden DialogTitle for accessibility */}
                   <Dialog.Title style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
                     {modal.name}
                   </Dialog.Title>
                   <Dialog.Description style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
                     {modal.description || '專案詳細資訊'}
                   </Dialog.Description>
                   
                   {/* 關閉鈕：sticky 固定在彈窗右上角，捲動時不會消失 */}
                   <div style={{ position: 'sticky', top: 0, zIndex: 20, height: 0 }}>
                     <Dialog.Close asChild>
                       <button aria-label="關閉" style={{ position: 'absolute', top: 14, right: 14, width: 38, height: 38, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(200,148,42,0.35)', color: '#fff', fontSize: 19, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>×</button>
                     </Dialog.Close>
                   </div>

                   {/* ── Banner ── */}
                   <div className="pd-banner" style={{ position: 'relative', width: '100%', height: '380px', overflow: 'hidden' }}>
                      <img src={modal.image_url || `https://opengraph.githubassets.com/1/WayneLY-Chen/${modal.name}`} alt={modal.name} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }} onError={e => { e.target.style.display = 'none' }} />
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #0e0a06 10%, transparent 70%)' }} />
                      <div className="pd-banner-text" style={{ position: 'absolute', bottom: 36, left: 48, right: 48 }}>
                        <h2 style={{ fontSize: '42px', fontWeight: 900, color: '#fff', marginBottom: '14px', lineHeight: 1.1, overflowWrap: 'anywhere' }}>{modal.name}</h2>
                        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#C8942A', fontWeight: 700, fontSize: 15 }}><Star size={16} fill="#C8942A" stroke="#C8942A" /> {modal.stars || 0} Stars</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#bbb', fontWeight: 600, fontSize: 15 }}><GitFork size={16} /> {modal.forks || 0} Forks</span>
                        </div>
                      </div>
                   </div>

                   <div className="pd-body" style={{ padding: '40px 48px 56px' }}>
                      {/* ── 技術棧標籤 ── */}
                      {detectLanguages(modal).length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
                          {detectLanguages(modal).map(t => (
                            <span key={t} style={{ fontSize: 11, padding: '4px 12px', border: '1px solid rgba(200,148,42,0.35)', color: '#C8942A', borderRadius: 4, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>{t}</span>
                          ))}
                        </div>
                      )}

                      {/* ── 描述（檢視 / 編輯） ── */}
                      {isEditing ? (
                        <div style={{ marginBottom: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
                          <div>
                            <label style={{ fontSize: 11, color: '#C8942A', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: 8 }}>專案描述</label>
                            <textarea
                              value={editDesc}
                              onChange={e => setEditDesc(e.target.value)}
                              rows={4}
                              style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(200,148,42,0.3)', borderRadius: 10, padding: '14px 16px', color: '#fff', fontSize: 14, lineHeight: 1.7, resize: 'vertical', outline: 'none', scrollbarWidth: 'none' }}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 11, color: '#C8942A', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, display: 'block', marginBottom: 8 }}>預覽圖 URL</label>
                            <input
                              value={editImageUrl}
                              onChange={e => setEditImageUrl(e.target.value)}
                              placeholder="https://..."
                              style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(200,148,42,0.3)', borderRadius: 10, padding: '12px 16px', color: '#fff', fontSize: 14, outline: 'none' }}
                            />
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                              <label style={{ fontSize: 11, color: '#C8942A', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>技術棧</label>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                              {editTech.map(t => (
                                <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 10px', border: '1px solid rgba(200,148,42,0.35)', color: '#C8942A', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase' }}>
                                  {t}
                                  <button onClick={() => setEditTech(editTech.filter(x => x !== t))} style={{ background: 'none', border: 'none', color: '#C8942A', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                                </span>
                              ))}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <input
                                value={tempTech}
                                onChange={e => setTempTech(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (tempTech.trim()) { setEditTech(prev => [...new Set([...prev, tempTech.trim()])]); setTempTech('') } } }}
                                placeholder="輸入技術名稱，Enter 新增"
                                style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 13, outline: 'none' }}
                              />
                              <button
                                type="button"
                                onClick={() => { if (tempTech.trim()) { setEditTech(prev => [...new Set([...prev, tempTech.trim()])]); setTempTech('') } }}
                                style={{ padding: '10px 18px', background: 'rgba(200,148,42,0.15)', border: '1px solid rgba(200,148,42,0.3)', color: '#C8942A', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}
                              >+ 新增</button>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 12, paddingTop: 8 }}>
                            <button onClick={handleSaveProject} disabled={saving} style={{ flex: 1, padding: '14px', background: '#C8942A', color: '#000', borderRadius: 10, fontWeight: 800, fontSize: 15, border: 'none', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                              {saving ? '儲存中...' : '儲存變更'}
                            </button>
                            <button onClick={() => setIsEditing(false)} style={{ padding: '14px 20px', background: 'rgba(255,255,255,0.04)', color: '#666', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>取消</button>
                          </div>
                        </div>
                      ) : (
                        <div className="project-content-markdown" style={{ fontSize: '17px', color: '#aaa', lineHeight: 1.85, fontWeight: 300, marginBottom: '32px', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                          <ReactMarkdown
                            rehypePlugins={[rehypeRaw]}
                            remarkPlugins={[remarkGfm]}
                            components={{
                              h1: ({node, ...props}) => <h1 style={{ color: '#fff', fontSize: '24px', fontWeight: 800, margin: '24px 0 12px' }} {...props} />,
                              h2: ({node, ...props}) => <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 800, margin: '20px 0 10px', borderLeft: '3px solid #C8942A', paddingLeft: '12px' }} {...props} />,
                              p: ({node, ...props}) => <p style={{ marginBottom: '16px' }} {...props} />,
                              ul: ({node, ...props}) => <ul style={{ paddingLeft: '20px', marginBottom: '16px', listStyleType: 'square' }} {...props} />,
                              li: ({node, ...props}) => <li style={{ marginBottom: '6px' }} {...props} />,
                              a: ({node, ...props}) => {
                                // 只包圖片的連結（如徽章）不加底線，維持乾淨排列
                                const imageOnly = node?.children?.length === 1 && node.children[0].tagName === 'img'
                                return (
                                  <a
                                    {...props}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => { e.stopPropagation(); }}
                                    style={{
                                      color: '#C8942A',
                                      textDecoration: imageOnly ? 'none' : 'underline',
                                      pointerEvents: 'auto',
                                      position: 'relative',
                                      zIndex: 10,
                                      cursor: 'pointer'
                                    }}
                                  />
                                )
                              },
                              strong: ({node, ...props}) => <strong style={{ color: '#fff', fontWeight: 700 }} {...props} />,
                              img: ({node, src, ...props}) => {
                                // shields.io 徽章等小圖示：inline 排列（跟 GitHub 一致），不獨佔一行
                                const isBadge = /shields\.io|badgen\.net|img\.shields|\/badge\//.test(src || '')
                                return isBadge
                                  ? <img src={src} style={{ display: 'inline-block', verticalAlign: 'middle', height: '20px', width: 'auto', margin: '3px 4px', borderRadius: '4px' }} {...props} />
                                  : <img src={src} style={{ display: 'block', maxWidth: '100%', height: 'auto', borderRadius: '8px', margin: '16px 0' }} {...props} />
                              },
                              blockquote: ({node, ...props}) => <blockquote style={{ margin: '16px 0', padding: '10px 18px', borderLeft: '3px solid rgba(200,148,42,0.5)', background: 'rgba(200,148,42,0.05)', borderRadius: '0 8px 8px 0', color: '#bbb' }} {...props} />,
                              hr: ({node, ...props}) => <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '28px 0' }} {...props} />,
                              table: ({node, ...props}) => (
                                <div style={{ width: '100%', overflowX: 'auto', margin: '20px 0', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: 'max-content' }} {...props} />
                                </div>
                              ),
                              thead: ({node, ...props}) => <thead style={{ background: 'rgba(200,148,42,0.1)' }} {...props} />,
                              th: ({node, ...props}) => <th style={{ textAlign: 'left', padding: '10px 16px', color: '#C8942A', fontWeight: 700, fontSize: '13px', letterSpacing: '0.03em', textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(200,148,42,0.25)' }} {...props} />,
                              td: ({node, ...props}) => <td style={{ padding: '10px 16px', color: '#bbb', borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'top' }} {...props} />,
                              tr: ({node, ...props}) => <tr {...props} />,
                              code: ({node, inline, className, children, ...props}) => {
                                const match = /language-(\w+)/.exec(className || '');
                                const content = String(children).replace(/\n$/, '');
                                
                                return !inline ? (
                                  <div className="code-block-container" style={{ position: 'relative', margin: '16px 0', borderRadius: '8px', overflow: 'hidden' }}>
                                    <div style={{ 
                                      position: 'absolute', 
                                      top: 0, 
                                      left: 0, 
                                      right: 0, 
                                      height: '32px', 
                                      background: 'rgba(255,255,255,0.03)', 
                                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      padding: '0 12px',
                                      fontSize: '11px',
                                      color: '#555',
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.1em'
                                    }}>
                                      {match ? match[1] : 'code'}
                                    </div>
                                    <CopyButton text={content} />
                                    <SyntaxHighlighter
                                      style={atomDark}
                                      language={match ? match[1] : 'text'}
                                      PreTag="div"
                                      customStyle={{
                                        margin: 0,
                                        padding: '44px 16px 16px',
                                        background: '#0a0a0f',
                                        fontSize: '0.85em',
                                        lineHeight: '1.6',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(255,255,255,0.1)'
                                      }}
                                      {...props}
                                    >
                                      {content}
                                    </SyntaxHighlighter>
                                  </div>
                                ) : (
                                  <code style={{ 
                                    background: 'rgba(255,255,255,0.08)', 
                                    padding: '0.15em 0.4em', 
                                    borderRadius: '4px', 
                                    fontSize: '0.88em',
                                    fontFamily: 'monospace',
                                    color: '#eee',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    verticalAlign: 'middle',
                                    display: 'inline-block',
                                    lineHeight: '1.2',
                                    margin: '0 2px',
                                    position: 'relative',
                                    top: '-1px'
                                  }} {...props}>
                                    {children}
                                  </code>
                                )
                              }
                            }}
                          >
                            { (() => {
                                let content = (modal.readme || modal.description || '此專案尚無詳細描述...').replace(/\u00a0/g, ' ');
                                
                                // 極限修復：自動補全所有類型的未關閉代碼塊
                                const lines = content.split('\n');
                                let inCodeBlock = false;
                                for (const line of lines) {
                                  if (line.trim().startsWith('```')) {
                                    inCodeBlock = !inCodeBlock;
                                  }
                                }
                                if (inCodeBlock) content += '\n```';
                                
                                return content;
                              })() }
                          </ReactMarkdown>
                        </div>
                      )}

                      {!isEditing && (
                        <>
                          <AiSummaryButton type="project" title={modal.name} content={modal.readme || modal.description} />
                          <div style={{ marginBottom: '40px' }}><Reactions targetType="project" targetId={modal.id || modal.name} /></div>
                        </>
                      )}

                      <Comments
                        type="project"
                        id={modal.github_id || modal.name}
                        actions={(
                          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            {isAdmin && !isEditing && (
                              <button onClick={() => setIsEditing(true)} style={{ padding: '11px 24px', border: '1px solid #C8942A', color: '#C8942A', borderRadius: 8, background: 'transparent', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>編輯內容</button>
                            )}
                            {modal.url && (
                              <a href={modal.url} target="_blank" rel="noreferrer" style={{ padding: '11px 24px', background: '#fff', color: '#000', borderRadius: 8, fontWeight: 800, textDecoration: 'none', fontSize: 14 }}>前往 GitHub →</a>
                            )}
                          </div>
                        )}
                      />
                   </div>
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>
    </section>
  )
}
