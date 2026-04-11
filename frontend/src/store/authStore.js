import { create } from 'zustand'
import { AUTH_URL } from '../config/api'

const useAuthStore = create((set, get) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: (accessToken, user) => set({ accessToken, user, isAuthenticated: !!user, isLoading: false }),
  clearAuth: () => set({ accessToken: null, user: null, isAuthenticated: false, isLoading: false }),

  silentRefresh: async () => {
    try {
      const res = await fetch(`${AUTH_URL}/refresh`, { 
        method: 'POST', 
        credentials: 'include' 
      }).catch(() => null)
      
      if (!res || !res.ok) {
        set({ isLoading: false })
        return false
      }
      
      const data = await res.json().catch(() => null)
      if (!data?.access_token) {
        set({ isLoading: false })
        return false
      }
      
      const meRes = await fetch(`${AUTH_URL}/me`, { 
        headers: { Authorization: `Bearer ${data.access_token}` } 
      }).catch(() => null)
      
      if (!meRes || !meRes.ok) {
        set({ isLoading: false })
        return false
      }
      
      const meData = await meRes.json().catch(() => null)
      if (meData?.user) {
        set({ accessToken: data.access_token, user: meData.user, isAuthenticated: true, isLoading: false })
        setTimeout(() => get().silentRefresh(), 14 * 60 * 1000)
        return true
      }
      
      set({ isLoading: false })
      return false
    } catch {
      set({ isLoading: false })
      return false
    }
  },
}))

export default useAuthStore
