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

// 共用的專案欄位清單與重新讀取查詢，供 getProjects 的各個 fallback 分支
// 與 syncProjects 共用，避免同一段 SQL 文字散落四處（backfill 補齊時也重用此查詢）
const PROJECT_COLUMNS = 'id, name, description, readme, image_url, url, homepage, language, stars, forks, topics, language_stats, updated_at';
const fetchAllProjectsFromDb = () => query(`
  SELECT ${PROJECT_COLUMNS}
  FROM projects
  ORDER BY updated_at DESC NULLS LAST
`);

// 判斷單一 row 是否缺少語言統計：欄位不存在或為空物件都視為缺漏
const isMissingLanguageStats = (row) => !row.language_stats || Object.keys(row.language_stats).length === 0;

// --- 伺服器端語言統計補齊（D-12）---------------------------------------
// 取代前端訪客過去在瀏覽器背景觸發的 POST /api/projects/sync。
// 模組層級的 in-flight 旗標與冷卻時間戳記，防止：
//   1. 多個訪客同時讀取時各自觸發一次 GitHub 同步
//   2. 語言統計本來就無法補齊的 repo，導致每次頁面載入都重新打一次 GitHub API
// 這正是本階段要避免的 rate-limit 耗盡（T-01-16）。冷卻時間與既有的
// CACHE_DURATION_HOURS 常數同一數量級。
let backfillInFlight = false;
let lastBackfillAttemptAt = 0;
const BACKFILL_COOLDOWN_MS = CACHE_DURATION_HOURS * 60 * 60 * 1000;

/**
 * 在讀取路徑中機會性地補齊缺少語言統計的快取資料。
 * 任何失敗（GitHub 限流、Token 失效、網路錯誤、DB 寫入失敗）都必須回退到
 * 呼叫端傳入的原始快取資料 —— 訪客的讀取請求不能因為這個機會性補齊而失敗。
 * @param {Array} cachedRows - 目前快取中的 rows（可能缺少 language_stats）
 * @returns {Array} 補齊後的 rows，或補齊失敗/跳過時的原始 cachedRows
 */
const backfillLanguageStatsIfMissing = async (cachedRows) => {
  const now = Date.now();
  if (backfillInFlight || now - lastBackfillAttemptAt < BACKFILL_COOLDOWN_MS) {
    console.log('[Projects] 語言統計補齊已在進行中或處於冷卻期，略過本次補齊');
    return cachedRows;
  }

  backfillInFlight = true;
  lastBackfillAttemptAt = now;
  try {
    console.log('[Projects] 快取資料缺少語言統計，嘗試伺服器端補齊...');
    const repos = await fetchUserRepos();
    if (repos.length === 0) {
      return cachedRows;
    }

    await upsertProjects(repos);
    const freshResult = await fetchAllProjectsFromDb();
    return freshResult.rows.length > 0 ? freshResult.rows : cachedRows;
  } catch (err) {
    console.error('[Projects] 語言統計伺服器端補齊失敗，回傳既有快取資料:', err.message);
    return cachedRows;
  } finally {
    backfillInFlight = false;
  }
};

// 測試專用：重置模組層級的補齊旗標，避免測試案例之間互相污染
// （見 backend/src/routes/projects.test.js）。正式流程中不會呼叫。
const _resetBackfillGuardForTests = () => {
  backfillInFlight = false;
  lastBackfillAttemptAt = 0;
};

/**
 * GET /api/projects
 * 先嘗試從資料庫快取取得（1小時內），若無則呼叫 GitHub API
 */
const getProjects = async (req, res, next) => {
  try {
    // ?sync=true 的快取繞道已移除。
    //
    // 這條路由是公開的（routes/projects.js:8，沒有 authenticate、沒有限流），
    // 而 forceSync 會直接跳過快取呼叫 fetchUserRepos()——那個函式對每個 repo
    // 各發兩次 GitHub API 請求（languages + readme），加上列表本身，以目前 15
    // 個公開 repo 計算是一次匿名 HTTP 請求換 31 次 GitHub API 呼叫，外加 15 次
    // 循序的資料庫 UPSERT。
    //
    // GitHub 未驗證請求的上限是 60 次/小時：兩個請求就打爆，之後專案頁只能靠
    // stale-cache 撐著。設了 GITHUB_TOKEN 也只是把門檻推到約 160 個請求。
    // 每個請求還會佔著連線跑 31 次逐一等待、逾時各 8 秒的外部呼叫。
    //
    // 同樣的能力在 POST /api/projects/sync 上是 authenticate + requireAdmin +
    // syncLimiter。也就是一個受保護的操作，另外開了一個完全不設防的入口。
    //
    // 前端已經沒有任何地方使用這個參數（D-12 起訪客就不再從瀏覽器觸發同步，
    // 已全域搜尋確認），因此直接移除而不是加限流——沒有呼叫端的能力，最安全
    // 的狀態是不存在。管理員要強制同步請走 POST /api/projects/sync。
    //
    // 快取未命中時仍會落到下方的 GitHub 同步，那條路徑是必要且自限的：
    // 同步成功之後快取就熱了，一小時內不會再打。
    {
      // 查詢資料庫中 1 小時內更新的快取資料
      const cacheResult = await query(`
        SELECT ${PROJECT_COLUMNS}
        FROM projects
        WHERE created_at > NOW() - INTERVAL '${CACHE_DURATION_HOURS} hours'
           OR (SELECT MAX(created_at) FROM projects) > NOW() - INTERVAL '${CACHE_DURATION_HOURS} hours'
        ORDER BY updated_at DESC NULLS LAST
      `);

      if (cacheResult.rows.length > 0) {
        console.log(`[Projects] 命中快取，回傳 ${cacheResult.rows.length} 筆資料`);

        if (!cacheResult.rows.some(isMissingLanguageStats)) {
          return res.json({
            success: true,
            source: 'cache',
            data: cacheResult.rows,
          });
        }

        // D-12：訪客不再從瀏覽器觸發同步，改由讀取路徑機會性地在後端補齊
        const completedRows = await backfillLanguageStatsIfMissing(cacheResult.rows);
        return res.json({
          success: true,
          source: 'cache',
          data: completedRows,
        });
      }
    }

    // 快取不存在或已過期，呼叫 GitHub API
    console.log('[Projects] 正在呼叫 GitHub API...');
    let repos = [];
    try {
      repos = await fetchUserRepos();
    } catch (ghErr) {
      // GitHub 失敗（Token 失效、限流等）→ 回退使用資料庫既有資料，不要回空白
      console.error('[Projects] GitHub 同步失敗，回退資料庫既有資料:', ghErr.message);
      const staleResult = await fetchAllProjectsFromDb();
      return res.json({ success: true, source: 'stale-cache', data: staleResult.rows });
    }

    if (repos.length > 0) {
      try {
        await upsertProjects(repos);

        // 從資料庫重新讀取（確保格式一致）
        const freshResult = await fetchAllProjectsFromDb();

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
    const fallbackResult = await fetchAllProjectsFromDb();
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
      const freshResult = await fetchAllProjectsFromDb();
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

module.exports = { getProjects, updateProject, syncProjects, _resetBackfillGuardForTests };
