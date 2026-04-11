import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import TopNav from '../components/TopNav'
import Footer from '../components/Footer'
import Comments from '../components/Comments'
import Reactions from '../components/Reactions'
import useLenis from '../hooks/useLenis'

const GRADIENTS = [
  'linear-gradient(135deg, #d4f029 0%, #b8d400 100%)',
  'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)',
  'linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%)',
  'linear-gradient(135deg, #0f2027 0%, #2c5364 100%)',
  'linear-gradient(135deg, #373b44 0%, #4286f4 100%)',
]

const EMOJIS = ['👍', '❤️', '🔥', '🤔', '😮']

function getSessionId() {
  let id = localStorage.getItem('reaction_session_id')
  if (!id) { id = Math.random().toString(36).substring(2, 15); localStorage.setItem('reaction_session_id', id) }
  return id
}

function renderMarkdown(text) {
  if (!text) return ''
  let html = text
  html = html.replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) =>
    `<pre class="md-pre"><code>${code.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></pre>`
  )
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>[\s\S]+?<\/li>)\n(?!<li>)/g, '$1</ul>\n')
  html = html.replace(/(?:^|\n)(<li>)/g, '\n<ul class="md-ul">$1')
  html = html.replace(/\n\n/g, '</p><p class="md-p">')
  html = `<p class="md-p">${html}</p>`
  html = html.replace(/<p class="md-p">(<(?:h[23]|pre|ul)[^>]*>)/g, '$1')
  html = html.replace(/(<\/(?:h[23]|pre|ul)>)<\/p>/g, '$1')
  return html
}



export default function BlogPostPage() {
  useLenis()
  const { slug } = useParams()
  const navigate = useNavigate()
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/blog/${slug}`)
      .then(r => r.json())
      .then(d => { if (d.success) { setPost(d.data); setLoading(false) } else { setError('找不到文章'); setLoading(false) } })
      .catch(() => { setError('載入失敗'); setLoading(false) })
  }, [slug])

  const gradient = post ? GRADIENTS[post.title.length % GRADIENTS.length] : GRADIENTS[0]
  const date = post ? new Date(post.created_at).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' }) : ''

  return (
    <>
      <style>{`
        .post-page { padding-top: 80px; min-height: 100vh; }
        .post-back {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 24px 6vw; font-size: 12px; letter-spacing: 0.15em; text-transform: uppercase;
          color: var(--muted); background: none; border: none; cursor: pointer;
          font-family: var(--font-sans); transition: color 0.3s;
        }
        .post-back:hover { color: var(--accent); }
        .post-hero {
          aspect-ratio: 21/9; display: flex; align-items: flex-end;
          padding: 48px 6vw; margin-bottom: 60px; overflow: hidden; position: relative;
        }
        @media (max-width: 768px) { .post-hero { aspect-ratio: 16/9; padding: 24px 6vw; margin-bottom: 40px; } }
        .post-date { font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase; color: rgba(255,255,255,0.6); margin-bottom: 16px; }
        .post-title {
          font-family: var(--font-display);
          font-size: clamp(28px, 5vw, 64px);
          font-weight: 700; color: #fff; line-height: 1.2; max-width: 800px;
          text-shadow: 0 2px 20px rgba(0,0,0,0.6);
        }
        .post-body { max-width: 760px; margin: 0 auto; padding: 0 6vw 80px; }
        .md-h2 { font-family: var(--font-sans); font-size: clamp(22px, 3vw, 34px); font-weight: 800; margin: 48px 0 20px; color: var(--fg); border-bottom: 1px solid var(--border); padding-bottom: 12px; }
        .md-h3 { font-family: var(--font-sans); font-size: clamp(18px, 2.5vw, 26px); font-weight: 700; margin: 36px 0 16px; color: var(--fg); }
        .md-p { font-size: 16px; line-height: 1.9; color: #aaa; margin: 0 0 20px; }
        .md-pre { background: #0d0d0d; border: 1px solid #222; border-radius: 8px; padding: 20px 24px; margin: 24px 0; overflow-x: auto; }
        .md-pre code { font-family: 'Courier New', monospace; font-size: 13px; color: var(--accent); line-height: 1.65; white-space: pre; }
        .md-code { background: #111; border: 1px solid #222; border-radius: 4px; padding: 2px 8px; font-size: 13px; color: var(--accent); font-family: monospace; }
        .md-ul { margin: 0 0 20px 24px; }
        .md-ul li { color: #aaa; font-size: 16px; line-height: 1.85; margin-bottom: 8px; }
        .emoji-reactions { padding: 48px 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); margin: 48px 0; }
        .reactions-label { font-size: 13px; color: var(--muted); margin-bottom: 20px; letter-spacing: 0.05em; }
        .emoji-buttons { display: flex; gap: 12px; flex-wrap: wrap; }
        .emoji-btn {
          display: flex; align-items: center; gap: 8px;
          background: var(--surface); border: 1px solid var(--border);
          border-radius: 100px; padding: 10px 18px; cursor: pointer;
          transition: border-color 0.3s, background 0.3s;
        }
        .emoji-btn:hover { border-color: var(--accent); background: rgba(212,240,41,0.08); }
        .emoji-icon { font-size: 20px; }
        .emoji-count { font-family: var(--font-sans); font-size: 13px; font-weight: 700; color: var(--fg); }
        .post-comments { max-width: 760px; margin: 0 auto; padding: 0 6vw 80px; }
        .post-comments-title { font-family: var(--font-sans); font-size: 22px; font-weight: 800; text-transform: uppercase; margin-bottom: 32px; letter-spacing: 0.05em; }
        .post-status { padding: 120px 6vw; text-align: center; color: var(--muted); }
      `}</style>

      <TopNav />
      <main className="post-page">
        <button className="post-back" onClick={() => navigate('/blog')}>← 返回部落格</button>

        {loading && <div className="post-status">載入中...</div>}
        {error && <div className="post-status">{error}</div>}

        {!loading && post && (
          <>
            <div className="post-hero" style={{ background: gradient }}>
              <div>
                <p className="post-date">{date}</p>
                <h1 className="post-title">{post.title}</h1>
              </div>
            </div>

            <div className="post-body">
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content || post.summary || '') }} />
              <div style={{ marginTop: 40, paddingTop: 40, borderTop: '1px solid var(--border)' }}>
                <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>這篇文章如何？</p>
                <Reactions targetType="blog" targetId={post.id} />
              </div>
            </div>

            <div className="post-comments">
              <h2 className="post-comments-title">留言區</h2>
              <Comments targetType="blog" targetId={post.id} />
            </div>
          </>
        )}
      </main>
      <Footer />
    </>
  )
}
