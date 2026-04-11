const axios = require('axios');
require('dotenv').config();

const GITHUB_USERNAME = 'WayneLY-Chen';
const GITHUB_API_URL = `https://api.github.com/users/${GITHUB_USERNAME}/repos`;

/**
 * 建立 GitHub API 的請求標頭
 */
const buildHeaders = () => {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    console.log('[GitHub] 使用 Personal Access Token 進行驗證');
  } else {
    console.log('[GitHub] 未設定 GITHUB_TOKEN，使用未驗證請求（60 req/hr）');
  }

  return headers;
};

/**
 * 取得單一 Repo 的語言統計（以百分比表示）
 * @param {string} repoName
 * @returns {Object} 語言比例物件，例如 { JavaScript: 75.5, CSS: 24.5 }
 */
const fetchRepoLanguages = async (repoName) => {
  try {
    const url = `https://api.github.com/repos/${GITHUB_USERNAME}/${repoName}/languages`;
    const response = await axios.get(url, {
      headers: buildHeaders(),
      timeout: 3000,
    });
    const langBytes = response.data;
    const total = Object.values(langBytes).reduce((a, b) => a + b, 0);
    if (total === 0) return {};
    // Sort by bytes descending so the largest language gets the rounding remainder
    const sorted = Object.entries(langBytes).sort((a, b) => b[1] - a[1]);
    const stats = {};
    let allocated = 0;
    for (let i = 0; i < sorted.length; i++) {
      const [lang, bytes] = sorted[i];
      if (i < sorted.length - 1) {
        const pct = Math.round((bytes / total) * 1000) / 10;
        stats[lang] = pct;
        allocated += pct;
      } else {
        // Last (smallest) lang gets the remainder to guarantee sum = 100
        stats[lang] = Math.round((100 - allocated) * 10) / 10;
      }
    }
    return stats;
  } catch {
    return {};
  }
};

/**
 * 從 GitHub API 取得使用者的公開 Repo 清單
 * @returns {Array} 格式化後的 Repo 陣列（含語言統計）
 * @throws {Error} GitHub API 失敗時拋出錯誤
 */
const fetchUserRepos = async () => {
  let repos;
  try {
    console.log(`[GitHub] 正在從 API 取得 ${GITHUB_USERNAME} 的 Repo...`);

    const response = await axios.get(GITHUB_API_URL, {
      params: {
        sort: 'pushed',
        per_page: 100,
        type: 'public',
      },
      headers: buildHeaders(),
      timeout: 10000,
    });

    repos = response.data;
    console.log(`[GitHub] 成功取得 ${repos.length} 個 Repo`);
  } catch (err) {
    let message = '[GitHub] 網路錯誤';
    if (err.response) {
      message = `GitHub API 錯誤 ${err.response.status}: ${err.response.data?.message || err.message}`;
      if (err.response.status === 403) {
        message += '（已超過 rate limit，請設定 GITHUB_TOKEN）';
      }
    } else if (err.code === 'ECONNABORTED') {
      message = 'GitHub API 請求超時，請稍後再試';
    }
    console.error(`[GitHub] ${message}`);
    throw new Error(message);
  }

  // 並行抓取所有 Repo 的語言統計
  const formatted = await Promise.all(
    repos.map(async (repo) => ({
      github_id: repo.id,
      name: repo.name,
      description: repo.description || null,
      url: repo.html_url,
      homepage: repo.homepage || null,
      image_url: `https://opengraph.githubassets.com/1/${repo.owner?.login || 'WayneLY-Chen'}/${repo.name}`,
      language: repo.language || null,
      stars: repo.stargazers_count || 0,
      forks: repo.forks_count || 0,
      topics: repo.topics || [],
      updated_at: repo.updated_at,
      language_stats: await fetchRepoLanguages(repo.name),
    }))
  );

  return formatted;
};

module.exports = { fetchUserRepos, fetchRepoLanguages };
