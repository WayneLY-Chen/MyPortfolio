let fetchPromise = null;

import { API_URL } from '../config/api';

export default async function fetchProjectsCached() {
  const cached = sessionStorage.getItem('projectsListCache');
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }

  if (!fetchPromise) {
    fetchPromise = fetch(`${API_URL}/projects`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          // 空清單不寫入快取，避免 API 暫時故障時把「沒資料」鎖進整個分頁生命週期
          if (Array.isArray(d.data) && d.data.length > 0) {
            sessionStorage.setItem('projectsListCache', JSON.stringify(d.data));
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
