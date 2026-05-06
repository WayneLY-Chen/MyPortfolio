import { useEffect, useRef } from 'react'
import useAuthStore from '../store/authStore'
import { useToast } from '../components/ui/Toast'

/**
 * 全域待辦事項通知 hook
 * 每 5 秒檢查一次 localStorage 中的待辦事項
 * 不管使用者在網站的哪個頁面都會持續運作
 */
export default function useTodoNotifier() {
  const user = useAuthStore(s => s.user)
  const { addToast } = useToast()
  const lastCheckRef = useRef(Date.now())

  useEffect(() => {
    if (!user) return

    const interval = setInterval(() => {
      const stored = localStorage.getItem('portfolioTodos')
      if (!stored) return

      try {
        const todos = JSON.parse(stored)
        const now = new Date()
        let modified = false

        const updatedTodos = todos.map(t => {
          if (t.time && !t.notified && !t.checked && now >= new Date(t.time)) {
            addToast({
              title: '⏰ 任務提醒',
              description: `時間到囉：${t.text}`,
              variant: 'default',
              duration: 8000,
            })
            modified = true
            return { ...t, notified: true }
          }
          return t
        })

        if (modified) {
          localStorage.setItem('portfolioTodos', JSON.stringify(updatedTodos))
        }
      } catch (e) {
        // JSON parse error — 忽略
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [user, addToast])
}
