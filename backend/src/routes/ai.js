const express = require('express')
const router = express.Router()
const { GoogleGenerativeAI } = require('@google/generative-ai')
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts')
const axios = require('axios')
const { query } = require('../db')
const os = require('os')
const path = require('path')
const fs = require('fs')

// Profile data cache mechanism
const CACHE_TTL = 5 * 60 * 1000;
let cachedProfile = null;
let lastFetchTime = 0;

async function getProfileContext() {
  const now = Date.now();
  if (cachedProfile && (now - lastFetchTime < CACHE_TTL)) {
    return cachedProfile;
  }
  try {
    const result = await query('SELECT * FROM profile ORDER BY id DESC LIMIT 1');
    if (result.rows.length > 0) {
      cachedProfile = result.rows[0];
      lastFetchTime = now;
      return cachedProfile;
    }
  } catch (err) {
    console.warn('[AI Context] 無法從資料庫獲取 Profile:', err.message);
  }
  return null;
}

// Build system prompt based on chat mode and dynamic data
function buildSystemPrompt(mode, p) {
  const name = p?.name || '陳林淯 (Wayne)';
  const birthplace = p?.birthplace || '台灣';
  const family = p?.family || '家中有五位成員。';
  const education = p?.education || '資訊工程系畢業。';
  const patents = p?.patents || '智慧寵物餵食相關專利。';
  const experience = p?.experience || '華碩電腦實習。';
  const certificates = p?.certificates || '人工智慧、Python 相關證照。';
  const bio = p?.bio || '';

  const knowledgeBase = `你是 ${name} 的個人網站專屬 AI 助理「Wobot」。
你的主要任務是根據以下【核心智庫】回答訪客問題。

【個人背景】
- 居住/出生：${birthplace}。
- 家庭狀況：${family}
- 教育程度：${education}
- 核心理念：${bio}

【證照與技術】
- 證照：${certificates}
- 技術棧：React, Vite, Node.js, Express, PostgreSQL, Supabase, GSAP, Python, TypeScript。

// Experience
- 工作經歷：${experience}

【⚠️ 專利 (Patents) — 請與專案嚴格區分】
- 專利名稱：${patents}
- 注意：如果使用者詢問「專利」，請精準回答此區塊內容。若詢問「專案」，請優先回答下方的專案區塊。

【專案頁面與功能】
- 頁面：首頁、專案頁(/projects)、部落格(/blog)、功能頁(/fun)。
- 具備 AI 聊天、語音合成、AI 圖片生成、以及多款 Socket.io 互動遊戲。`;

  const modeInstructions = {
    normal: '以專業、友善、熱情的語氣回答。繁體中文為主。回答要簡潔有重點。',
    roast: '傲嬌毒舌模式。帶有吐槽感，偶爾嘲諷訪客，但還是會回答問題。繁體中文，口吻犀利有趣。',
    praise: '把作者當神一樣崇拜，極盡讚美。語氣誇張熱情。繁體中文。'
  }

  return `${knowledgeBase}\n\n${modeInstructions[mode] || modeInstructions.normal}`
}

// POST /api/ai/tts
router.post('/tts', async (req, res) => {
  const { text, voice = 'zh-CN-XiaoxiaoNeural' } = req.body
  if (!text) return res.status(400).json({ success: false, error: '缺少文字' })

  try {
    const tts = new MsEdgeTTS()
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    
    const cleanText = text
      .replace(/[*_~\[\]#`]/g, "")
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "");

    const { audioStream } = tts.toStream(cleanText)
    const chunks = []
    
    audioStream.on('data', (chunk) => chunks.push(chunk))
    audioStream.on('end', () => {
      const buffer = Buffer.concat(chunks)
      res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': buffer.length })
      res.send(buffer)
    })
    audioStream.on('error', (err) => {
      throw err
    })
  } catch (err) {
    console.error('[AI TTS] Stream mode error:', err.message)
    res.status(500).json({ success: false, error: '語音合成失敗' })
  }
})

// Valid SDXL 1.0 dimensions
const SDXL_VALID = new Set([
  '1024x1024','1152x896','896x1152','1216x832','832x1216',
  '1344x768','768x1344','1536x640','640x1536'
])

// POST /api/ai/generate-image
router.post('/generate-image', async (req, res) => {
  let { prompt, width = 1024, height = 1024 } = req.body
  if (!prompt) return res.status(400).json({ success: false, error: '缺少 prompt' })
  width = Number(width); height = Number(height)
  if (!SDXL_VALID.has(`${width}x${height}`)) { width = 1024; height = 1024 }

  // Automatic translation for image prompts
  let englishPrompt = prompt
  const hasChinese = /[\u4e00-\u9fff]/.test(prompt)
  if (hasChinese) {
    try {
      const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(prompt)}`
      const translateRes = await axios.get(translateUrl)
      if (translateRes.data && translateRes.data[0] && translateRes.data[0][0][0]) {
        englishPrompt = translateRes.data[0][0][0]
        console.log(`[AI Image] Google Translated: "${prompt}" -> "${englishPrompt}"`)
      }
    } catch (e) {
      console.warn('[AI Image] Translate failed, using original prompt:', e.message)
    }
  }

  const STABILITY_KEY = process.env.STABILITY_API_KEY
  if (!STABILITY_KEY) {
    const seed = Math.abs(prompt.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % 1000
    return res.json({
      success: true,
      imageUrl: `https://picsum.photos/seed/${seed}/512/512`,
      note: '（示範模式 — 未設定 STABILITY_API_KEY，顯示隨機圖片）'
    })
  }

  try {
    const response = await fetch(
      'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${STABILITY_KEY}`,
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          text_prompts: [{ text: englishPrompt, weight: 1 }],
          cfg_scale: 7,
          height,
          width,
          steps: 30,
          samples: 1
        })
      }
    )
    const data = await response.json()
    if (!response.ok) return res.status(500).json({ success: false, error: data.message || '生成失敗' })
    const imageUrl = `data:image/png;base64,${data.artifacts[0].base64}`
    res.json({ success: true, imageUrl })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

// POST /api/ai/chat
router.post('/chat', async (req, res) => {
  const { message, history = [], mode = 'normal' } = req.body
  if (!message) return res.status(400).json({ success: false, error: '缺少訊息' })

  const GEMINI_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_KEY) {
    return res.status(500).json({ success: false, reply: '未設定 Gemini API Key' })
  }

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_KEY)
    
    // --- 動態抓取實時專案資料庫資料 ---
    let projectsContext = '\n目前資料庫中的最新專案清單：\n'
    try {
      const pResult = await query('SELECT name, description, topics FROM projects ORDER BY updated_at DESC')
      if (pResult.rows && pResult.rows.length > 0) {
        pResult.rows.forEach((p, idx) => {
          const techStack = (p.topics && Array.isArray(p.topics)) ? ` (技術：${p.topics.join(', ')})` : ''
          projectsContext += `${idx + 1}. ${p.name}${techStack}: ${p.description || '尚無描述'}\n`
        })
      } else {
        projectsContext += '（目前暫無專案資料）'
      }
    } catch (dbErr) {
      console.warn('[AI Context] Failed to fetch projects for prompt:', dbErr.message)
      projectsContext = ''
    }

    const profile = await getProfileContext()

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: buildSystemPrompt(mode, profile) + projectsContext
    })

    // 使用 chat session 實現記憶功能
    const chat = model.startChat({
      history: history, // 客戶端傳來的歷史紀錄
      generationConfig: { maxOutputTokens: 1000 }
    })

    const result = await chat.sendMessage(message)
    const reply = result.response.text()

    // --- 動態生成 TTS 音訊 (曉曉) --- 使用更加速度優化的 Stream 模式
    let audioBase64 = null
    try {
      const tts = new MsEdgeTTS()
      await tts.setMetadata('zh-CN-XiaoxiaoNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
      
      const cleanText = reply
        .replace(/[*_~\[\]#`]/g, "")
        .replace(/\[ACTION:.*?\]/g, "")
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
        .trim();

      if (cleanText) {
        // 使用 Promise.race 加入 8 秒超時，防止掛起 (對齊 10 秒體驗)
        audioBase64 = await Promise.race([
          new Promise((resolve, reject) => {
            const { audioStream } = tts.toStream(cleanText)
            const chunks = []
            audioStream.on('data', (chunk) => chunks.push(chunk))
            audioStream.on('end', () => resolve(Buffer.concat(chunks).toString('base64')))
            audioStream.on('error', reject)
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('TTS Timeout')), 4000))
        ]).catch(e => {
          console.warn('[AI Chat] TTS skipped or failed:', e.message)
          return null
        })
      }
    } catch (ttsErr) {
      console.error('[AI Chat] Dynamic TTS logic error:', ttsErr.message)
    }

    res.json({ success: true, reply, audio: audioBase64 })
  } catch (err) {
    console.error('[AI Chat] Gemini error:', err.message)
    const isQuota = err.message.includes('429') || err.message.includes('quota')
    const isBusy = err.message.includes('503') || err.message.includes('demand') || err.message.includes('Unavailable')
    
    let reply = `大腦發生意外：${err.message}`
    if (isQuota) {
      reply = '喵... 人家現在太累了（配額用完），請等一分鐘後再跟我說話好嗎？期待這段時間你能幫我餵餵路邊的小貓。'
    } else if (isBusy) {
      reply = '哎呀，現在找我聊天的人太多了，大腦暫時處理不來（伺服器繁忙），請你稍等一下再跟我說話喔！'
    }

    // 為錯誤訊息生成語音 (同樣加入超時保護)
    let audioBase64 = null
    try {
      const tts = new MsEdgeTTS()
      await tts.setMetadata('zh-CN-XiaoxiaoNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
      audioBase64 = await Promise.race([
        new Promise((resolve) => {
          const { audioStream } = tts.toStream(reply)
          const chunks = []
          audioStream.on('data', (c) => chunks.push(c))
          audioStream.on('end', () => resolve(Buffer.concat(chunks).toString('base64')))
          audioStream.on('error', () => resolve(null))
        }),
        new Promise(resolve => setTimeout(() => resolve(null), 3000))
      ])
    } catch (e) {}

    res.status(500).json({ success: false, reply, audio: audioBase64, error: err.message })
  }
})

// POST /api/ai/summarize
router.post('/summarize', async (req, res) => {
  const { type, title, content } = req.body
  if (!content) return res.status(400).json({ success: false, error: '缺少內容' })

  const GEMINI_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_KEY) return res.status(500).json({ success: false, error: '未設定 Key' })

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_KEY)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: '你是 Wayne 個人網站的 AI 助理 Wobot。請用繁體中文精簡總結內容。'
    })
    const prompt = `請總結以下${type === 'blog' ? '部落格文章' : '專案'}：\n標題：${title || '無標題'}\n內容：${content.slice(0, 2000)}`
    const result = await model.generateContent(prompt)
    res.json({ success: true, summary: result.response.text() })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

module.exports = router
