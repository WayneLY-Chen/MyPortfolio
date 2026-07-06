-- 修正 comments 資料表：增加 author_name 並允許匿名留言
DO $$ 
BEGIN
    -- 1. 如果 author_name 不存在，則新增
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comments' AND column_name='author_name') THEN
        ALTER TABLE comments ADD COLUMN author_name VARCHAR(50);
        UPDATE comments SET author_name = '訪客' WHERE author_name IS NULL;
    END IF;

    -- 2. 讓 user_id 可以為 NULL（原先可能是 NOT NULL，導致匿名留言失敗）
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comments' AND column_name='user_id') THEN
        ALTER TABLE comments ALTER COLUMN user_id DROP NOT NULL;
    END IF;
END $$;

-- 確保索引
CREATE INDEX IF NOT EXISTS idx_comments_target_author ON comments(target_type, target_id, created_at DESC);
