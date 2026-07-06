/**
 * seed_knowledge.js
 * 將 Wayne 的網站資訊向量化並寫入 site_knowledge 表
 * 執行: node src/db/seed_knowledge.js
 */
require('dotenv').config()
const { GoogleGenerativeAI } = require('@google/generative-ai')
const { query } = require('../db')

const GEMINI_KEY = process.env.GEMINI_API_KEY
if (!GEMINI_KEY) {
  console.error('[seed_knowledge] 缺少 GEMINI_API_KEY')
  process.exit(1)
}

const genAI = new GoogleGenerativeAI(GEMINI_KEY)
const embedModel = genAI.getGenerativeModel({ model: 'models/gemini-embedding-001' })

const KNOWLEDGE = [
  {
    content: 'Wayne（陳林淯）是一位全端工程師，畢業於中國科技大學資訊工程系。擅長 React、Node.js、TypeScript、Python、GSAP、PostgreSQL、Figma。',
    metadata: { topic: 'profile' }
  },
  {
    content: 'Wayne 的聯絡方式：Email: qweasd226410@gmail.com，GitHub: github.com/WayneLY-Chen',
    metadata: { topic: 'contact' }
  },
  {
    content: 'Wayne 與團隊共同研發「寵物餵食器之餘糧清除裝置」並獲得發明專利，並以此參加 2023 年中國科大校園創新創業提案競賽。',
    metadata: { topic: 'patent' }
  },
  {
    content: '這個個人網站技術棧：前端 React + Vite + GSAP + ScrollTrigger，後端 Node.js + Express，資料庫 PostgreSQL（部署於 Neon），AI 整合 Gemini API。',
    metadata: { topic: 'tech_stack' }
  },
  {
    content: '網站頁面包含：首頁（Hero 滾動動畫、About、專案、部落格）、專案頁（/projects）、部落格頁（/blog）、功能頁（/fun，含貪吃蛇、2048、暴君突擊、AI 圖片生成）。',
    metadata: { topic: 'pages' }
  },
  {
    content: 'Wayne 的工作經歷：源智匯股份有限公司 AI 工程師（2026/04 至今，現職），負責中央部會級評測系統 AI 整合、國立大學 LINE Bot 智能問答系統（Langflow + Elasticsearch）、上市工業大廠公文生成系統（RAG）。此前：華碩電腦系統品質軟體工程師實習生（2024/06 - 2025/06），摩斯漢堡訓練員（2018/08 - 2023/06）。',
    metadata: { topic: 'experience' }
  },
  {
    content: 'Wayne 的技能包含：React、Next.js、Vue、GSAP、Node.js、TypeScript、JavaScript、HTML5、CSS、Python、Gemini、Claude Code、Langflow、n8n、Supabase、PostgreSQL、MySQL、Docker、RabbitMQ、Celery、Bootstrap、VS Code、UI/UX Design、Figma、Git。',
    metadata: { topic: 'skills' }
  },
  {
    content: 'AI 助理 Wobot 有三種模式：正常模式（專業友善）、傲嬌模式（毒舌吐槽）、崇拜模式（極度誇讚 Wayne）。支援 Edge TTS 語音朗讀。',
    metadata: { topic: 'ai_assistant' }
  },
]

async function embedAndInsert(item) {
  const result = await embedModel.embedContent({
    content: { parts: [{ text: item.content }] },
    taskType: 'RETRIEVAL_DOCUMENT',
    outputDimensionality: 768
  })
  const embedding = result.embedding.values
  await query(
    `INSERT INTO site_knowledge (content, embedding, metadata) VALUES ($1, $2::vector, $3)`,
    [item.content, `[${embedding.join(',')}]`, JSON.stringify(item.metadata)]
  )
  console.log(`[OK] ${item.content.slice(0, 50)}...`)
}

async function main() {
  console.log('[seed_knowledge] 開始向量化並寫入...')
  // 清空舊資料
  await query('DELETE FROM site_knowledge')
  for (const item of KNOWLEDGE) {
    await embedAndInsert(item)
  }
  console.log(`[seed_knowledge] 完成，共寫入 ${KNOWLEDGE.length} 筆`)
  process.exit(0)
}

main().catch(e => { console.error(e.message); process.exit(1) })
