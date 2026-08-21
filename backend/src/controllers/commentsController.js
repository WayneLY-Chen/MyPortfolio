const { query } = require('../db')
const {
  CONTENT_MAX_CHARS,
  isAllowedTargetType,
  isValidTargetId,
  isValidCommentContent,
  normalizeAuthorName,
} = require('../config/commentValidation')

const getComments = async (req, res) => {
  const { type, id } = req.query
  // 讀取端也套白名單：不在清單上的 target_type 不可能有合法留言，直接回空
  // 陣列而不是去查一次資料庫。回 200 空陣列而非 400 —— 讀取失敗不該讓頁面
  // 看起來壞掉，與 GET /api/leaderboard 的既有做法一致。
  if (!isAllowedTargetType(type) || !isValidTargetId(id)) {
    return res.json({ success: true, data: [] })
  }
  try {
    const result = await query(
      `SELECT id, author_name, content, created_at, user_id FROM comments
       WHERE target_type = $1 AND target_id = $2 AND NOT is_deleted
       ORDER BY created_at DESC LIMIT 50`,
      [type, String(id)]
    )
    res.json({ success: true, data: result.rows })
  } catch (err) {
    console.error('[GetComments Error]', err.stack || err.message)
    // 不回傳 err.message：pg 的錯誤訊息會帶上主機位址、連接埠與 SQL 片段。
    res.status(500).json({ success: false, message: '讀取留言失敗' })
  }
}

/**
 * 取出使用者的顯示名稱。查不到時回 null，由 normalizeAuthorName 補預設值。
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
const resolveDisplayName = async (userId) => {
  const result = await query('SELECT display_name FROM users WHERE id = $1', [userId])
  return result.rows.length > 0 ? result.rows[0].display_name : null
}

const addComment = async (req, res) => {
  const { type, id, content } = req.body
  const userId = req.userId; // 從 authenticate middleware 取得

  // 型別檢查不是防禦性冗贅。修補前的檢查是 `!content?.trim()`，content 為
  // 數字或陣列時那一行直接拋 TypeError，而它在 try 區塊之外 —— 在
  // middlewares/asyncGuard.js 補上防線之前，任何已登入的使用者送
  // {"content": 123} 就能讓後端行程中止。詳見 config/commentValidation.js。
  if (!isAllowedTargetType(type) || !isValidTargetId(id)) {
    return res.status(400).json({ success: false, message: '留言目標不正確' })
  }
  if (!isValidCommentContent(content)) {
    return res.status(400).json({ success: false, message: `留言內容缺少或超過 ${CONTENT_MAX_CHARS} 字` })
  }

  try {
    // author_name 改由伺服器依 user_id 查出來，不再取自請求 body。
    //
    // 修補前是 `author_name = '訪客'` 的預設參數加上 body 的值，而這條路由掛
    // 的是 authenticate（一定有 userId）—— 也就是任何已登入的使用者都能用任
    // 意名字發言。實測：一般帳號可以用「網站管理員 Wayne」的名義留言，前端
    // 就照著顯示。留言區是公開的，這是冒名，不只是資料髒。
    const displayName = normalizeAuthorName(await resolveDisplayName(userId))

    const result = await query(
      `INSERT INTO comments (target_type, target_id, author_name, content, user_id)
       SELECT $1, $2, $3, $4, u.id
       FROM users u
       WHERE u.id = $5
       RETURNING id, author_name, content, created_at, user_id`,
      [type, String(id), displayName, content.trim(), userId]
    )
    // 用 INSERT ... SELECT FROM users 而不是直接 VALUES：帳號已被刪除、但
    // access token 還在 15 分鐘效期內的情況下不會留下一筆孤兒留言。
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: '帳號狀態異常，請重新登入' })
    }
    res.json({ success: true, data: result.rows[0] })
  } catch (err) {
    console.error('[AddComment Error]', err.stack || err.message)
    res.status(500).json({ success: false, message: '留言失敗' })
  }
}

const deleteComment = async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;
  const isAdmin = req.userRole === 'admin';

  try {
    // 檢查身分：管理員可刪除任何留言，一般使用者只能刪自己的。
    if (!isAdmin) {
      const check = await query(`SELECT user_id FROM comments WHERE id = $1`, [id]);
      if (check.rows.length === 0) return res.status(404).json({ success: false, message: '留言不存在' });
      if (check.rows[0].user_id !== userId) {
        return res.status(403).json({ success: false, message: '權限不足' });
      }
    }

    await query(`UPDATE comments SET is_deleted = true WHERE id = $1`, [id]);
    res.json({ success: true, message: '已刪除留言' });
  } catch (err) {
    console.error('[DeleteComment Error]', err.stack || err.message)
    // 不回傳 err.message：id 不是合法 UUID 時 pg 會回一段帶欄位型別的訊息。
    res.status(500).json({ success: false, message: '刪除失敗' });
  }
}

module.exports = { getComments, addComment, deleteComment }
