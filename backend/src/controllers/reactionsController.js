const { query } = require('../db');
const {
  isAllowedEmoji,
  isAllowedTargetType,
  isValidTargetId,
} = require('../config/reactionValidation');

// 身分解析。userId 來自 optionalAuthenticate（已驗簽的存取權杖），
// guestSessionId 來自 resolveGuestSession（已驗簽的訪客憑證）。兩者都不再
// 採信任何請求端自報的原始值。
//
// 回傳「欄位名 + 值」而不是兩個變數，是為了讓查詢條件只針對單一身分欄位。
// 原本的寫法是 (user_id = $4 OR session_id = $5)，那個 OR 會讓帶著別人
// session id 的請求匹配到別人那一列，接著把它刪掉。
const resolveIdentity = (req) => {
  if (req.userId) return { column: 'user_id', value: req.userId };
  if (req.guestSessionId) return { column: 'session_id', value: req.guestSessionId };
  return null;
};

const getReactionsCount = async (req, res) => {
  const { targetType, targetId } = req.query;

  if (!isAllowedTargetType(targetType) || !isValidTargetId(targetId)) {
    return res.status(400).json({ success: false, message: '目標資訊不合法' });
  }

  try {
    const countRes = await query(
      `SELECT emoji, count(*) as count
       FROM reactions
       WHERE target_type = $1 AND target_id = $2
       GROUP BY emoji`,
      [targetType, String(targetId)]
    );

    // 取得當前使用者點過的表情。沒有可驗證的身分時就是空陣列——
    // 計數仍然照常回傳，讀取不需要身分。
    let userReactions = [];
    const identity = resolveIdentity(req);
    if (identity) {
      const userRes = await query(
        `SELECT emoji FROM reactions
         WHERE target_type = $1 AND target_id = $2 AND ${identity.column} = $3`,
        [targetType, String(targetId), identity.value]
      );
      userReactions = userRes.rows.map((r) => r.emoji);
    }

    const counts = {};
    countRes.rows.forEach((r) => { counts[r.emoji] = parseInt(r.count, 10); });

    res.json({ success: true, counts, userReactions });
  } catch (err) {
    console.error('[GetReactions Error]', err.stack || err.message);
    res.status(500).json({ success: false, message: '查詢失敗' });
  }
};

const toggleReaction = async (req, res) => {
  const { targetType, targetId, emoji } = req.body;

  if (!isAllowedTargetType(targetType) || !isValidTargetId(targetId)) {
    return res.status(400).json({ success: false, message: '目標資訊不合法' });
  }
  if (!isAllowedEmoji(emoji)) {
    return res.status(400).json({ success: false, message: '不支援的表情' });
  }

  // 寫入必須有可驗證的身分。原本兩者皆空時會以 (null, null) 寫入一列，而
  // 查詢條件 user_id = NULL 在 SQL 裡永遠不成立，因此那一列再也無法被取消，
  // 每按一次就多一列——無上限的寫入放大。
  const identity = resolveIdentity(req);
  if (!identity) {
    return res.status(401).json({ success: false, message: '需要有效的身分憑證' });
  }

  try {
    const checkRes = await query(
      `SELECT id FROM reactions
       WHERE target_type = $1 AND target_id = $2 AND emoji = $3 AND ${identity.column} = $4`,
      [targetType, String(targetId), emoji, identity.value]
    );

    if (checkRes.rows.length > 0) {
      await query(`DELETE FROM reactions WHERE id = $1`, [checkRes.rows[0].id]);
      return res.json({ success: true, action: 'removed' });
    }

    await query(
      `INSERT INTO reactions (target_type, target_id, emoji, user_id, session_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        targetType,
        String(targetId),
        emoji,
        identity.column === 'user_id' ? identity.value : null,
        identity.column === 'session_id' ? identity.value : null,
      ]
    );
    return res.json({ success: true, action: 'added' });
  } catch (err) {
    console.error('[ToggleReaction Error]', err.stack || err.message);
    return res.status(500).json({ success: false, message: '操作失敗' });
  }
};

module.exports = { getReactionsCount, toggleReaction };
