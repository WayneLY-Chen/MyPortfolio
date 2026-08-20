// frontend/src/config/guestSession.js
//
// 取得伺服器簽發的訪客身分憑證。
//
// 取代先前散落在兩處、各自用 Math.random() 自產 sessionId 的寫法：
//
//   Reactions.jsx      id = 'sess_' + Math.random().toString(36).substr(2, 9)
//   BlogPostPage.jsx   id = Math.random().toString(36).substring(2, 15)
//
// 那些值是前端自報、後端盲信的，因此送別人的值就能刪掉別人的表情反應，送
// 無限個假值就能把計數灌到任意數字。Math.random() 本身也不是密碼學安全的
// 亂數來源。
//
// 現在改成跟 /auth/guest-session 要一份 { sessionId, token }：sessionId 由
// 伺服器以 crypto.randomUUID() 產生，token 是它的簽章。後端的
// resolveGuestSession middleware 驗證簽章後才採信其中的 sessionId。這與
// Socket.io 握手早已採用的機制是同一套（見 FunPage.jsx 的 loadGuestSession
// 與 backend/src/sockets/index.js）。
//
// 與 FunPage 版本的差異，刻意保留：
//   - FunPage 用 sessionStorage：兩款多人遊戲需要「每個分頁各自一個身分」，
//     才能在同一台電腦開兩個分頁互打。
//   - 這裡用 localStorage：表情反應應該跨分頁、跨瀏覽器工作階段保持一致，
//     否則使用者換個分頁就會看到自己沒按過讚。
//
// 未把 FunPage 的那份一併收攏進來，是因為兩者的儲存語意不同，合併需要額外
// 參數與更動一個運作正常的檔案；此處只處理有問題的兩處。

import { AUTH_URL } from './api';

const STORAGE_KEY = 'guest_session';

// 同一個分頁內併發呼叫時共用同一個請求，避免同時發多個 /guest-session。
let inFlight = null;

/**
 * 取得訪客憑證。已快取則直接回傳，否則跟伺服器索取一份並存進 localStorage。
 *
 * @returns {Promise<{sessionId: string, token: string}|null>}
 *   取得失敗時回傳 null —— 呼叫端應該讓功能安靜降級（仍可讀取計數，只是
 *   不能按表情），不要因此讓整個頁面壞掉。
 */
export async function getGuestSession() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.sessionId && parsed?.token) return parsed;
    }
  } catch {
    // 損壞的 storage 內容視同沒有 —— 往下重新索取
  }

  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch(`${AUTH_URL}/guest-session`);
      const data = await res.json();
      if (!data?.success || !data?.sessionId || !data?.token) return null;
      const pair = { sessionId: data.sessionId, token: data.token };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(pair));
      } catch {
        // localStorage 不可用（無痕模式配額、使用者停用）時仍回傳憑證，
        // 只是這次工作階段結束後要重新索取。
      }
      return pair;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * 產生帶著訪客憑證的請求標頭。沒有憑證時回傳空物件。
 *
 * 標頭名沿用既有的 x-session-id（後端 CORS 的 allowedHeaders 已包含它），
 * 但內容由「自報的 id」改為「伺服器簽章的 token」。
 *
 * @returns {Promise<Record<string, string>>}
 */
export async function guestSessionHeaders() {
  const session = await getGuestSession();
  return session ? { 'x-session-id': session.token } : {};
}

export default getGuestSession;
