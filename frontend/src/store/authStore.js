import { create } from 'zustand'
import { AUTH_URL } from '../config/api'

const useAuthStore = create((set, get) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isRefreshing: false,

  setAuth: (accessToken, user) => set({ accessToken, user, isAuthenticated: !!user, isLoading: false, isRefreshing: false }),
  clearAuth: () => set({ accessToken: null, user: null, isAuthenticated: false, isLoading: false }),

  silentRefresh: async () => {
    // 防止重複併發請求 (例如 React 18 StrictMode 兩次掛載)
    if (get().isRefreshing) return false;
    set({ isRefreshing: true });

    try {
      const res = await fetch(`${AUTH_URL}/refresh`, { 
        method: 'POST', 
        credentials: 'include' 
      }).catch(() => null)
      
      if (!res || !res.ok) {
        set({ isLoading: false, isRefreshing: false })
        return false
      }
      
      const data = await res.json().catch(() => null)
      if (!data?.access_token) {
        set({ isLoading: false, isRefreshing: false })
        return false
      }
      
      const meRes = await fetch(`${AUTH_URL}/me`, { 
        headers: { Authorization: `Bearer ${data.access_token}` } 
      }).catch(() => null)
      
      if (!meRes || !meRes.ok) {
        set({ isLoading: false, isRefreshing: false })
        return false
      }
      
      const meData = await meRes.json().catch(() => null)
      if (meData?.user) {
        set({ 
          accessToken: data.access_token, 
          user: meData.user, 
          isAuthenticated: true, 
          isLoading: false,
          isRefreshing: false 
        })
        setTimeout(() => get().silentRefresh(), 14 * 60 * 1000)
        return true
      }
      
      set({ isLoading: false, isRefreshing: false })
      return false
    } catch {
      set({ isLoading: false, isRefreshing: false })
      return false
    }
  },
})),

export default useAuthStore
