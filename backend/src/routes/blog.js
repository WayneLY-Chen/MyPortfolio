const express = require('express');
const router = express.Router();
const { getBlogPosts, getBlogPostBySlug, updateBlogPost, createBlogPost, deleteBlogPost } = require('../controllers/blogController');
const { authenticate, requireAdmin, optionalAuthenticate, resolveGuestSession } = require('../middlewares/authenticate');
const { reactionsLimiter } = require('../middlewares/rateLimiters');
const { isAllowedEmoji } = require('../config/reactionValidation');
const { query } = require('../db');

// GET /api/blog
router.get('/', getBlogPosts);

// POST /api/blog (管理員)
router.post('/', authenticate, requireAdmin, createBlogPost);

// PUT /api/blog/:id (管理員)
router.put('/:id', authenticate, requireAdmin, updateBlogPost);

// DELETE /api/blog/:id (管理員)
router.delete('/:id', authenticate, requireAdmin, deleteBlogPost);

// GET /api/blog/:slug
router.get('/:slug', getBlogPostBySlug);

// GET /api/blog/:postId/reactions
router.get('/:postId/reactions', optionalAuthenticate, resolveGuestSession, async (req, res) => {
  const postId = req.params.postId
  try {
    const result = await query(
      `SELECT emoji, COUNT(*) as count FROM post_reactions WHERE post_id = $1 GROUP BY emoji ORDER BY count DESC`,
      [postId]
    )
    res.json({ success: true, data: result.rows })
  } catch (err) {
    // 這裡刻意在失敗時回空陣列而非 500：表情計數是文章頁的附屬資訊，
    // 查不到不應該讓整篇文章讀不了。但錯誤要留下 log，不能靜默吞掉。
    console.error('[BlogReactions] 查詢失敗:', err.stack || err.message)
    res.json({ success: true, data: [] })
  }
})

// POST /api/blog/:postId/reactions
//
// 身分改由已驗簽的憑證決定，不再採信 request body 的 session_id。原本的
// 寫法有兩個問題：
//   1. session_id 完全由請求端自報，送別人的值就能刪掉別人的反應，送無限
//      個假值就能把計數灌到任意數字。
//   2. `const sid = session_id || 'anon'` 讓所有沒帶值的訪客共用同一個身分
//      —— 甲按讚之後乙按同一個表情會把甲的刪掉。這不需要攻擊，正常使用就
//      會互相干擾。
router.post('/:postId/reactions', optionalAuthenticate, resolveGuestSession, reactionsLimiter, async (req, res) => {
  const { emoji } = req.body
  const postId = req.params.postId

  if (!isAllowedEmoji(emoji)) {
    return res.status(400).json({ success: false, error: '不支援的表情' })
  }

  // 以 user_id 優先、guest session 為輔，兩者都沒有就拒絕寫入。
  const column = req.userId ? 'user_id' : (req.guestSessionId ? 'session_id' : null)
  const value = req.userId || req.guestSessionId
  if (!column) {
    return res.status(401).json({ success: false, error: '需要有效的身分憑證' })
  }

  try {
    const existing = await query(
      `SELECT id FROM post_reactions WHERE post_id = $1 AND emoji = $2 AND ${column} = $3`,
      [postId, emoji, value]
    )
    if (existing.rows.length > 0) {
      await query('DELETE FROM post_reactions WHERE id = $1', [existing.rows[0].id])
      return res.json({ success: true, action: 'removed' })
    }
    await query(
      `INSERT INTO post_reactions (post_id, user_id, session_id, emoji) VALUES ($1, $2, $3, $4)`,
      [postId, req.userId || null, req.guestSessionId || null, emoji]
    )
    return res.json({ success: true, action: 'added' })
  } catch (err) {
    console.error('[BlogReactions] 寫入失敗:', err.stack || err.message)
    return res.status(500).json({ success: false, error: '操作失敗' })
  }
})

module.exports = router;
