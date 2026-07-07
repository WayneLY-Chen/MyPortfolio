const { query } = require('../db');
const { fetchUserRepos } = require('../services/githubService');

const CACHE_DURATION_HOURS = 1;

/**
 * 將 GitHub 資料批次寫入或更新 projects 表
 * @param {Array} repos - 格式化後的 Repo 陣列
 */
const upsertProjects = async (repos) => {
  if (!repos || repos.length === 0) return;

  const upsertSQL = `
    INSERT INTO projects (github_id, name, description, url, homepage, language, stars, forks, topics, language_stats, updated_at, readme)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (github_id) DO UPDATE SET
      name           = EXCLUDED.name,
      -- 以 GitHub 為準：GitHub 上改了描述/主題/README 就跟著更新（GitHub 為空才保留舊值）
      description    = COALESCE(NULLIF(EXCLUDED.description, ''), projects.description),
      topics         = COALESCE(NULLIF(EXCLUDED.topics, '{}'::text[]), projects.topics),
      readme         = COALESCE(NULLIF(EXCLUDED.readme, ''), projects.readme),
      -- 圖片仍優先保留資料庫的自訂封面
      image_url      = COALESCE(NULLIF(projects.image_url, ''), EXCLUDED.image_url),
      language_stats = EXCLUDED.language_stats,
      url            = EXCLUDED.url,
      homepage       = EXCLUDED.homepage,
      language       = EXCLUDED.language,
      stars          = EXCLUDED.stars,
      forks          = EXCLUDED.forks,
      updated_at     = EXCLUDED.updated_at,
      -- 記錄本次同步時間，讓上方的 1 小時快取判斷（created_at）真正生效
      created_at     = NOW()
  `;

  for (const repo of repos) {
    await query(upsertSQL, [
      repo.github_id,
      repo.name,
      repo.description,
      repo.url,
      repo.homepage,
      repo.language,
      repo.stars,
      repo.forks,
      repo.topics,
      JSON.stringify(repo.language_stats || {}),
      repo.updated_at,
      repo.readme || null,
    ]);
  }

  console.log(`[Projects] 成功寫入 ${repos.length} 筆專案資料`);
};

/**
 * GET /api/projects
 * 先嘗試從資料庫快取取得（1小時內），若無則呼叫 GitHub API
 */
const getProjects = async (req, res, next) => {
  try {
    const forceSync = req.query.sync === 'true';

    if (!forceSync) {
      // 查詢資料庫中 1 小時內更新的快取資料
      const cacheResult = await query(`
        SELECT id, name, description, readme, image_url, url, homepage, language, stars, forks, topics, language_stats, updated_at
        FROM projects
        WHERE created_at > NOW() - INTERVAL '${CACHE_DURATION_HOURS} hours'
           OR (SELECT MAX(created_at) FROM projects) > NOW() - INTERVAL '${CACHE_DURATION_HOURS} hours'
        ORDER BY updated_at DESC NULLS LAST
      `);

      if (cacheResult.rows.length > 0) {
        console.log(`[Projects] 命中快取，回傳 ${cacheResult.rows.length} 筆資料`);
        return res.json({
          success: true,
          source: 'cache',
          data: cacheResult.rows,
        });
      }
    } else {
      console.log('[Projects] 偵測到強制同步請求 (sync=true)');
    }

    // 快取不存在、已過期或強制同步，呼叫 GitHub API
    console.log('[Projects] 正在呼叫 GitHub API...');
    let repos = [];
    try {
      repos = await fetchUserRepos();
    } catch (ghErr) {
      // GitHub 失敗（Token 失效、限流等）→ 回退使用資料庫既有資料，不要回空白
      console.error('[Projects] GitHub 同步失敗，回退資料庫既有資料:', ghErr.message);
      const staleResult = await query(`
        SELECT id, name, description, readme, image_url, url, homepage, language, stars, forks, topics, language_stats, updated_at
        FROM projects
        ORDER BY updated_at DESC NULLS LAST
      `);
      return res.json({ success: true, source: 'stale-cache', data: staleResult.rows });
    }

    if (repos.length > 0) {
      try {
        await upsertProjects(repos);

        // 從資料庫重新讀取（確保格式一致）
        const freshResult = await query(`
          SELECT id, name, description, readme, image_url, url, homepage, language, stars, forks, topics, language_stats, updated_at
          FROM projects
          ORDER BY updated_at DESC NULLS LAST
        `);

        if (freshResult.rows.length > 0) {
          return res.json({
            success: true,
            source: 'github',
            data: freshResult.rows,
          });
        }
      } catch (dbErr) {
        console.log('[Projects] DB write/read failed, returning GitHub data directly:', dbErr.message);
      }

      // DB write or re-read failed — return GitHub data directly
      return res.json({ success: true, source: 'github', data: repos });
    }

    // GitHub 回傳 0 筆時也退回資料庫既有資料
    const fallbackResult = await query(`
      SELECT id, name, description, readme, image_url, url, homepage, language, stars, forks, topics, language_stats, updated_at
      FROM projects
      ORDER BY updated_at DESC NULLS LAST
    `);
    return res.json({ success: true, source: fallbackResult.rows.length > 0 ? 'stale-cache' : 'github', data: fallbackResult.rows });
  } catch (err) {
    // DB completely unavailable — try GitHub API directly
    console.error('[Projects] DB unavailable, falling back to GitHub API:', err.message);
    try {
      const repos = await fetchUserRepos();
      return res.json({ success: true, source: 'github', data: repos });
    } catch (githubErr) {
      console.error('[Projects] Both DB and GitHub failed:', githubErr.message);
      return res.json({ success: true, source: 'error', data: [] });
    }
  }
};

const updateProject = async (req, res, next) => {
  const { id } = req.params;
  const { description, topics: rawTopics, image_url, name, github_id } = req.body;

  try {
    // 強制將 topics 轉換為陣列格式
    const topics = Array.isArray(rawTopics) 
      ? rawTopics 
      : (typeof rawTopics === 'string' ? rawTopics.split(',').map(s => s.trim()).filter(Boolean) : []);

    // Try by numeric DB id first
    if (id && !isNaN(Number(id))) {
      const result = await query(
        `UPDATE projects SET description = $1, topics = $2, image_url = $3, name = COALESCE($4, name) WHERE id = $5 RETURNING *`,
        [description, topics, image_url, name || null, Number(id)]
      );
      if (result.rows.length > 0) {
        return res.json({ success: true, data: result.rows[0] });
      }
    }

    // 如果都找不到，嘗試根據 github_id 執行 UPSERT
    if (github_id) {
      console.log(`[Projects] 執行 github_id UPSERT: ${github_id} (${name})`);
      const upsertResult = await query(
        `INSERT INTO projects (github_id, name, description, topics, image_url) 
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (github_id) DO UPDATE SET 
           description = $3, 
           topics = $4, 
           image_url = $5,
           name = $2
         RETURNING *`,
        [github_id, name, description, topics, image_url]
      );
      if (upsertResult.rows.length > 0) {
        return res.json({ success: true, data: upsertResult.rows[0] });
      }
    }

    return res.status(404).json({ success: false, message: '儲存失敗：找不到該專案識別資訊或參數不足' });
  } catch (err) {
    console.error('[Projects Error]', err.message);
    return res.status(500).json({ success: false, message: `資料庫錯誤: ${err.message}` });
  }
};

/**
 * POST /api/projects/sync
 * 強制從 GitHub 同步最新資料（含語言統計）
 */
const syncProjects = async (req, res) => {
  try {
    console.log('[Projects] 開始強制同步 GitHub 資料...');
    const repos = await fetchUserRepos();

    if (repos.length > 0) {
      await upsertProjects(repos);
      const freshResult = await query(`
        SELECT id, name, description, readme, image_url, url, homepage, language, stars, forks, topics, language_stats, updated_at
        FROM projects
        ORDER BY updated_at DESC NULLS LAST
      `);
      return res.json({ success: true, data: freshResult.rows, count: freshResult.rows.length });
    }

    return res.json({ success: true, data: [], count: 0 });
  } catch (err) {
    console.error('[Projects Sync Error]', err.message);
    if (err.message.includes('403') || err.message.toLowerCase().includes('rate limit')) {
      return res.status(429).json({ success: false, message: 'GitHub API 請求超限，請稍後再試或設定 GITHUB_TOKEN' });
    }
    return res.status(502).json({ success: false, message: `自動偵測失敗: ${err.message}` });
  }
};

module.exports = { getProjects, updateProject, syncProjects };
