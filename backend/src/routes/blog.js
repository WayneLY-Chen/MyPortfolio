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

// GET/POST /api/blog/:postId/reactions 已於此處移除，連同 post_reactions 資料表。
//
// 兩個端點是「部落格文章專屬表情反應」的第一版設計，配一張只含 post_id 的
// post_reactions 資料表。它們在版控可見的歷史裡從來沒有被任何前端程式碼呼叫過
// —— BlogPostPage.jsx 從第一個 commit 起就已經改用通用的 <Reactions
// targetType targetId>，走的是 controllers/reactionsController.js 與 reactions
// 資料表（target_type + target_id，同時服務 blog / project / comment）。
//
// 沒有呼叫端的可寫入端點，最安全的狀態是不存在：加固只能縮小攻擊面，移除才
// 是消除。資料表本身不在自動 migration 裡刪除（DROP TABLE 不可逆，且會在每次
// 部署時執行），改以 db/drop_post_reactions.sql 提供手動執行的腳本。

module.exports = router;
