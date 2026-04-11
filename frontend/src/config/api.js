// 前端 API 連線設定
// 在部署環境 (Vercel) 時，請設定 VITE_API_URL 環境變量指向後端網址
// 例如: VITE_API_URL=https://your-backend.render.com

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const API_URL = `${API_BASE_URL}/api`;
export const AUTH_URL = `${API_BASE_URL}/auth`;
export const SOCKET_URL = API_BASE_URL || window.location.origin;

export default {
  API_URL,
  AUTH_URL,
  SOCKET_URL
};
