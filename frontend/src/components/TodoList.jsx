import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import { useToast } from '../components/ui/Toast'

export default function TodoList() {
  const { user, isLoading } = useAuthStore()
  const { addToast } = useToast()
  
  const [todos, setTodos] = useState([])
  const [taskText, setTaskText] = useState('')
  const [taskTime, setTaskTime] = useState('')

  useEffect(() => {
    const stored = localStorage.getItem("portfolioTodos")
    if (stored) {
      setTodos(JSON.parse(stored))
    }
  }, [])

  const saveTodos = (newTodos) => {
    setTodos(newTodos)
    localStorage.setItem("portfolioTodos", JSON.stringify(newTodos))
  }

  useEffect(() => {
    if (!user) return
    const interval = setInterval(() => {
      const now = new Date()
      let modified = false
      const updatedTodos = todos.map(t => {
        if (t.time && !t.notified && !t.checked && now >= new Date(t.time)) {
          addToast({
            title: "任務提醒",
            description: `時間到囉：${t.text}`,
            variant: "default",
            duration: 8000
          })
          modified = true
          return { ...t, notified: true }
        }
        return t
      })
      if (modified) {
        saveTodos(updatedTodos)
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [todos, user, addToast])

  if (isLoading) return <div style={{ textAlign: 'center', padding: '60px', color: 'var(--muted)' }}>載入中...</div>
  if (!user) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', animation: 'fadeIn 0.5s' }}>
        <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 24, color: 'var(--fg)', marginBottom: 16 }}>需要登入</h2>
        <p style={{ color: 'var(--muted)', marginBottom: 24 }}>只有登入的使用者才能使用待辦事項功能。</p>
        <Link to="/login" style={{ display: 'inline-block', padding: '12px 32px', background: 'var(--accent)', color: '#000', borderRadius: 8, fontWeight: 800, textDecoration: 'none', transition: 'transform 0.2s' }}>前往登入</Link>
      </div>
    )
  }

  const addTask = () => {
    if (!taskText.trim()) {
      addToast({ title: "錯誤", description: "請輸入待辦事項內容！", variant: "error" })
      return
    }
    const newTask = {
      id: Date.now(),
      text: taskText.trim(),
      time: taskTime,
      checked: false,
      notified: false
    }
    saveTodos([...todos, newTask])
    setTaskText('')
    setTaskTime('')
    addToast({ title: "成功", description: "待辦事項已新增", variant: "success" })
  }

  const toggleTask = (id) => {
    const newTodos = todos.map(t => {
      if (t.id === id) return { ...t, checked: !t.checked }
      return t
    })
    saveTodos(newTodos)
  }

  const deleteTask = (id) => {
    saveTodos(todos.filter(t => t.id !== id))
    addToast({ title: "成功", description: "待辦事項已刪除", variant: "success" })
  }

  return (
    <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto', animation: 'fadeIn 0.5s' }}>
      <header style={{ textAlign: 'center', marginBottom: 40 }}>
        <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 32, fontWeight: 800, color: 'var(--fg)', marginBottom: 8 }}>待辦事項</h2>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          待辦清單。只要網頁沒有關閉，時間到了就會有通知。
        </p>
      </header>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 30, marginBottom: 30 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <input 
                type="text" 
                value={taskText}
                onChange={e => setTaskText(e.target.value)}
                placeholder="輸入待辦事項..."
                style={{ flex: 2, minWidth: '200px', background: '#0a0a0a', border: '1px solid #333', color: 'var(--fg)', padding: '16px', borderRadius: 8, outline: 'none', fontSize: 16 }}
              />
              <input 
                type="datetime-local" 
                value={taskTime}
                onChange={e => setTaskTime(e.target.value)}
                style={{ flex: 1, minWidth: '200px', background: '#0a0a0a', border: '1px solid #333', color: 'var(--fg)', padding: '16px', borderRadius: 8, outline: 'none', fontSize: 16, colorScheme: 'dark' }}
              />
              <button 
                onClick={addTask}
                style={{ padding: '0 30px', background: 'var(--accent)', color: '#000', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 16, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                ＋ 新增
              </button>
            </div>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 30, minHeight: 300 }}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {todos.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '40px 0' }}>目前沒有待辦事項。</div>
              ) : (
                todos.map(t => (
                  <li key={t.id} style={{ display: 'flex', alignItems: 'center', padding: '20px', marginBottom: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 12, transition: '0.3s', opacity: t.checked ? 0.5 : 1 }}>
                    <input 
                      type="checkbox" 
                      checked={t.checked} 
                      onChange={() => toggleTask(t.id)}
                      style={{ width: 24, height: 24, marginRight: 20, cursor: 'pointer', accentColor: 'var(--accent)' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 18, color: t.checked ? 'var(--muted)' : 'var(--fg)', textDecoration: t.checked ? 'line-through' : 'none', marginBottom: 4, transition: '0.3s' }}>
                        {t.text}
                      </div>
                      {t.time && (
                        <div style={{ fontSize: 13, color: 'var(--accent)', fontFamily: 'monospace' }}>
                          🕒 {new Date(t.time).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={() => deleteTask(t.id)}
                      style={{ background: 'none', border: 'none', color: '#666', fontSize: 24, cursor: 'pointer', marginLeft: 16 }}
                      title="刪除"
                    >
                      ×
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
  )
}
