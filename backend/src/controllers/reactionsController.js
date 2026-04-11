const { query } = require('../db');

const getReactionsCount = async (req, res) => {
  const { targetType, targetId } = req.query;
  const userId = req.userId; // 從 authenticate 中間件取得
  const sessionId = req.headers['x-session-id']; // 用於訪客識別

  if (!targetType || !targetId) return res.status(400).json({ success: false, message: '缺少目標資訊' });

  try {
    // 取得所有表情的統計數據
    const countRes = await query(
      `SELECT emoji, count(*) as count 
       FROM reactions 
       WHERE target_type = $1 AND target_id = $2
       GROUP BY emoji`,
      [targetType, targetId]
    );

    // 取得當前使用者點過的表情
    let userReactions = [];
    if (userId || sessionId) {
      const userRes = await query(
        `SELECT emoji FROM reactions 
         WHERE target_type = $1 AND target_id = $2 
         AND (user_id = $3 OR session_id = $4)`,
        [targetType, targetId, userId || null, sessionId || null]
      );
      userReactions = userRes.rows.map(r => r.emoji);
    }

    const counts = {};
    countRes.rows.forEach(r => { counts[r.emoji] = parseInt(r.count); });

    res.json({ success: true, counts, userReactions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const toggleReaction = async (req, res) => {
  const { targetType, targetId, emoji } = req.body;
  const userId = req.userId;
  const sessionId = req.headers['x-session-id'];

  if (!targetType || !targetId || !emoji) return res.status(400).json({ success: false, message: '缺少必要欄位' });

  try {
    // 檢查是否已存在
    const checkRes = await query(
      `SELECT id FROM reactions 
       WHERE target_type = $1 AND target_id = $2 AND emoji = $3
       AND (user_id = $4 OR session_id = $5)`,
      [targetType, targetId, emoji, userId || null, sessionId || null]
    );

    if (checkRes.rows.length > 0) {
      // 已存在 -> 刪除 (Unlike)
      await query(`DELETE FROM reactions WHERE id = $1`, [checkRes.rows[0].id]);
      return res.json({ success: true, action: 'removed' });
    } else {
      // 不存在 -> 新增 (Like)
      await query(
        `INSERT INTO reactions (target_type, target_id, emoji, user_id, session_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [targetType, targetId, emoji, userId || null, sessionId || null]
      );
      return res.json({ success: true, action: 'added' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getReactionsCount, toggleReaction };
