-- 作品集網站資料庫 Schema

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  github_id INTEGER UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  technologies TEXT,
  url VARCHAR(500),
  homepage VARCHAR(500),
  language VARCHAR(100),
  stars INTEGER DEFAULT 0,
  forks INTEGER DEFAULT 0,
  topics TEXT[],
  language_stats JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profile (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  title VARCHAR(200),
  bio TEXT,
  github VARCHAR(200),
  instagram VARCHAR(200),
  email VARCHAR(200),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- =====================================================
-- 認證系統
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255)  UNIQUE,
  password_hash VARCHAR(255),
  display_name  VARCHAR(100)  NOT NULL,
  avatar_url    TEXT,
  role          VARCHAR(20)   NOT NULL DEFAULT 'visitor', -- 'admin' | 'visitor'
  is_verified   BOOLEAN       NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        VARCHAR(20)   NOT NULL,
  provider_id     VARCHAR(255)  NOT NULL,
  provider_email  VARCHAR(255),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_id)
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255)  NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ   NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- =====================================================
-- 留言系統
-- =====================================================
CREATE TABLE IF NOT EXISTS comments (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(20)   NOT NULL, -- 'project' | 'blog'
  target_id   VARCHAR(255)  NOT NULL, -- project name 或 blog post id
  content     TEXT          NOT NULL,
  is_deleted  BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);

-- =====================================================
-- 部落格
-- =====================================================
CREATE TABLE IF NOT EXISTS blog_posts (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  title       VARCHAR(255)  NOT NULL,
  slug        VARCHAR(255)  UNIQUE NOT NULL,
  content     TEXT,
  summary     TEXT,
  cover_image TEXT,
  published   BOOLEAN       NOT NULL DEFAULT FALSE,
  author_id   UUID          REFERENCES users(id),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug);

-- 表情符號反應
CREATE TABLE IF NOT EXISTS post_reactions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID        NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  user_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  session_id VARCHAR(64),
  emoji      VARCHAR(10) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reactions_post ON post_reactions(post_id);

-- 遊戲排行榜
CREATE TABLE IF NOT EXISTS leaderboard (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type   VARCHAR(20) NOT NULL DEFAULT 'snake',
  player_name VARCHAR(20) NOT NULL,
  score       INTEGER     NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leaderboard_game ON leaderboard(game_type, score DESC);

-- =====================================================
-- 留言系統
-- =====================================================
CREATE TABLE IF NOT EXISTS comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('blog', 'project')),
  target_id   TEXT NOT NULL,
  author_name VARCHAR(50) NOT NULL DEFAULT '訪客',
  content     TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id, created_at DESC);

-- =====================================================
-- 向量搜尋 (RAG)
-- =====================================================
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS site_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  embedding vector(768),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 尾刀爭奪戰 (Boss Raid) — 共享 Boss 狀態
-- =====================================================
CREATE TABLE IF NOT EXISTS boss_state (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  hp         INTEGER NOT NULL DEFAULT 1000,
  max_hp     INTEGER NOT NULL DEFAULT 1000,
  killed_by  VARCHAR(50),
  is_alive   BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO boss_state (id, hp, max_hp) VALUES (1, 1000, 1000) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS boss_kill_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name VARCHAR(50) NOT NULL,
  damage     INTEGER NOT NULL,
  is_kill    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 陣營大戰 (Faction War) — 戰績紀錄
-- =====================================================
CREATE TABLE IF NOT EXISTS faction_results (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blue_player  VARCHAR(50) NOT NULL DEFAULT '藍隊',
  orange_player VARCHAR(50) NOT NULL DEFAULT '橘隊',
  winner       VARCHAR(10) NOT NULL CHECK (winner IN ('blue', 'orange', 'draw')),
  blue_score   INTEGER NOT NULL DEFAULT 0,
  orange_score INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
