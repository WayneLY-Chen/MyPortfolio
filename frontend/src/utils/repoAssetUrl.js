// frontend/src/utils/repoAssetUrl.js
//
// 把 README 裡的相對路徑補成指向 GitHub 的絕對網址。零 React 依賴的純函式：
//
//   cd frontend && node --test src/utils/repoAssetUrl.test.js
//
// 為什麼需要：專案卡片是抓 GitHub 的 README 原始文字下來，在本站渲染。
// README 裡的相對路徑（例如 <img src="docs/screenshots/fun.png">、
// [ai.js](backend/src/routes/ai.js)）在 GitHub 上會相對 repo 解析，但在本站
// 會相對本站網域解析 —— 那些路徑在本站不存在，圖片因此全部破圖、連結全部
// 404。這是專案卡片裡圖片顯示不出來的原因。
//
// 分支一律使用 HEAD：raw.githubusercontent.com 與 github.com 都接受它作為
// 「該 repo 的預設分支」，因此不必先查出分支名是 main 還是 master。

// 已經是絕對位址、或不該被改寫的協定。
const ABSOLUTE_PREFIXES = ['http://', 'https://', '//', 'data:', 'mailto:', 'tel:', 'blob:'];

/**
 * 從 GitHub repo 網址取出 owner 與 repo。
 * @param {string} repoUrl 例如 https://github.com/WayneLY-Chen/MyPortfolio
 * @returns {{owner: string, repo: string}|null} 不是 github.com 的網址回傳 null
 */
export function parseRepoUrl(repoUrl) {
  if (typeof repoUrl !== 'string' || repoUrl.length === 0) return null;
  let u;
  try {
    u = new URL(repoUrl);
  } catch {
    return null;
  }
  if (u.hostname !== 'github.com' && u.hostname !== 'www.github.com') return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
}

/**
 * 把 README 裡的相對路徑解析成絕對網址。
 *
 * @param {string|undefined|null} src README 裡寫的路徑
 * @param {string|undefined|null} repoUrl 該專案的 GitHub 網址
 * @param {{raw?: boolean}} [options] raw 為 true 時回傳 raw.githubusercontent.com
 *   （圖片用，直接取檔案內容）；否則回傳 github.com 的 blob 頁（連結用）。
 * @returns {string|undefined|null} 無法或不需改寫時原樣回傳
 */
export function resolveRepoUrl(src, repoUrl, options) {
  const raw = !!(options && options.raw);
  if (typeof src !== 'string' || src.length === 0) return src;

  // 頁內錨點不動 —— 它指的是本頁的標題，不是 repo 裡的檔案。
  if (src.startsWith('#')) return src;

  for (const prefix of ABSOLUTE_PREFIXES) {
    if (src.toLowerCase().startsWith(prefix)) return src;
  }

  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) return src;

  // 去掉 ./ 與開頭的 /：README 裡兩種寫法都指 repo 根目錄。
  let path = src.replace(/^\.\//, '').replace(/^\/+/, '');
  if (path.length === 0) return src;

  const base = raw
    ? `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/HEAD/`
    : `https://github.com/${parsed.owner}/${parsed.repo}/blob/HEAD/`;

  return base + path;
}

export default resolveRepoUrl;
