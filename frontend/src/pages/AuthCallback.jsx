import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import useAuthStore from '../store/authStore'

export default function AuthCallback() {
  const navigate = useNavigate()
  const location = useLocation()
  const setAuth = useAuthStore(s => s.setAuth)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const token = params.get('token')

    if (token) {
      // 1. 先暫存 token 並顯示載入中（store 會處理後續的 silentRefresh 或 me 請求）
      // 這裡直接呼叫後端的 /auth/me 來獲取完整使用者資訊
      fetch('/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setAuth(token, data.user)
          navigate('/', { replace: true })
        } else {
          navigate('/login?error=auth_failed', { replace: true })
        }
      })
      .catch(() => {
        navigate('/login?error=connection_error', { replace: true })
      })
    } else {
      navigate('/login', { replace: true })
    }
  }, [location, setAuth, navigate])

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      background: '#080808', 
      color: '#fff',
      fontFamily: 'var(--font-sans)'
    }}>
      <div style={{ 
        width: '40px', 
        height: '40px', 
        border: '3px solid rgba(255,255,255,0.1)', 
        borderTopColor: 'var(--accent, #d4f029)', 
        borderRadius: '50%', 
        animation: 'spin 1s linear infinite',
        marginBottom: '20px'
      }} />
      <p style={{ letterSpacing: '0.1em', fontSize: '14px', opacity: 0.8 }}>正在完成認證流程...</p>
      
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
