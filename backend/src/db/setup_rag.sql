-- ============================================================
-- RAG 向量搜尋設定 — 在 Supabase SQL Editor 執行此檔案
-- ============================================================

-- 啟用 pgvector 擴充功能
CREATE EXTENSION IF NOT EXISTS vector;

-- 建立 site_knowledge 表
CREATE TABLE IF NOT EXISTS site_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  embedding vector(768),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 建立向量索引 (IVFFlat，適合中小型資料集)
CREATE INDEX IF NOT EXISTS site_knowledge_embedding_idx
  ON site_knowledge
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 10);
