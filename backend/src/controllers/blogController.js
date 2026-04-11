const { query } = require('../db');

/**
 * GET /api/blog
 * 回傳所有已發布的部落格文章，無文章時回傳空陣列
 */
const getBlogPosts = async (req, res, next) => {
  try {
    const result = await query(`
      SELECT id, title, slug, summary, content, cover_image, published, created_at, updated_at
      FROM blog_posts
      WHERE published = true
      ORDER BY created_at DESC
    `);

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/blog/:slug
 * 回傳單篇部落格文章（含完整內容）
 */
const getBlogPostBySlug = async (req, res, next) => {
  const { slug } = req.params;

  try {
    const result = await query(
      `
      SELECT id, title, slug, content, summary, published, created_at, updated_at
      FROM blog_posts
      WHERE slug = $1 AND published = true
      LIMIT 1
    `,
      [slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '找不到指定的文章',
      });
    }

    return res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
};

const updateBlogPost = async (req, res, next) => {
  const { id } = req.params;
  const { content, summary, title, cover_image } = req.body;
  
  // Just update the fields provided in the body (dynamic update for provided fields)
  let updateFields = [];
  let values = [];
  let idx = 1;
  
  if (content !== undefined) { updateFields.push(`content = $${idx++}`); values.push(content); }
  if (summary !== undefined) { updateFields.push(`summary = $${idx++}`); values.push(summary); }
  if (title !== undefined)   { updateFields.push(`title = $${idx++}`); values.push(title); }
  if (cover_image !== undefined) { updateFields.push(`cover_image = $${idx++}`); values.push(cover_image); }
  
  if (updateFields.length === 0) return res.json({ success: true, message: 'No fields to update' });
  
  updateFields.push(`updated_at = NOW()`);
  values.push(id);
  
  try {
    const result = await query(
      `UPDATE blog_posts SET ${updateFields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '文章不存在' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

const deleteBlogPost = async (req, res, next) => {
  const { id } = req.params;
  try {
    const result = await query('DELETE FROM blog_posts WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '文章不存在' });
    }
    return res.json({ success: true, message: '文章已刪除' });
  } catch (err) {
    next(err);
  }
};

const createBlogPost = async (req, res, next) => {
  const { title, slug, summary, content, cover_image, published = true } = req.body;
  if (!title || !slug || !content) {
    return res.status(400).json({ success: false, message: '標題、路徑與內容為必填' });
  }

  try {
    const result = await query(
      `INSERT INTO blog_posts (title, slug, summary, content, cover_image, published, author_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [title, slug, summary || '', content, cover_image || '', published, req.userId]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') { // Unique constraint violation (slug)
      return res.status(409).json({ success: false, message: 'Slug 已被使用，請更換' });
    }
    next(err);
  }
};

module.exports = { getBlogPosts, getBlogPostBySlug, updateBlogPost, createBlogPost, deleteBlogPost };
