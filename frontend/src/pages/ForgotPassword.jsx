import { useState } from 'react'
import { Link } from 'react-router-dom'

import { AUTH_URL } from '../config/api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${AUTH_URL}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '發送失敗，請稍後再試')
        return
      }
      setSubmitted(true)
    } catch (err) {
      setError('連線失敗，請稍後再試')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <h1 className="auth-title">信件已寄出</h1>
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
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>
          <p style={{ color: '#aaaaaa', fontSize: '15px', lineHeight: '1.7', margin: '0 0 8px' }}>
            重設連結已寄出，請至信箱查看
          </p>
          <p style={{ color: '#666666', fontSize: '13px', margin: '0 0 28px' }}>
            已發送至 <strong style={{ color: '#C8942A' }}>{email}</strong>
            <br />若未收到，請檢查垃圾信件夾。
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
            返回登入
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">忘記密碼</h1>
        <p style={{
          color: '#aaaaaa',
          fontSize: '14px',
          lineHeight: '1.6',
          margin: '-8px 0 20px',
          textAlign: 'center',
        }}>
          輸入您的 Email，我們將發送重設密碼連結至您的信箱
        </p>
        {error && <p className="auth-error">{error}</p>}
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="請輸入您的 Email"
              required
            />
          </div>
          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? '發送中...' : '發送重設連結'}
          </button>
        </form>
        <p className="auth-footer-text">
          <Link to="/login">返回登入</Link>
        </p>
      </div>
    </div>
  )
}
