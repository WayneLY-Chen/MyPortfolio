import { create } from 'zustand'
import { AUTH_URL } from '../config/api'

// 模組級變數，用來達成真正的單例請求 (Singleton Request / Deduplication)
let refreshPromise = null;

// 從 localStorage 初始化狀態 (支援跨分頁同步)
//
// 這一段在模組載入時就執行，因此它拋出的例外不會被任何 React 錯誤邊界接住 ——
// 整個 bundle 匯入失敗，畫面是全白，主控台只有一行 JSON parse 錯誤。
// 修補前是裸的 JSON.parse：只要 user_cache 的內容壞掉（寫入被中斷、瀏覽器
// 配額問題、其他腳本覆寫），整個網站就打不開。
//
// 快取內容壞掉不是嚴重的事 —— 它只是 UI 用的使用者資料副本，真正的登入狀態
// 由 httpOnly 的 refresh cookie 決定，silentRefresh() 會重新取得。因此壞掉時
// 直接當成「沒有快取」並清掉，讓網站正常開起來。
//
// 順帶擋掉非物件的合法 JSON（例如字串 "abc" 或數字）：那些值會通過 parse，
// 之後在 user.display_name 這類存取上才炸開，離現場更遠、更難追。
const readCachedUser = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem('user_cache') || 'null');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return null;
  } catch {
    try { localStorage.removeItem('user_cache'); } catch { /* 連刪都失敗就算了 */ }
    return null;
  }
};

const savedUser = readCachedUser();

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
             // Token 已過期，清除 localStorage
             localStorage.removeItem('user_cache');
             set({ user: null, isAuthenticated: false, isLoading: false });
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
