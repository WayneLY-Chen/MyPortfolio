import { create } from 'zustand'
import { AUTH_URL } from '../config/api'

// 模組級變數，用來達成真正的單例請求 (Singleton Request / Deduplication)
let refreshPromise = null;

// 從 localStorage 初始化狀態
const savedUser = JSON.parse(localStorage.getItem('user_cache') || 'null');

const useAuthStore = create((set, get) => ({
  accessToken: null,
  user: savedUser,
  isAuthenticated: !!savedUser,
  isLoading: true,

  setAuth: (accessToken, user) => {
    localStorage.setItem('user_cache', JSON.stringify(user));
    set({ accessToken, user, isAuthenticated: !!user, isLoading: false });
  },
  
  clearAuth: () => {
    localStorage.removeItem('user_cache');
    set({ accessToken: null, user: null, isAuthenticated: false, isLoading: false });
    refreshPromise = null;
  },

  silentRefresh: async () => {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      try {
        const res = await fetch(`${AUTH_URL}/refresh`, { 
          method: 'POST', 
          credentials: 'include' 
        }).catch(() => null);
        
        if (!res || !res.ok) {
          if (res?.status === 401) {
             // Token 已過期，清除快取
             localStorage.removeItem('user_cache');
             set({ user: null, isAuthenticated: false });
          }
          set({ isLoading: false });
          return false;
        }
        
        const data = await res.json().catch(() => null);
        if (!data?.access_token) {
          set({ isLoading: false });
          return false;
        }
        
        const meRes = await fetch(`${AUTH_URL}/me`, { 
          headers: { Authorization: `Bearer ${data.access_token}` } 
        }).catch(() => null);
        
        if (!meRes || !meRes.ok) {
          set({ isLoading: false });
          return false;
        }
        
        const meData = await meRes.json().catch(() => null);
        if (meData?.user) {
          localStorage.setItem('user_cache', JSON.stringify(meData.user));
          set({ 
            accessToken: data.access_token, 
            user: meData.user, 
            isAuthenticated: true, 
            isLoading: false 
          });
          
          setTimeout(() => {
            refreshPromise = null;
            get().silentRefresh();
          }, 14 * 60 * 1000);
          
          return true;
        }
        
        set({ isLoading: false });
        return false;
      } catch {
        set({ isLoading: false });
        return false;
      } finally {
        setTimeout(() => { refreshPromise = null; }, 1000); 
      }
    })();

    return refreshPromise;
  },
}))

export default useAuthStore
