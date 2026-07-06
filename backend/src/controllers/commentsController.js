const { query } = require('../db')

const getComments = async (req, res) => {
  const { type, id } = req.query
  if (!type || !id) return res.status(400).json({ success: false, message: '缺少參數' })
  try {
    const result = await query(
      `SELECT id, author_name, content, created_at, user_id FROM comments
       WHERE target_type = $1 AND target_id = $2 AND NOT is_deleted
       ORDER BY created_at DESC LIMIT 50`,
      [type, String(id)]
    )
    res.json({ success: true, data: result.rows })
  } catch (err) { res.status(500).json({ success: false, message: err.message }) }
}

const addComment = async (req, res) => {
  const { type, id, author_name = '訪客', content } = req.body
  const userId = req.userId; // 從 authenticate middleware 取得
  
  if (!type || !id || !content?.trim()) return res.status(400).json({ success: false, message: '缺少必要欄位' })
  if (content.length > 500) return res.status(400).json({ success: false, message: '留言過長' })
  
  try {
    const result = await query(
      `INSERT INTO comments (target_type, target_id, author_name, content, user_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, author_name, content, created_at, user_id`,
      [type, String(id), author_name.slice(0, 50), content.trim(), userId]
    )
    res.json({ success: true, data: result.rows[0] })
  } catch (err) { 
    console.error('[AddComment Error]', err)
    res.status(500).json({ success: false, message: err.message }) 
  }
}

const deleteComment = async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;
  const isAdmin = req.userRole === 'admin';

  try {
    // 檢查身分：只有管理員能刪除任何留言（暫時設定只有管理員能刪，或原作者也能刪）
    // 如果要允許原作者刪，需要先 SELECT 查 user_id
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
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { getComments, addComment, deleteComment }
