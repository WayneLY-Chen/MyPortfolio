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
          sessionStorage.setItem('blogListCache', JSON.stringify(d.data));
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
