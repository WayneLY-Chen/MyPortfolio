-- 通用反應系統 (Reactions Table)
CREATE TABLE IF NOT EXISTS reactions (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type  VARCHAR(20)   NOT NULL, -- 'comment', 'project', 'blog'
    target_id    VARCHAR(255)  NOT NULL, -- UUID 或 slug
    user_id      UUID          REFERENCES users(id) ON DELETE CASCADE,
    session_id   VARCHAR(100), -- 訪客識別碼 (如果沒有登入)
    emoji        VARCHAR(20)   NOT NULL,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    -- 核心約束：每人(UID 或 SID) 對每個目標的每種表情只能按一次
    UNIQUE (user_id, target_type, target_id, emoji),
    UNIQUE (session_id, target_type, target_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reactions_target ON reactions(target_type, target_id);
