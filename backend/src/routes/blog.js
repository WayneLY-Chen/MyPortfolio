const express = require('express');
const router = express.Router();
const { getBlogPosts, getBlogPostBySlug, updateBlogPost, createBlogPost, deleteBlogPost } = require('../controllers/blogController');
const { authenticate, requireAdmin } = require('../middlewares/authenticate');

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
router.get('/:postId/reactions', async (req, res) => {
  const { query } = require('../db')
  try {
    const result = await query(
      `SELECT emoji, COUNT(*) as count FROM post_reactions WHERE post_id = $1 GROUP BY emoji ORDER BY count DESC`,
      [req.params.postId]
    )
    res.json({ success: true, data: result.rows })
  } catch (err) {
    res.json({ success: true, data: [] })
  }
})

// POST /api/blog/:postId/reactions
router.post('/:postId/reactions', async (req, res) => {
  const { query } = require('../db')
  const { emoji, session_id } = req.body
  if (!emoji) return res.status(400).json({ success: false, error: '缺少 emoji' })
  const postId = req.params.postId
  const sid = session_id || 'anon'
  try {
    const existing = await query(
      `SELECT id FROM post_reactions WHERE post_id = $1 AND emoji = $2 AND session_id = $3`,
      [postId, emoji, sid]
    )
    if (existing.rows.length > 0) {
      await query('DELETE FROM post_reactions WHERE id = $1', [existing.rows[0].id])
    } else {
      await query(
        `INSERT INTO post_reactions (post_id, session_id, emoji) VALUES ($1, $2, $3)`,
        [postId, sid, emoji]
      )
    }
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

module.exports = router;
