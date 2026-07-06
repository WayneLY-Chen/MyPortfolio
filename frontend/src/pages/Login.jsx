import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import { AUTH_URL } from '../config/api'

const OAUTH_PROVIDERS = [
  { id: 'google', label: '使用 Google 登入', color: '#ea4335' },
  { id: 'line', label: '使用 LINE 登入', color: '#00c300' },
  { id: 'facebook', label: '使用 Facebook 登入', color: '#1877f2' },
  { id: 'github', label: '使用 GitHub 登入', color: '#24292e' },
]

// 眼睛開（可見）SVG
function EyeOpen() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

// 眼睛關（隱藏）SVG
function EyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

export default function Login({ mode }) {
  const navigate = useNavigate()
  const isRegister = mode === 'register'
  const [form, setForm] = useState({ email: '', password: '', display_name: '', confirmPassword: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [registerSuccess, setRegisterSuccess] = useState(false)
  const { setAuth } = useAuthStore()

  // 任務 1：顯示/隱藏密碼狀態
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // 任務 2：記住我
  const [rememberMe, setRememberMe] = useState(false)

  // 任務 2：頁面載入時讀取 localStorage
  useEffect(() => {
    if (!isRegister) {
      try {
        const saved = localStorage.getItem('remembered_credentials')
        if (saved) {
          const { email, password } = JSON.parse(saved)
          setForm(f => ({ ...f, email: email || '', password: password || '' }))
          setRememberMe(true)
        }
      } catch (e) {
        // 忽略損壞的資料
      }
    }
    
    // 解析 URL 中的 error 參數並顯示
    const params = new URLSearchParams(window.location.search)
    const errParam = params.get('error')
    if (errParam) {
      if (errParam === 'oauth_failed') setError('第三方登入失敗，請確認授權或改用 Email 登入。')
      else if (errParam === 'facebook_not_configured') setError('Facebook 登入尚未設定完成。')
      else if (errParam === 'line_not_configured') setError('LINE 登入尚未設定完成。')
      else setError('認證失敗，請重試。')
    }
  }, [isRegister])

  const handleOAuth = (provider) => {
    window.location.href = `${AUTH_URL}/${provider}`
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      if (isRegister) {
        if (form.password !== form.confirmPassword) {
          setError('兩次密碼輸入不一致'); setLoading(false); return
        }
        const res = await fetch(
          `${AUTH_URL}/register`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              email: form.email,
              password: form.password,
              display_name: form.display_name
            })
          }
        )
        const data = await res.json()
        if (!res.ok) { setError(data.error || '註冊失敗'); return }
        setRegisterSuccess(true)
      } else {
        const res = await fetch(`${AUTH_URL}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: form.email, password: form.password }),
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error || '登入失敗'); return }

        // 任務 2：根據記住我狀態儲存或清除 localStorage
        if (rememberMe) {
          localStorage.setItem('remembered_credentials', JSON.stringify({ email: form.email, password: form.password }))
        } else {
          localStorage.removeItem('remembered_credentials')
        }

        setAuth(data.access_token, data.user)
        navigate('/')
      }
    } catch (err) {
      setError('連線失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  if (registerSuccess) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <h1 className="auth-title">請驗證您的 Email</h1>
          <p style={{ color: '#aaaaaa', fontSize: '15px', lineHeight: '1.7', margin: '16px 0 28px' }}>
            帳號已建立成功！<br />
            驗證信已寄送至 <strong style={{ color: '#C8942A' }}>{form.email}</strong>，<br />
            請點擊信件中的連結以啟用帳號。
          </p>
          <p style={{ color: '#666666', fontSize: '13px', margin: '0 0 24px' }}>
            若未收到信件，請檢查垃圾信件夾，或至登入頁面重新寄送驗證信。
          </p>
          <a href="/login" style={{
            display: 'inline-block', background: '#C8942A', color: '#0f0f0f',
            textDecoration: 'none', borderRadius: '8px', padding: '12px 28px',
            fontSize: '15px', fontWeight: '700',
          }}>
            前往登入
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div style={{ position: 'relative' }}>
          <h1 className="auth-title">{isRegister ? '建立帳號' : '歡迎回來'}</h1>
          <button
            onClick={() => navigate('/')}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.5)',
              fontSize: '28px',
              cursor: 'pointer',
              padding: '0',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.3s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = '#C8942A'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
            aria-label="關閉"
          >
            ×
          </button>
        </div>
        <div className="oauth-buttons">
          {OAUTH_PROVIDERS.map(p => (
            <button key={p.id} className="oauth-btn" onClick={() => handleOAuth(p.id)}
              style={{ '--provider-color': p.color }}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="auth-divider"><span>或使用 Email {isRegister ? '註冊' : '登入'}</span></div>
        {error && <p className="auth-error">{error}</p>}
        <form onSubmit={handleSubmit} className="auth-form">
          {isRegister && (
            <div className="form-group">
              <label>顯示名稱</label>
              <input type="text" value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} required />
            </div>
          )}
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
          </div>
          {/* 任務 1：密碼欄位 + 眼睛圖示 */}
          <div className="form-group">
            <label>密碼</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required
                style={{ paddingRight: '42px', width: '100%', boxSizing: 'border-box' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#C8942A'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
              >
                {showPassword ? <EyeOpen /> : <EyeOff />}
              </button>
            </div>
          </div>
          {isRegister && (
            <div className="form-group">
              <label>確認密碼</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={form.confirmPassword}
                  onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
                  required
                  style={{ paddingRight: '42px', width: '100%', boxSizing: 'border-box' }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(v => !v)}
                  aria-label={showConfirmPassword ? '隱藏密碼' : '顯示密碼'}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'rgba(255,255,255,0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#C8942A'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
                >
                  {showConfirmPassword ? <EyeOpen /> : <EyeOff />}
                </button>
              </div>
            </div>
          )}
          {/* 忘記密碼連結（僅登入模式顯示） */}
          {!isRegister && (
            <div style={{ textAlign: 'right', marginTop: '-8px' }}>
              <Link
                to="/forgot-password"
                style={{
                  fontSize: '13px',
                  color: 'rgba(255,255,255,0.45)',
                  textDecoration: 'none',
                  transition: 'color 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#C8942A'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.45)'}
              >
                忘記密碼？
              </Link>
            </div>
          )}
          {/* 任務 2：記住我 checkbox（僅登入模式顯示） */}
          {!isRegister && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0 12px' }}>
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                style={{ display: 'none' }}
              />
              <label
                htmlFor="rememberMe"
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  cursor: 'pointer', userSelect: 'none',
                  fontSize: '13px', color: 'rgba(255,255,255,0.5)',
                }}
              >
                <span style={{
                  width: '16px', height: '16px', flexShrink: 0,
                  borderRadius: '4px',
                  border: `1.5px solid ${rememberMe ? '#C8942A' : 'rgba(255,255,255,0.2)'}`,
                  background: rememberMe ? '#C8942A' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s',
                }}>
                  {rememberMe && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5L4 7.5L8.5 2.5" stroke="#0f0f0f" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                記住帳號密碼
              </label>
            </div>
          )}
          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? (isRegister ? '註冊中...' : '登入中...') : (isRegister ? '註冊' : '登入')}
          </button>
        </form>
        {isRegister
          ? <p className="auth-footer-text">已有帳號？ <a href="/login">登入</a></p>
          : <p className="auth-footer-text">還沒有帳號？ <a href="/register">立即註冊</a></p>
        }
      </div>
    </div>
  )
}
