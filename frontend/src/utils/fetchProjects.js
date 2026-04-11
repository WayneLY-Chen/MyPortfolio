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
          sessionStorage.setItem('projectsListCache', JSON.stringify(d.data));
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
