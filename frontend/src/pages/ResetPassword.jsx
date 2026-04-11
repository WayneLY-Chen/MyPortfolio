import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { AUTH_URL } from '../config/api'

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

const eyeBtnStyle = {
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
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  // 無 token 時顯示錯誤畫面
  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(255, 77, 77, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff4d4d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h1 className="auth-title">連結無效</h1>
          <p style={{ color: '#aaaaaa', fontSize: '14px', lineHeight: '1.6', margin: '0 0 28px' }}>
            連結無效，請重新申請重設密碼
          </p>
          <Link to="/forgot-password" style={{
            display: 'inline-block',
            background: '#C8942A',
            color: '#0f0f0f',
            textDecoration: 'none',
            borderRadius: '8px',
            padding: '12px 28px',
            fontSize: '15px',
            fontWeight: '700',
          }}>
            返回忘記密碼
          </Link>
        </div>
      </div>
    )
  }

  // 成功重設後顯示成功畫面
  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(200, 148, 42, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C8942A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h1 className="auth-title">密碼已重設</h1>
          <p style={{ color: '#aaaaaa', fontSize: '14px', lineHeight: '1.6', margin: '0 0 28px' }}>
            密碼已成功重設，請使用新密碼登入。
          </p>
          <Link to="/login" style={{
            display: 'inline-block',
            background: '#C8942A',
            color: '#0f0f0f',
            textDecoration: 'none',
            borderRadius: '8px',
            padding: '12px 28px',
            fontSize: '15px',
            fontWeight: '700',
          }}>
            前往登入
          </Link>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (newPassword.length < 8) {
      setError('密碼長度至少需要 8 個字元')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('兩次密碼輸入不一致')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`${AUTH_URL}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '重設失敗，連結可能已過期，請重新申請')
        return
      }
      setSuccess(true)
    } catch (err) {
      setError('連線失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">重設密碼</h1>
        {error && <p className="auth-error">{error}</p>}
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>新密碼</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="至少 8 個字元"
                required
                style={{ paddingRight: '42px', width: '100%', boxSizing: 'border-box' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? '隱藏密碼' : '顯示密碼'}
                style={eyeBtnStyle}
                onMouseEnter={e => e.currentTarget.style.color = '#C8942A'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
              >
                {showPassword ? <EyeOff /> : <EyeOpen />}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>確認新密碼</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="再次輸入新密碼"
                required
                style={{ paddingRight: '42px', width: '100%', boxSizing: 'border-box' }}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(v => !v)}
                aria-label={showConfirmPassword ? '隱藏密碼' : '顯示密碼'}
                style={eyeBtnStyle}
                onMouseEnter={e => e.currentTarget.style.color = '#C8942A'}
                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
              >
                {showConfirmPassword ? <EyeOff /> : <EyeOpen />}
              </button>
            </div>
          </div>
          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? '重設中...' : '確認重設密碼'}
          </button>
        </form>
        <p className="auth-footer-text">
          <Link to="/forgot-password">返回忘記密碼</Link>
        </p>
      </div>
    </div>
  )
}
