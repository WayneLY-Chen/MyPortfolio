// 前端 API 連線設定
//
// ─────────────────────────────────────────────────────────────────────────────
// 【為什麼 AUTH 是同源、API 卻不是 —— 這不是不一致,是 cookie 逼出來的】
// ─────────────────────────────────────────────────────────────────────────────
// 登入狀態靠一張 httpOnly 的 refresh cookie 承載(backend/src/utils/jwt.js 的
// setRefreshTokenCookie)。前端在 Vercel、後端在 Render,是兩個不同網域 ——
// 如果 /auth/* 直接打後端,那張 cookie 對瀏覽器來說就是**第三方 cookie**。
//
// iOS Safari 預設封鎖第三方 cookie。實際症狀:OAuth 整段都成功(那是往後端的
// 頂層導覽,cookie 存得進去),但緊接著的 POST /auth/refresh 是跨站 fetch,
// Safari 不把 cookie 送出去 —— 後端看不到憑證,回 401,前端顯示 auth_failed。
// 桌機 Chrome 目前還放行第三方 cookie,所以同一個 bug 只有手機看得到。
//
// 解法是讓那張 cookie 變成第一方:AUTH_URL 走同源路徑,由 Vercel 的 rewrite
// (frontend/vercel.json 的 "/auth/(.*)")代理到 Render。cookie 因此由
// vercel.app 這個網域發出,和使用者正在看的頁面同源,誰都不會擋。
//
// API_URL 與 SOCKET_URL 維持直連後端,刻意不一起改:
//   - API 用 Authorization: Bearer 傳憑證,完全不靠 cookie,跨網域沒有問題。
//   - Socket.io 是 WebSocket,Vercel 的 rewrite 代理不了,硬走會直接斷線。
//
// 【本機開發】不需要任何額外設定:vite.config.js 的 server.proxy 已經有一條
// '/auth' → http://127.0.0.1:3001,同源路徑在 dev 會被 vite 轉給本機後端。
//
// 【部署時必須成對切換 —— 只改一邊會讓 OAuth 壞掉】
// 這個檔案決定「前端往哪裡送 auth 請求」,而後端的 API_BASE_URL 環境變數決定
// 「四家 provider 的 callbackURL 指向哪裡」(backend/src/config/passport.js)。
// 兩者必須同時指向 Vercel 網域:
//   Render 的 API_BASE_URL = https://my-portfolio-waynely-chens-projects.vercel.app
// 並且該網域的 /auth/{google,github,facebook,line}/callback 都要先在四家
// provider 後台註冊好,否則 provider 會拒絕導轉。
// 要回滾:把 Render 的 API_BASE_URL 改回後端網址即可,不需要動這裡的程式碼。

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const API_URL = `${API_BASE_URL}/api`;

// 固定同源。不串 API_BASE_URL —— 串了就變回第三方 cookie,iPhone 就再次登不進去。
export const AUTH_URL = '/auth';

export const SOCKET_URL = API_BASE_URL || window.location.origin;

export default {
  API_URL,
  AUTH_URL,
  SOCKET_URL
};
