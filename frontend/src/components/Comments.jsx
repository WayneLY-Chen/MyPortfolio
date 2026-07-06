import { useState, useEffect, useCallback } from 'react'
import useAuthStore from '../store/authStore'
import Reactions from './Reactions'
import { useToast } from './ui/Toast'
import { Trash2, AlertTriangle } from 'lucide-react'
import { API_URL } from '../config/api'

// Helper to format date
const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export default function Comments({ type, id, actions }) {
  const { addToast } = useToast()
  const { isAuthenticated, user, accessToken, silentRefresh, isAdmin } = useAuthStore()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/comments?type=${type}&id=${id}`)
      const data = await res.json()
      if (data.success) setComments(data.data)
    } catch (err) {
      console.error('[LoadComments Error]', err)
    } finally {
      setLoading(false)
    }
  }, [type, id])

  useEffect(() => { load() }, [load])

  const handleSubmit = async () => {
    if (!text.trim()) return
    setSubmitting(false)
    setError('')
    setSubmitting(true)

    const sendRequest = async (token) => {
      const res = await fetch(`${API_URL}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          target_type: type,
          target_id: id,
          author_name: name || user?.display_name || 'Anonymous',
          content: text
        })
      })
      return await res.json()
    }

    try {
      let data = await sendRequest(accessToken)

      if (data.message === 'TOKEN_EXPIRED') {
        const refreshed = await silentRefresh()
        if (refreshed) {
          const newAccessToken = useAuthStore.getState().accessToken
          data = await sendRequest(newAccessToken)
        } else {
          addToast({ variant: 'error', title: '登入已過期', description: '請重新登入以發表留言' })
          return
        }
      }

      if (data.success) {
        setComments(prev => [data.data, ...prev])
        setText('')
        addToast({ variant: 'success', title: '留言成功', description: '你的留言已經發布' })
      } else {
        setError(data.message || data.error || '發送失敗')
        addToast({ variant: 'error', title: '發送失敗', description: data.message || '請再試一次' })
      }
    } catch (err) {
      console.error('[CommentError]', err)
      setError('連線失敗')
      addToast({ variant: 'error', title: '連線失敗', description: '請檢查網絡連接' })
    } finally {
      setSubmitting(false)
    }
  }

  const performDelete = async (commentId) => {
    setIsDeleting(true)
    const sendDeleteRequest = async (token) => {
      const res = await fetch(`${API_URL}/comments/${commentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      return await res.json()
    }

    try {
      let data = await sendDeleteRequest(accessToken)

      if (data.message === 'TOKEN_EXPIRED') {
        const refreshed = await silentRefresh()
        if (refreshed) {
          const newAccessToken = useAuthStore.getState().accessToken
          data = await sendDeleteRequest(newAccessToken)
        } else {
          addToast({ variant: 'error', title: '登入已過期', description: '請重新登入以執行操作' })
          return
        }
      }

      if (data.success) {
        setComments(prev => prev.filter(c => c.id !== commentId))
        addToast({ variant: 'success', title: '刪除成功', description: '這則留言已永久移除' })
      } else {
        addToast({ variant: 'error', title: '刪除失敗', description: data.message || '請再試一次' })
      }
    } catch (err) {
      console.error('[DeleteComment Error]', err)
      addToast({ variant: 'error', title: '連線失敗', description: '請檢查網絡連接' })
    } finally {
      setIsDeleting(false)
      setDeletingId(null)
    }
  }

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 20 }}>
      <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 20, letterSpacing: '0.05em' }}>
        留言 ({comments.length})
      </h4>

      {/* Input area */}
      {isAuthenticated ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={user?.display_name || "你的名字（選填）"}
            maxLength={50}
            style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#eee', fontSize: 14, outline: 'none' }}
          />
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="寫下你的留言..."
            maxLength={500}
            rows={3}
            style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#eee', fontSize: 14, outline: 'none', resize: 'vertical', lineHeight: 1.6 }}
          />
          {error && <p style={{ color: '#ff4d00', fontSize: 13, marginTop: -5 }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {actions}
              <span style={{ fontSize: 12, color: '#555' }}>{text.length}/500</span>
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting || !text.trim()}
              style={{
                padding: '9px 24px', background: text.trim() ? 'var(--accent, #d4f029)' : '#222',
                color: text.trim() ? '#000' : '#555', border: 'none', borderRadius: 10,
                fontWeight: 700, fontSize: 13, cursor: text.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.2s',
                boxShadow: text.trim() ? '0 4px 15px rgba(212,240,41,0.2)' : 'none'
              }}
            >
              {submitting ? '送出中...' : '送出留言'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 20, padding: 16, background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>登入後即可發表留言</p>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {actions}
              <button
                onClick={() => window.location.href = '/login'}
                style={{
                  padding: '7px 18px', background: 'var(--accent, #d4f029)', color: '#000', border: 'none', borderRadius: 8,
                  fontWeight: 700, fontSize: 12, cursor: 'pointer', letterSpacing: '0.05em'
                }}
              >
                前往登入
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comment list */}
      {loading && <p style={{ color: '#555', fontSize: 13 }}>載入留言中...</p>}
      {!loading && comments.length === 0 && (
        <p style={{ color: '#444', fontSize: 13, fontStyle: 'italic' }}>還沒有留言，來當第一個！</p>
      )}
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {comments.map(c => (
          <div key={c.id} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent, #d4f029)' }}>{c.author_name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 11, color: '#555' }}>{formatDate(c.created_at)}</span>
                {(isAdmin || (user && c.user_id === user.id)) && (
                  <button
                    onClick={() => setDeletingId(c.id)}
                    style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: '2px 4px', fontSize: 12, transition: 'color 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#ff4d00'}
                    onMouseLeave={e => e.currentTarget.style.color = '#555'}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
            <p style={{ fontSize: 14, color: '#bbb', lineHeight: 1.7, margin: '0 0 16px 0', whiteSpace: 'pre-wrap' }}>{c.content}</p>
            <Reactions targetType="comment" targetId={c.id} />

            {/* Custom confirm dialog overlay */}
            {deletingId === c.id && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(14,10,6,0.96)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: 20 }}>
                <div style={{ textAlign: 'center' }}>
                  <AlertTriangle size={20} color="#ff4d00" style={{ margin: '0 auto 10px' }} />
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 16 }}>確定要刪除這則留言嗎？</p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button
                      onClick={() => setDeletingId(null)}
                      style={{ padding: '6px 16px', background: 'rgba(255,255,255,0.05)', color: '#aaa', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                    >
                      取消
                    </button>
                    <button
                      onClick={() => performDelete(c.id)}
                      disabled={isDeleting}
                      style={{ padding: '6px 16px', background: '#ff4d00', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 700 }}
                    >
                      {isDeleting ? '刪除中...' : '確定刪除'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
