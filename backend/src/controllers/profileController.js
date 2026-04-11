const { query } = require('../db');

// 預設個人資料（資料庫為空時使用）
const DEFAULT_PROFILE = {
  name: '陳林淯',
  title: 'Creative Developer',
  bio: null,
  github: 'https://github.com/WayneLY-Chen',
  instagram: 'https://www.instagram.com/mr.w_1022/?hl=zh-tw',
  email: 'qweasd226410@gmail.com',
};

/**
 * GET /api/profile
 * 回傳個人資料，資料庫無資料時回傳預設值
 */
const getProfile = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT id, name, title, bio, github, instagram, email, updated_at
      FROM profile
      ORDER BY id DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      console.log('[Profile] 資料庫無個人資料，回傳預設值');
      return res.json({
        success: true,
        source: 'default',
        data: DEFAULT_PROFILE,
      });
    }

    return res.json({
      success: true,
      source: 'database',
      data: result.rows[0],
    });
  } catch (err) {
    // 若資料庫連線失敗，仍回傳預設值，不讓服務掛掉
    console.error('[Profile] 資料庫查詢失敗，回傳預設值:', err.message);
    return res.json({
      success: true,
      source: 'default',
      data: DEFAULT_PROFILE,
    });
  }
};

module.exports = { getProfile };
