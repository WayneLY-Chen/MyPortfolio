import { create } from 'zustand'
import { AUTH_URL } from '../config/api'

// 模組級變數，用來達成真正的單例請求 (Singleton Request / Deduplication)
let refreshPromise = null;

const useAuthStore = create((set, get) => ({
  accessToken: null,
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: (accessToken, user) => set({ accessToken, user, isAuthenticated: !!user, isLoading: false }),
  clearAuth: () => {
    set({ accessToken: null, user: null, isAuthenticated: false, isLoading: false });
    // 清除登出後的 refreshPromise 紀錄
    refreshPromise = null;
  },

  silentRefresh: async () => {
    // 如果已經有一個請求在進行中，直接返回該 Promise
    if (refreshPromise) {
      console.log('[Auth] 偵測到併發請求，正在共享身份驗證 Promise...');
      return refreshPromise;
    }

    refreshPromise = (async () => {
      try {
        console.log('[Auth] 開始執行靜默刷新 (Silent Refresh)...');
        const res = await fetch(`${AUTH_URL}/refresh`, { 
          method: 'POST', 
          credentials: 'include' 
        }).catch(err => {
          console.error('[Auth] Refresh 網路錯誤:', err);
          return null;
        });
        
        if (!res || !res.ok) {
          if (res?.status === 401) {
             console.warn('[Auth] Session 已過期 (401)，請重新登入');
          } else {
             console.error('[Auth] Refresh API 錯誤:', res?.status);
          }
          set({ isLoading: false });
          return false;
        }
        
        const data = await res.json().catch(() => null);
        if (!data?.access_token) {
          console.error('[Auth] 回傳屬性中缺少 access_token');
          set({ isLoading: false });
          return false;
        }
        
        console.log('[Auth] 拿到新 Access Token，正在獲取個人資料...');
        const meRes = await fetch(`${AUTH_URL}/me`, { 
          headers: { Authorization: `Bearer ${data.access_token}` } 
        }).catch(err => {
          console.error('[Auth] 獲取個人資料網路錯誤:', err);
          return null;
        });
        
        if (!meRes || !meRes.ok) {
          console.error('[Auth] /me API 請求失敗:', meRes?.status);
          set({ isLoading: false });
          return false;
        }
        
        const meData = await meRes.json().catch(() => null);
        if (meData?.user) {
          console.log('[Auth] 身份驗證成功，使用者:', meData.user.display_name);
          set({ 
            accessToken: data.access_token, 
            user: meData.user, 
            isAuthenticated: true, 
            isLoading: false 
          });
          
          // 排程下次自動刷新 (14分鐘)
          setTimeout(() => {
            refreshPromise = null; // 重置 Promise 鎖
            get().silentRefresh();
          }, 14 * 60 * 1000);
          
          return true;
        }
        
        set({ isLoading: false });
        return false;
      } catch (err) {
        console.error('[Auth] 驗證過程發生未預期錯誤:', err);
        set({ isLoading: false });
        return false;
      } finally {
        // 重要：只有在非自動刷新的情況下才重置，或者是讓後續手動 F5 能再觸發
        // 這裡為了讓 F5 能再次觸發，在完成後一定要清空，但由於我們回傳的是 Promise，
        // 併發的調用會拿到同一個 Promise，直到它完成為止。
        setTimeout(() => { refreshPromise = null; }, 1000); 
      }
    })();

    return refreshPromise;
  },
}))

export default useAuthStore
