import { useState, useEffect, useCallback } from 'react'
import useAuthStore from '../store/authStore'
import { API_URL } from '../config/api'

const EMOJIS = ['👍', '❤️', '😂', '🔥', '🚀']

// 取得或生成 sessionId 以識別訪客
const getSessionId = () => {
  let id = localStorage.getItem('wobot_session_id')
  if (!id) {
    id = 'sess_' + Math.random().toString(36).substr(2, 9)
    localStorage.setItem('wobot_session_id', id)
  }
  return id
}

export default function Reactions({ targetType, targetId }) {
  const { accessToken, silentRefresh } = useAuthStore()
  const [counts, setCounts] = useState({})
  const [userReactions, setUserReactions] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const sessionId = getSessionId()
      const res = await fetch(`${API_URL}/reactions?targetType=${targetType}&targetId=${targetId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-session-id': sessionId
        }
      })
      const data = await res.json()
      if (data.success) {
        setCounts(data.counts || {})
        setUserReactions(data.userReactions || [])
      }
    } catch (err) {
      console.error('[Reactions Load Error]', err)
    } finally {
      setLoading(false)
    }
  }, [targetType, targetId, accessToken])

  useEffect(() => { load() }, [load])

  const toggle = async (emoji) => {
    const sessionId = getSessionId()
    
    const sendRequest = async (token) => {
      return await fetch(`${API_URL}/reactions/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-session-id': sessionId
        },
        body: JSON.stringify({ targetType, targetId, emoji })
      }).then(r => r.json())
    }

    try {
      let data = await sendRequest(accessToken)

      // Token 過期處理
      if (data.message === 'TOKEN_EXPIRED') {
        const refreshed = await silentRefresh()
        if (refreshed) {
          const newToken = useAuthStore.getState().accessToken
          data = await sendRequest(newToken)
        } else {
          alert('請登入後再試')
          return
        }
      }

      if (data.success) {
        // 本地立即更新 UI (Optimistic Update)
        if (data.action === 'added') {
          setCounts(prev => ({ ...prev, [emoji]: (prev[emoji] || 0) + 1 }))
          setUserReactions(prev => [...prev, emoji])
        } else {
          setCounts(prev => ({ ...prev, [emoji]: Math.max(0, (prev[emoji] || 0) - 1) }))
          setUserReactions(prev => prev.filter(e => e !== emoji))
        }
      }
    } catch (err) {
      console.error('[Toggle Reaction Error]', err)
    }
  }

  if (loading && Object.keys(counts).length === 0) return null

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      {EMOJIS.map(emoji => {
        const count = counts[emoji] || 0
        const isActive = userReactions.includes(emoji)
        return (
          <button
            key={emoji}
            onClick={() => toggle(emoji)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: isActive ? 'rgba(212,240,41,0.12)' : 'rgba(255,255,255,0.03)',
              border: isActive ? '1px solid rgba(212,240,41,0.4)' : '1px solid rgba(255,255,255,0.06)',
              borderRadius: 20, padding: '6px 14px',
              fontSize: 13, color: isActive ? '#d4f029' : '#888',
              cursor: 'pointer', transition: 'all 0.2s', outline: 'none'
            }}
          >
            <span>{emoji}</span> {count > 0 && <span style={{ fontWeight: 700 }}>{count}</span>}
          </button>
        )
      })}
    </div>
  )
}
