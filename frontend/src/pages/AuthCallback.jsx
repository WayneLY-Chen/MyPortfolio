import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'

export default function AuthCallback() {
  const navigate = useNavigate()
  const silentRefresh = useAuthStore(s => s.silentRefresh)

  // D-14: this MUST reuse the store's silentRefresh, never a direct fetch to
  // /auth/refresh. AppInner (frontend/src/App.jsx) already calls the exact
  // same function on every route mount, including this one. POST
  // /auth/refresh rotates and revokes the refresh token on every call, so
  // two concurrent requests would leave the loser holding an already-
  // revoked token and 401 intermittently. silentRefresh's module-level
  // refreshPromise singleton collapses both callers into one request — that
  // only works if this component goes through it instead of fetching itself.
  //
  // Empty deps: this effect must run exactly once per mount. Including
  // navigate/silentRefresh here would risk a second refresh attempt on
  // re-render.
  useEffect(() => {
    silentRefresh().then(ok => {
      navigate(ok ? '/' : '/login?error=auth_failed', { replace: true })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
