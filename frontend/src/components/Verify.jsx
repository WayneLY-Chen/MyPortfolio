import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'

export default function Verify() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  const [status, setStatus] = useState('loading') // 'loading' | 'success' | 'error'
  const [message, setMessage] = useState('')
  const [resendEmail, setResendEmail] = useState('')
  const [resendStatus, setResendStatus] = useState('') // '' | 'sending' | 'sent' | 'error'

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setMessage('驗證連結無效，缺少驗證參數')
      return
    }

    const verifyEmail = async () => {
      try {
        const res = await fetch(`/auth/verify?token=${encodeURIComponent(token)}`)
        const data = await res.json()
        if (res.ok && data.success) {
          setStatus('success')
          setMessage(data.message || '電子信箱驗證成功！')
        } else {
          setStatus('error')
          setMessage(data.error || '驗證失敗，請稍後再試')
        }
      } catch {
        setStatus('error')
        setMessage('連線失敗，請稍後再試')
      }
    }

    verifyEmail()
  }, [token])

  const handleResend = async (e) => {
    e.preventDefault()
    if (!resendEmail) return
    setResendStatus('sending')
    try {
      const res = await fetch('/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resendEmail }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setResendStatus('sent')
      } else {
        setResendStatus('error')
      }
    } catch {
      setResendStatus('error')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f0f0f',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Helvetica Neue', Arial, sans-serif",
      padding: '24px',
    }}>
      <div style={{
        background: '#1a1a1a',
        border: '1px solid #2a2a2a',
        borderRadius: '12px',
        padding: '48px 40px',
        maxWidth: '480px',
        width: '100%',
        textAlign: 'center',
      }}>

        {status === 'loading' && (
          <>
            <div style={{
              width: '48px', height: '48px', border: '3px solid #2a2a2a',
              borderTop: '3px solid #C8942A', borderRadius: '50%',
              animation: 'spin 1s linear infinite', margin: '0 auto 24px',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ color: '#aaaaaa', fontSize: '16px', margin: 0 }}>正在驗證您的 Email...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{
              width: '56px', height: '56px', background: '#1a3a1a',
              border: '2px solid #4caf50', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px', fontSize: '24px',
            }}>
              <span style={{ color: '#4caf50', fontWeight: '700' }}>V</span>
            </div>
            <h2 style={{ color: '#ffffff', fontSize: '22px', margin: '0 0 12px' }}>驗證成功</h2>
            <p style={{ color: '#aaaaaa', fontSize: '15px', lineHeight: '1.6', margin: '0 0 32px' }}>
              {message}
            </p>
            <button
              onClick={() => navigate('/login')}
              style={{
                background: '#C8942A', color: '#0f0f0f', border: 'none',
                borderRadius: '8px', padding: '12px 28px', fontSize: '15px',
                fontWeight: '700', cursor: 'pointer', letterSpacing: '0.5px',
              }}
            >
              前往登入
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{
              width: '56px', height: '56px', background: '#3a1a1a',
              border: '2px solid #f44336', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px', fontSize: '24px',
            }}>
              <span style={{ color: '#f44336', fontWeight: '700' }}>!</span>
            </div>
            <h2 style={{ color: '#ffffff', fontSize: '22px', margin: '0 0 12px' }}>驗證失敗</h2>
            <p style={{ color: '#aaaaaa', fontSize: '15px', lineHeight: '1.6', margin: '0 0 32px' }}>
              {message}
            </p>

            <div style={{ borderTop: '1px solid #2a2a2a', paddingTop: '28px', textAlign: 'left' }}>
              <p style={{ color: '#888888', fontSize: '14px', margin: '0 0 12px' }}>
                需要重新寄送驗證信？請輸入您的 Email：
              </p>
              <form onSubmit={handleResend} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="email"
                  value={resendEmail}
                  onChange={e => setResendEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                  style={{
                    flex: 1, background: '#0f0f0f', border: '1px solid #333333',
                    borderRadius: '6px', padding: '10px 12px', color: '#ffffff',
                    fontSize: '14px', outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  disabled={resendStatus === 'sending' || resendStatus === 'sent'}
                  style={{
                    background: resendStatus === 'sent' ? '#2a2a2a' : '#C8942A',
                    color: resendStatus === 'sent' ? '#888888' : '#0f0f0f',
                    border: 'none', borderRadius: '6px', padding: '10px 16px',
                    fontSize: '14px', fontWeight: '600', cursor:
                      resendStatus === 'sending' || resendStatus === 'sent' ? 'default' : 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {resendStatus === 'sending' ? '寄送中...' : resendStatus === 'sent' ? '已寄出' : '重新寄送'}
                </button>
              </form>
              {resendStatus === 'sent' && (
                <p style={{ color: '#4caf50', fontSize: '13px', margin: '8px 0 0' }}>
                  驗證信已寄出，請至 Email 收取
                </p>
              )}
              {resendStatus === 'error' && (
                <p style={{ color: '#f44336', fontSize: '13px', margin: '8px 0 0' }}>
                  寄送失敗，請稍後再試
                </p>
              )}
            </div>

            <div style={{ marginTop: '24px' }}>
              <button
                onClick={() => navigate('/')}
                style={{
                  background: 'transparent', color: '#888888', border: '1px solid #333333',
                  borderRadius: '8px', padding: '10px 20px', fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                返回首頁
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
