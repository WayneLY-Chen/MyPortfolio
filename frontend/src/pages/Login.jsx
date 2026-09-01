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

  // 「記住我」只記住帳號，絕不記住密碼。
  //
  // 先前這裡存的是 { email, password }，也就是把使用者的明文密碼永久寫進
  // localStorage。那份資料沒有期限、開發者工具打開就看得到，而且任何一個
  // 出現在本網域上的 XSS 都能一次讀走它 —— 密碼重用的情況下，波及範圍還會
  // 擴及使用者在其他網站的帳號。
  //
  // 「保持登入」本來就不需要留著密碼：後端在登入時已經發出 httpOnly 的
  // refresh_token cookie（backend/src/utils/jwt.js 的 setRefreshTokenCookie），
  // 那份憑證 JavaScript 讀不到，而且撤銷得掉。
  useEffect(() => {
    if (!isRegister) {
      try {
        const saved = localStorage.getItem('remembered_credentials')
        if (saved) {
          const parsed = JSON.parse(saved)
          setForm(f => ({ ...f, email: parsed.email || '' }))
          setRememberMe(true)
          // 清掉舊版留下的明文密碼。已經勾過「記住我」的使用者不會自己回頭去
          // 清 localStorage，所以這件事必須由程式在下一次進到登入頁時自動完成。
          if ('password' in parsed) {
            localStorage.setItem('remembered_credentials', JSON.stringify({ email: parsed.email || '' }))
          }
        }
      } catch (e) {
        // 損壞的資料視同沒有，並且順手清掉 —— 它有可能是舊版寫入的、含密碼的內容。
        localStorage.removeItem('remembered_credentials')
      }
    }
    
    // 解析 URL 中的 error 參數並顯示
    const params = new URLSearchParams(window.location.search)
    const errParam = params.get('error')
    if (errParam) {
      if (errParam === 'oauth_failed') setError('第三方登入失敗，請確認授權或改用 Email 登入。')
      else if (errParam === 'facebook_not_configured') setError('Facebook 登入尚未設定完成。')
      else if (errParam === 'line_not_configured') setError('LINE 登入尚未設定完成。')
      // auth_failed 由 AuthCallback.jsx 送出：OAuth 那一段其實成功了（provider 已
      // 授權、後端也發了 refresh cookie），但緊接著的 silentRefresh 沒能換到 token。
      //
      // 先前這個代碼沒有對應，會掉到下面的 else 顯示「認證失敗，請重試」——
      // 那句話對使用者毫無資訊：他不知道是帳密錯了、還是授權被拒、還是伺服器
      // 出問題，也不知道重試有沒有意義。
      //
      // 實務上最常見的原因是後端沒醒著：本專案的 API 跑在 Render 免費方案上，
      // 閒置會自動休眠，喚醒要 50 秒以上，期間請求會失敗（2026-09-01 就發生過
      // 連續 6.5 小時的 503）。這種情況「等幾秒再按一次」真的會成功，所以文案
      // 必須講出這件事，而不是叫人重試就沒了。
      else if (errParam === 'auth_failed') setError('授權成功了，但沒能建立登入狀態。伺服器可能正在喚醒中，請等幾秒後再試一次。')
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

        // 只存 email。密碼絕不落地 —— 見本檔上方 useEffect 的說明。
        if (rememberMe) {
          localStorage.setItem('remembered_credentials', JSON.stringify({ email: form.email }))
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
        {error && (
          <>
            <p className="auth-error">{error}</p>
            {/* D-15/SEC-06：登入失敗訊息不再區分帳號是否存在或型態，
                所以在出錯的當下，同一個視野內立刻補一個可點的出路——
                不取代密碼欄位下方那個既有的「忘記密碼？」連結，只在
                錯誤發生時多一次引導。僅登入模式顯示，註冊失敗與忘記
                密碼無關。 */}
            {!isRegister && (
              <div style={{ marginTop: '-4px', marginBottom: '8px' }}>
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
                  前往忘記密碼
                </Link>
              </div>
            )}
          </>
        )}
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
                記住我的帳號
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
