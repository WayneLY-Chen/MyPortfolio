import { API_URL } from '../config/api';
let fetchPromise = null;

export default async function fetchBlogCached() {
  const cached = sessionStorage.getItem('blogListCache');
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }

  if (!fetchPromise) {
    fetchPromise = fetch(`${API_URL}/blog`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          // 空清單不寫入快取，避免 API 暫時故障時把「沒資料」鎖進整個分頁生命週期
          if (Array.isArray(d.data) && d.data.length > 0) {
            sessionStorage.setItem('blogListCache', JSON.stringify(d.data));
          }
          return d.data;
        }
        return [];
      })
      .catch(e => {
        fetchPromise = null;
        return [];
      });
  }

  return fetchPromise;
}
