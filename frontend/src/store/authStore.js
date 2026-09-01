import { create } from 'zustand'
import { AUTH_URL } from '../config/api'

// 模組級變數，用來達成真正的單例請求 (Singleton Request / Deduplication)
let refreshPromise = null;

// 續期計時器的 id。必須留在模組層而且必須可以取消 —— 這是「登出之後又自己
// 登回去」的第二條路徑:silentRefresh 成功後會排一個 14 分鐘後的下一次，
// 如果登出時不把它清掉，14 分鐘後那個計時器照樣會拿 cookie 去換新的 token。
//
// 只留一個 id 也順帶修掉另一個問題:排新的之前先清掉舊的，確保任何時刻
// 只有一條續期鏈。先前每次成功刷新都無條件再排一個，而 refreshPromise 只
// 鎖 1 秒，所以兩個分頁、或兩次間隔超過 1 秒的呼叫，就會疊出兩條並行的鏈。
// refresh 是輪換制(換發時立刻撤銷舊的)，兩條鏈同時觸發時搶輸的那條會拿到
// 已撤銷的 token 而收到 401 —— 表現出來就是分頁莫名其妙自己登出。
let refreshTimer = null;

// 登出世代。clearAuth 每次都把它推進一格，silentRefresh 在開始時記下當時的值、
// 套用結果之前再比對一次。
//
// 為什麼需要它:App.jsx 每次進站就會發動 silentRefresh，而使用者可能在它還在
// 飛的時候就按下登出。logout 會依序完成「打後端撤銷」與「清本地狀態」，但那個
// 更早發出的 silentRefresh 之後才回來 —— 它會若無其事地把 user 寫回 store、
// 把 isAuthenticated 設回 true，並排下一輪續期。使用者按了登出，畫面卻在一秒後
// 自己登了回去。比對世代就能把這份已經過期的結果整個丟掉。
let authEpoch = 0;

const cancelRefreshTimer = () => {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
};

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
    cancelRefreshTimer();
    authEpoch += 1;
  },

  // 真正的登出。clearAuth 只清得掉這個分頁的記憶體與 localStorage，而登入
  // 狀態的真正依據是那張 httpOnly 的 refresh cookie —— JavaScript 讀不到也
  // 刪不掉它，只有伺服器能撤銷。少了這一步，按下登出之後 cookie 與資料庫裡
  // 那張 token 都還活著(效期 30 天)，下次進站 App.jsx 的 silentRefresh 一跑
  // 就把人原封不動登回去。
  //
  // 無論後端回什麼都要往下走到本地清除:網路斷線、後端睡著(Render 免費方案
  // 會休眠)、CORS 出問題 —— 這些都不該讓使用者卡在一個他已經按過登出的畫面。
  // 最壞情況是伺服器端沒撤銷成功，但本地狀態一定會清乾淨。
  logout: async () => {
    const { accessToken } = get();
    try {
      await fetch(`${AUTH_URL}/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
    } catch {
      // 吞掉:登出在前端永遠不能失敗
    }
    get().clearAuth();
  },

  silentRefresh: async () => {
    if (refreshPromise) return refreshPromise;

    const epoch = authEpoch;

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
          // 這中間使用者已經登出了 —— 這份結果整個作廢，不寫回 store、
          // 也不排下一輪續期。
          if (epoch !== authEpoch) return false;
          localStorage.setItem('user_cache', JSON.stringify(meData.user));
          set({ 
            accessToken: data.access_token, 
            user: meData.user, 
            isAuthenticated: true, 
            isLoading: false 
          });
          
          // 先清掉既有的那條鏈再排新的，確保同一時間只有一條(見檔案頂端說明)。
          cancelRefreshTimer();
          refreshTimer = setTimeout(() => {
            refreshTimer = null;
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
