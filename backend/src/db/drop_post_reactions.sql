-- 移除從未被接上的 post_reactions 資料表
--
-- 這張表配合 routes/blog.js 的 GET/POST /api/blog/:postId/reactions 而建，
-- 是「部落格文章專屬表情反應」的第一版設計。在版控可見的歷史裡，前端從第一個
-- commit 起就已經改用通用的 reactions 資料表（target_type + target_id，同時
-- 服務 blog / project / comment），這張表從來沒有被寫入過。
--
-- 兩個端點已在此次修補中從 routes/blog.js 移除。這張表沒有一併放進
-- db/index.js 的自動 migration 刪除，理由：
--   1. DROP TABLE 不可逆。自動 migration 每次部署都會執行，把不可逆操作放進
--      那裡，等於讓任何一次回滾部署都可能砍掉不該砍的東西。
--   2. 若這張表在壓平之前的歷史中曾經被寫入過（git 已查不到），資料只在
--      Neon 上。刪除前應由人親眼確認。
--
-- 執行前先確認它確實是空的：
--
--   SELECT COUNT(*) FROM post_reactions;
--
-- 確認為 0 之後再執行：
--
--   psql "$DATABASE_URL" -f backend/src/db/drop_post_reactions.sql

DROP INDEX IF EXISTS idx_reactions_post;
DROP TABLE IF EXISTS post_reactions;
