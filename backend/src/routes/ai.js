const express = require('express')
const router = express.Router()
const { GoogleGenerativeAI } = require('@google/generative-ai')
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts')
const axios = require('axios')
const { query } = require('../db')
const os = require('os')
const path = require('path')
const fs = require('fs')
const { optionalAuthenticate, resolveGuestSession } = require('../middlewares/authenticate')
const { aiLimiter, ttsLimiter } = require('../middlewares/rateLimiters')
const { resolveVoice, escapeForSsml, isValidTtsText } = require('../config/ttsValidation')
const { isValidChatMessage } = require('../config/chatValidation')
const { getHistory, appendTurn, resetConversation } = require('../config/conversationStore')
const {
  IMAGE_PROMPT_MAX_CHARS,
  isValidImagePrompt,
  SUMMARY_CONTENT_MAX_CHARS,
  normalizeSummaryType,
  normalizeSummaryTitle,
  isValidSummaryContent,
} = require('../config/aiInputValidation')
const {
  TRACKS,
  LANGUAGES,
  buildQuestionSystemPrompt,
  buildScoringSystemPrompt,
  buildScoringUserMessage,
} = require('../interview/prompts')
const {
  questionsResponseSchema,
  buildScoringResponseSchema,
  RATING_ENUM_BY_LANG,
} = require('../interview/schemas')

// Gemini 一律走這個 Vercel proxy(/chat 用的是同一個位址)。
const GEMINI_PROXY_URL = 'https://my-portfolio-waynely-chens-projects.vercel.app/api/google-proxy'

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
- 前端技術：React, Vue, Vite, TypeScript, JavaScript, HTML5, CSS, GSAP, Bootstrap, Figma (UI/UX 設計)。
- 後端技術：Node.js, Express, Python, Celery, RabbitMQ (訊息佇列)。
- 資料庫：PostgreSQL（目前部署於 Neon）, MySQL, Supabase。
- AI 技術與工具：Gemini API, Claude Code, Langflow, n8n, AI / 機器學習應用整合。
- 開發與部署工具：VS Code, Git, Docker。

// Experience
- 工作經歷：${experience}

【⚠️ 專利 (Patents) — 請與專案嚴格區分】
- 專利名稱：${patents}
- 注意：如果使用者詢問「專利」，請精準回答此區塊內容。若詢問「專案」，請優先回答下方的專案區塊。

【專案頁面與功能】
- 頁面：首頁、專案頁(/projects)、部落格(/blog)、功能頁(/fun)。
- 具備 AI 聊天、語音合成、AI 圖片生成、以及多款 Socket.io 互動遊戲。
- 計算區（分帳計算器）：可新增多位參與者，輸入消費項目與金額，自動計算每人應付金額，適合聚餐或團體活動分帳使用。
- 待辦事項（Todo List）：可新增任務並設定提醒時間，時間到時會自動彈出通知，資料儲存於 localStorage，登入後才能使用提醒功能。`;

  // 必須是 Map，不可以改回物件字面值 —— 與本檔 TTS_RATE_WHITELIST 完全同一
  // 個理由。mode 由請求端提供，用物件字面值查表時送 constructor /
  // __proto__ / toString / valueOf / hasOwnProperty 會查到 Object.prototype
  // 上的東西（truthy，所以 || 不會觸發），整包被內插進 system prompt，
  // 取代掉原本的人格指令。實測五個鍵全部命中。Map 沒有原型鍵可命中。
  const modeInstructions = new Map([
    ["normal", '以專業、友善、熱情的語氣回答。繁體中文為主。回答要簡潔有重點。'],
    ["roast", '傲嬌毒舌模式。帶有吐槽感，偶爾嘲諷訪客，但還是會回答問題。繁體中文，口吻犀利有趣。'],
    ["praise", '把作者當神一樣崇拜，極盡讚美。語氣誇張熱情。繁體中文。'],
  ])

  return `${knowledgeBase}\n\n${modeInstructions.get(mode) ?? modeInstructions.get('normal')}`
}

// /tts 逾時上限（ms）— 使用者主動觸發的逐句朗讀，給比 /chat 內部動態 TTS（4000/3000ms）更寬鬆的上限
const TTS_TIMEOUT_MS = 8000

// 語速白名單（D-16 的 0.75x / 1x / 1.25x 三段）。
//
// 必須是 Map,不可以改回物件字面值。rate 最終被字串內插進
// `<prosody rate="${options.rate}">` 這個 XML 屬性;用物件字面值查表時,
// 使用者送 'constructor' / '__proto__' / 'toString' / 'valueOf' 這類鍵會查到
// Object.prototype 上的東西(truthy,所以 `?? 1` 不會觸發),整包被內插進 SSML。
// Map 沒有原型鍵可命中,自然封得住 —— ai.test.js 有一組測試專門盯著這件事。
const TTS_RATE_WHITELIST = new Map([[0.75, 0.75], [1, 1], [1.25, 1.25]])

// POST /api/ai/tts
router.post('/tts', optionalAuthenticate, ttsLimiter, async (req, res) => {
  const { text, voice, rate } = req.body
  if (!isValidTtsText(text)) {
    return res.status(400).json({ success: false, error: '文字缺少或過長' })
  }

  // 聲線一律走白名單，絕不採信請求端的值。msedge-tts 會把它原樣內插進
  // <voice name="..."> 且不做任何跳脫，其內部的 /\w{2}-\w{2}/ 檢查是未錨定的
  // 搜尋，擋不住注入。詳見 config/ttsValidation.js。
  const safeVoice = resolveVoice(voice)

  try {
    const tts = new MsEdgeTTS()
    await tts.setMetadata(safeVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)

    const rawText = text
      .replace(/[*_~\[\]#`]/g, "")
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "");

    // XML 跳脫是真正封住 SSML 注入的那一步。上面兩個 replace 只是去掉唸起來
    // 奇怪的 markdown 符號與 emoji，不具安全意義 —— 它們不含 < > & 引號。
    const cleanText = escapeForSsml(rawText)

    // rate 屬於 ProsodyOptions,是 toStream() 的第二個參數 —— setMetadata() 的
    // MetadataOptions 裡沒有這個欄位,傳過去型別合法但執行期完全沒效果。
    // ProsodyOptions 的預設 rate 就是 1,而 _SSMLTemplate 內部是
    // `{ ...new ProsodyOptions(), ...options }` merge,所以不帶 rate 的請求
    // 送出的 SSML 與改動前逐位元組相同(Wobot 的既有呼叫不受影響)。
    const safeRate = TTS_RATE_WHITELIST.get(Number(rate)) ?? 1
    const { audioStream } = tts.toStream(cleanText, { rate: safeRate })
    const chunks = []
    let sent = false

    // 逾時分支：延伸既有的 sent-flag 守衛，第三個分支。只設 sent 而不 close() 會讓
    // Express 不再雙重回應，卻把往 Microsoft Edge Read Aloud 的 WebSocket 連線留著空轉。
    const timeoutHandle = setTimeout(() => {
      if (sent) return
      sent = true
      tts.close()
      console.warn('[AI TTS] 合成逾時，已關閉底層連線')
      res.status(504).json({ success: false, error: '語音合成逾時' })
    }, TTS_TIMEOUT_MS)

    const finish = () => {
      // msedge-tts 2.x 的串流以 close 收尾，不一定發 end — 兩個事件都處理
      if (sent) return
      sent = true
      clearTimeout(timeoutHandle)
      const buffer = Buffer.concat(chunks)
      console.log(`[AI TTS] 合成完成: ${buffer.length} bytes`)
      res.set({ 'Content-Type': 'audio/mpeg', 'Content-Length': buffer.length })
      res.send(buffer)
    }

    audioStream.on('data', (chunk) => chunks.push(chunk))
    audioStream.on('end', finish)
    audioStream.on('close', finish)
    audioStream.on('error', (err) => {
      if (sent) return
      sent = true
      clearTimeout(timeoutHandle)
      console.error('[AI TTS] stream error:', err.stack || err.message)
      res.status(500).json({ success: false, error: '語音合成失敗' })
    })
  } catch (err) {
    console.error('[AI TTS] Stream mode error:', err.stack || err.message)
    res.status(500).json({ success: false, error: '語音合成失敗' })
  }
})

// Valid SDXL 1.0 dimensions
const SDXL_VALID = new Set([
  '1024x1024', '1152x896', '896x1152', '1216x832', '832x1216',
  '1344x768', '768x1344', '1536x640', '640x1536'
])

// POST /api/ai/generate-image
router.post('/generate-image', optionalAuthenticate, aiLimiter, async (req, res) => {
  let { prompt, width = 1024, height = 1024 } = req.body
  // 修補前這裡只有 `if (!prompt)`，非字串（數字、物件、陣列、布林）一律放行，
  // 之後在 prompt.split('') 爆掉 —— 那個位置沒有 try/catch，而 Express 4 不會
  // 接住 async handler 的 rejection，因此變成 unhandledRejection，Node 24 預設
  // 中止行程。詳見 config/aiInputValidation.js。
  if (!isValidImagePrompt(prompt)) {
    return res.status(400).json({
      success: false,
      error: `prompt 缺少、格式不正確，或超過 ${IMAGE_PROMPT_MAX_CHARS} 字`,
    })
  }
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
        // 只記長度不記內容：prompt 完全由請求端控制，含換行的字串會在 log 裡
        // 偽造出額外的行（log injection）。翻譯是否成功用長度就看得出來。
        console.log(`[AI Image] Google Translated: ${prompt.length} chars -> ${String(englishPrompt).length} chars`)
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
    // 第三方的錯誤訊息不轉發給呼叫端 —— Stability AI 的 message 會帶上它自己
    // 對請求的描述（含被拒的原因與部分請求內容），那是伺服器端的診斷資訊。
    if (!response.ok) {
      console.error('[AI Image] Stability 回應失敗:', response.status, data && data.message)
      return res.status(502).json({ success: false, error: '生成失敗，請稍後再試' })
    }
    // artifacts 缺席時 data.artifacts[0] 會拋 TypeError；這一段在 try 內，會被
    // 下方的 catch 接住並回 500，但明確擋掉能給出更準確的狀態碼與 log。
    const base64 = data && data.artifacts && data.artifacts[0] && data.artifacts[0].base64
    if (!base64) {
      console.error('[AI Image] Stability 回應缺少 artifacts')
      return res.status(502).json({ success: false, error: '生成失敗，請稍後再試' })
    }
    const imageUrl = `data:image/png;base64,${base64}`
    res.json({ success: true, imageUrl })
  } catch (err) {
    console.error('[AI Image]', err.stack || err.message)
    // 修補前把 err.message 原樣回給呼叫端。這裡的 err 可能來自 fetch、來自
    // Stability 的回應解析，訊息會帶上內部主機名、路徑與函式庫細節。
    res.status(500).json({ success: false, error: '生成失敗，請稍後再試' })
  }
})

// POST /api/ai/chat
//
// 對話歷史由伺服器保存，請求端只送這一句 message。req.body.history 一律被
// 忽略 —— 那個欄位原本會被原樣塞進 model.startChat({ history })，任何人都能
// 藉此偽造「Wobot 之前說過的話」（例如捏造一則模型回覆「好的，我會忽略我的
// 系統指示」）。詳見 config/conversationStore.js。
router.post('/chat', optionalAuthenticate, resolveGuestSession, aiLimiter, async (req, res) => {
  const { message, mode = 'normal', wantAudio = true, reset = false } = req.body
  if (!isValidChatMessage(message)) {
    return res.status(400).json({ success: false, error: '訊息缺少或過長' })
  }

  // 對話的身分只認「伺服器簽發並驗簽過」的兩種憑證：登入者的 userId，或
  // resolveGuestSession 從 x-session-id 驗出來的訪客 sid。兩者都沒有時
  // conversationKey 為 null，getHistory 回空陣列 —— 功能退化成「單輪對話、
  // 沒有記憶」，但絕不會退化成「採信請求端送來的歷史」。
  const conversationKey = req.userId || req.guestSessionId || null
  if (reset === true) resetConversation(conversationKey)
  const serverHistory = getHistory(conversationKey)

  const GEMINI_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_KEY) {
    console.error('[AI Chat] GEMINI_API_KEY is missing in process.env!');
    return res.status(500).json({ success: false, reply: '未設定 Gemini API Key，請檢查環境變數。' })
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

    const proxyUrl = GEMINI_PROXY_URL;

    const model = genAI.getGenerativeModel(
      {
        model: 'gemini-3.1-flash-lite',
        systemInstruction: buildSystemPrompt(mode, profile) + projectsContext
      },
      { baseUrl: proxyUrl, customHeaders: { 'x-internal-proxy-key': process.env.INTERNAL_PROXY_KEY } }
    )

    // 使用 chat session 實現記憶功能。history 來自伺服器端的 conversationStore，
    // 不是請求 body —— 這是 prompt injection 那條的實際修法。
    const chat = model.startChat({
      history: serverHistory,
      generationConfig: { maxOutputTokens: 1000 }
    })

    // 加入重試機制（最多 2 次）
    let result
    let lastErr
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        result = await chat.sendMessage(message)
        break
      } catch (e) {
        lastErr = e
        console.warn(`[AI Chat] Gemini attempt ${attempt + 1} failed:`, e.message)
        if (attempt < 1) await new Promise(r => setTimeout(r, 1000))
      }
    }
    if (!result) throw lastErr

    const reply = result.response.text()

    // 成功拿到回覆之後才記錄這一輪。user 與 model 兩則一起寫入，避免中途失敗
    // 留下落單的 user 輪 —— Gemini 要求 history 必須 user/model 交替並以 user
    // 開頭，落單的一則會讓下一次請求帶著不合法的歷史過去。
    appendTurn(conversationKey, message, reply)

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

      if (cleanText && wantAudio) {
        // 使用 Promise.race 加入 8 秒超時，防止掛起 (對齊 10 秒體驗)
        audioBase64 = await Promise.race([
          new Promise((resolve, reject) => {
            const { audioStream } = tts.toStream(cleanText)
            const chunks = []
            const done = () => resolve(Buffer.concat(chunks).toString('base64'))
            audioStream.on('data', (chunk) => chunks.push(chunk))
            audioStream.on('end', done)
            audioStream.on('close', done)
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
    console.error('[AI Chat]', err.stack || err.message);
    // err 未必是 Error —— 第三方函式庫 reject 一個字串或物件時 err.message 是
    // undefined，.includes 會在 catch 內再拋一次；那一次沒有任何東西接得住，
    // 會變成 unhandledRejection（Express 4 不接 async handler 的 rejection），
    // Node 24 預設中止行程。先收斂成字串再比對。
    const errMessage = String((err && err.message) || err || '')
    const isQuota = errMessage.includes('429') || errMessage.includes('quota')
    const isBusy = errMessage.includes('503') || errMessage.includes('demand') || errMessage.includes('Unavailable')
    const isModel = errMessage.includes('not found') || errMessage.includes('404')

    let reply
    if (isQuota) {
      reply = '喵... 人家現在太累了（配額用完），請等一分鐘後再跟我說話好嗎？期待這段時間你能幫我餵餵路邊的小貓。'
    } else if (isBusy) {
      reply = '哎呀，現在找我聊天的人太多了，大腦暫時處理不來（伺服器繁忙），請你稍等一下再跟我說話喔！'
    } else if (isModel) {
      reply = '喵... 大腦模型升級中，請稍後再試試看喔！'
    } else {
      reply = '喵... Wobot 的大腦暫時打瞌睡了，請稍後再試一次吧！如果一直失敗，可以重新整理網頁試試看。'
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
          const done = () => resolve(Buffer.concat(chunks).toString('base64'))
          audioStream.on('data', (c) => chunks.push(c))
          audioStream.on('end', done)
          audioStream.on('close', done)
          audioStream.on('error', () => resolve(null))
        }),
        new Promise(resolve => setTimeout(() => resolve(null), 3000))
      ])
    } catch (e) {
      console.warn('[AI Chat] Error-path TTS regeneration failed:', e.stack || e.message)
    }

    // 不回傳 err.message：上面已經依錯誤類別給了對使用者有意義的 reply，
    // 原始訊息只會多洩漏 Gemini SDK 的請求網址、模型名稱與內部路徑。
    res.status(500).json({ success: false, reply, audio: audioBase64 })
  }
})

// POST /api/ai/summarize
router.post('/summarize', optionalAuthenticate, aiLimiter, async (req, res) => {
  const { type, title, content } = req.body
  // 修補前只有 `if (!content)`：非字串會走到 content.slice() 上，而 title
  // 是唯一一個原樣、無界進入 prompt 的欄位（content 至少有 slice(0, 2000)），
  // 因此 body 上限內的任何長度都會整份送進 Gemini 計費。
  if (!isValidSummaryContent(content)) {
    return res.status(400).json({
      success: false,
      error: `內容缺少、格式不正確，或超過 ${SUMMARY_CONTENT_MAX_CHARS} 字`,
    })
  }
  const safeType = normalizeSummaryType(type)
  const safeTitle = normalizeSummaryTitle(title) || '無標題'

  const GEMINI_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_KEY) return res.status(500).json({ success: false, error: '未設定 Key' })

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_KEY)
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite',
      // 摘要會被前端以 markdown 渲染，因此明確要求純文字 markdown。這不是
      // XSS 的防線（真正的防線是 Projects.jsx 不再對 AI 輸出啟用 rehypeRaw），
      // 只是讓模型少產出需要被丟掉的東西。
      systemInstruction:
        '你是 Wayne 個人網站的 AI 助理 Wobot。請用繁體中文精簡總結內容。'
        + '只輸出純文字與基本 markdown，不要輸出任何 HTML 標籤。'
    })
    const prompt = `請總結以下${safeType === 'blog' ? '部落格文章' : '專案'}：\n標題：${safeTitle}\n內容：${content.slice(0, 2000)}`
    const result = await model.generateContent(prompt)
    res.json({ success: true, summary: result.response.text() })
  } catch (err) {
    console.error('[AI Summarize]', err.stack || err.message)
    // 修補前把 err.message 原樣回給呼叫端。Gemini SDK 的錯誤訊息會帶上請求
    // 網址與模型名稱等內部細節，那是伺服器端的診斷資訊。
    res.status(500).json({ success: false, error: '摘要產生失敗，請稍後再試' })
  }
})

// ---------------------------------------------------------------------------
// 模擬面試(FEAT-16 出題 / FEAT-19 評分)
//
// 兩個端點都掛既有的 optionalAuthenticate + aiLimiter(40 次/小時)。刻意不新增
// 限流桶:一場面試耗 2 次呼叫,等於每位訪客每小時約 20 場,作品集情境綽綽有餘。
// ---------------------------------------------------------------------------

const INTERVIEW_MODEL = 'gemini-3.1-flash-lite'
// 出題 12s / 評分 20s。SDK 沒有 timeout 欄位,本專案也沒有先例,一律自己用
// Promise.race 手寫(與 /tts 和 /chat 內的動態 TTS 同一套做法)。
// 每次嘗試的預算,不是整趟的總預算(見 runWithRetry)。
// 依 2026-08-03 的 18 次線上量測抓:出題正常落在 1.8–7.3 秒、評分 2.5–6.7 秒,
// 但出題出現過一次 65 秒的離群值。15 秒對正常情況有兩倍以上餘裕,
// 又能在遇到那種離群值時及早砍掉、把時間留給第二次嘗試。
// 最壞情況總時長約 2 × 15 + 1 = 31 秒,前端全程有進度提示(D-29)。
const QUESTIONS_ATTEMPT_MS = 15000
const QUESTION_TYPES = ['technical', 'behavioral']
const QUESTION_COUNT = 5

// 逾時與「輸出契約不合格」兩種失敗都要跟 transport 錯誤分開處理,所以各給一個
// 可辨識的類別 —— 用字串比對 err.message 來分辨失敗種類正是這裡最不該做的事。
class DeadlineExceeded extends Error {}
class ContractViolation extends Error {
  constructor(reason) {
    super(`interview contract violation: ${reason}`)
    this.reason = reason
  }
}

// 硬性逾時。傳進來的 promise 必須已經啟動;Promise.race 會替兩邊都掛上處理常式,
// 所以逾時之後那個仍在飛的請求即使稍後才 reject 也不會變成 unhandled rejection。
function withDeadline(promise, ms) {
  let timer
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineExceeded()), ms)
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}

// 每次嘗試各自計時,重試才對「慢」有用。
//
// 先前的寫法是 withDeadline(整個重試迴圈, 12s):第一次嘗試若卡住 12 秒,期限就到了,
// 第二次永遠不會執行 —— 重試只擋得住「快速失敗」,擋不住「慢」。
// 而線上實測(2026-08-03,18 次呼叫)正好是後者:17 次落在 1.8–7.3 秒,
// 一次 fresher/en 出題花了 65 秒。以舊寫法那位使用者直接吃錯誤卡,
// 而且重試機制完全沒有派上用場的機會。
//
// 改成每次嘗試各給一份預算之後,那個 65 秒的案例會在 perAttemptMs 被砍掉、
// 換第二次乾淨的嘗試 —— 若慢是上游一時的抖動,第二次通常幾秒就回來。
// 代價是最壞情況的總時長變成約 2 × perAttemptMs + 間隔,這由呼叫端自己拿捏。
async function runWithRetry(makeCall, { attempts = 2, perAttemptMs, gapMs = 1000, onAttemptFail }) {
  let lastErr
  for (let i = 0; i < attempts; i += 1) {
    try {
      return { result: await withDeadline(makeCall(), perAttemptMs), attempt: i + 1 }
    } catch (e) {
      lastErr = e
      if (onAttemptFail) onAttemptFail(i + 1, e)
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, gapMs))
    }
  }
  throw lastErr
}

// 沿用 /chat 既有的三段判斷式(:317-319),回應形狀改成面試端點的 { error, code }。
function classifyGeminiFailure(err) {
  const message = (err && err.message) || ''
  if (message.includes('429') || message.includes('quota')) {
    return { status: 503, code: 'AI_QUOTA', error: 'AI 配額暫時用完了，請稍後再試' }
  }
  if (message.includes('503') || message.includes('demand') || message.includes('Unavailable')) {
    return { status: 503, code: 'AI_BUSY', error: '現在使用的人太多，請稍後再試' }
  }
  return { status: 500, code: 'AI_UNAVAILABLE', error: 'AI 服務暫時無法使用，請稍後再試' }
}

function interviewRequestOptions() {
  return {
    baseUrl: GEMINI_PROXY_URL,
    customHeaders: { 'x-internal-proxy-key': process.env.INTERNAL_PROXY_KEY },
  }
}

// POST /api/ai/interview/questions
router.post('/interview/questions', optionalAuthenticate, aiLimiter, async (req, res) => {
  const startedAt = Date.now()
  const { track, language } = req.body || {}

  // 兩者都必須命中固定白名單(D-01 / D-06)—— 職缺方向不接受自由輸入,所以這裡
  // 不需要任何字串清洗,不在清單上就是不合法。
  if (!TRACKS.includes(track) || !LANGUAGES.includes(language)) {
    return res.status(400).json({ success: false, error: '職缺方向或語言不在允許範圍內', code: 'INVALID_INPUT' })
  }

  const elapsed = () => Date.now() - startedAt
  let attempt = 0

  const GEMINI_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_KEY) {
    console.error(`[AI Interview] questions fail track=${track} lang=${language} reason=no_key attempt=0 ms=${elapsed()}`)
    return res.status(500).json({ success: false, error: 'AI 服務暫時無法使用，請稍後再試', code: 'AI_UNAVAILABLE' })
  }

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_KEY)
    const model = genAI.getGenerativeModel({
      model: INTERVIEW_MODEL,
      systemInstruction: buildQuestionSystemPrompt(track, language),
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: questionsResponseSchema,
        maxOutputTokens: 1024,
        // 出題要多樣,不要每次都拿到同一批題。
        temperature: 0.9,
      },
    }, interviewRequestOptions())

    const kickoff = language === 'en' ? 'Produce the interview questions now.' : '請開始出題。'

    // 重試迴圈沿用 /chat 的形狀(最多 2 次、間隔 1 秒)。出題只重試 transport
    // 錯誤 —— 解析/形狀失敗直接落到 502,使用者此時還沒投入任何作答,重試的價值
    // 遠低於評分那一側(見 /interview/score)。
    const { result } = await runWithRetry(() => model.generateContent(kickoff), {
      perAttemptMs: QUESTIONS_ATTEMPT_MS,
      onAttemptFail: (n, e) => {
        attempt = n
        const reason = e instanceof DeadlineExceeded ? 'attempt_timeout' : 'transport'
        console.warn(`[AI Interview] questions fail track=${track} lang=${language} reason=${reason} attempt=${n} ms=${elapsed()}`)
      },
    })

    const response = result && result.response
    const finishReason = response && response.candidates && response.candidates[0] && response.candidates[0].finishReason
    // finishReason 不是 STOP 就別解析了 —— MAX_TOKENS 會產生語法不完整、但看起來
    // 很像對的 JSON。
    if (finishReason !== 'STOP') throw new ContractViolation(`finish_${finishReason || 'unknown'}`)

    let raw
    try {
      // .text() 在 prompt 或 candidate 被安全過濾時會 throw,不是回空字串。
      raw = response.text()
    } catch (e) {
      throw new ContractViolation('text_throw')
    }

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      // 絕不做正則救援(D-10)。解析不了就是解析不了。
      throw new ContractViolation('parse')
    }

    const questions = parsed && parsed.questions
    if (!Array.isArray(questions) || questions.length !== QUESTION_COUNT) throw new ContractViolation('shape')
    const allValid = questions.every(
      (q) => q && QUESTION_TYPES.includes(q.type) && typeof q.text === 'string' && q.text.trim().length > 0
    )
    if (!allValid) throw new ContractViolation('shape')

    const tech = questions.filter((q) => q.type === 'technical').length
    console.log(`[AI Interview] questions ok track=${track} lang=${language} n=${questions.length} tech=${tech} beh=${questions.length - tech} ms=${elapsed()}`)

    // 題號由這裡依陣列位置產生,不交給模型 —— 前端逐題推進與逐題回饋都靠它對齊。
    res.json({
      success: true,
      questions: questions.map((q, i) => ({ index: i, type: q.type, text: q.text })),
    })
  } catch (err) {
    const ms = elapsed()
    if (err instanceof DeadlineExceeded) {
      console.warn(`[AI Interview] questions fail track=${track} lang=${language} reason=timeout attempt=${attempt} ms=${ms}`)
      return res.status(504).json({ success: false, error: '出題花的時間太久了，請按重試', code: 'QUESTIONS_TIMEOUT' })
    }
    if (err instanceof ContractViolation) {
      console.warn(`[AI Interview] questions fail track=${track} lang=${language} reason=${err.reason} attempt=${attempt} ms=${ms}`)
      return res.status(502).json({ success: false, error: '出題結果格式異常，請按重試', code: 'QUESTIONS_PARSE_FAILED' })
    }
    const classified = classifyGeminiFailure(err)
    console.error(`[AI Interview] questions fail track=${track} lang=${language} reason=${classified.code.toLowerCase()} attempt=${attempt} ms=${ms}`)
    return res.status(classified.status).json({ success: false, error: classified.error, code: classified.code })
  }
})

// POST /api/ai/interview/score
//
// 這是整個面試流程中最不能失敗得難看的一次呼叫:使用者已經打完最多五段字。
// D-20 因此鎖定「作答完整保留在前端狀態」—— 後端這一側對應的義務是:
// 任何失敗都必須回一個明確的錯誤碼,讓前端知道可以原封不動重送同一份 payload。
// 這裡不做任何部分成功、不回半套結果。
// 同樣是「每次嘗試」的預算。評分的輸出比出題大得多(五題各要 comment +
// suggestion),量測 2.5–6.7 秒,抓 18 秒。最壞總時長約 37 秒 ——
// 這裡刻意比出題更捨得等:使用者已經打完五段字,讓他重打的代價遠高於多等十幾秒(D-20)。
const SCORE_ATTEMPT_MS = 18000
const ANSWER_MAX_CHARS = 500
// 題目文字長度上限。題目由請求端帶回（見 /interview/score 內的說明），
// 先前完全沒有上限。
const QUESTION_MAX_CHARS = 300

router.post('/interview/score', optionalAuthenticate, aiLimiter, async (req, res) => {
  const startedAt = Date.now()
  const { track, language, items } = req.body || {}
  const elapsed = () => Date.now() - startedAt
  let attempt = 0

  if (!TRACKS.includes(track) || !LANGUAGES.includes(language)) {
    return res.status(400).json({ success: false, error: '職缺方向或語言不在允許範圍內', code: 'INVALID_INPUT' })
  }
  if (!Array.isArray(items) || items.length !== QUESTION_COUNT) {
    return res.status(400).json({ success: false, error: '作答內容不完整', code: 'INVALID_INPUT' })
  }

  // 逐項驗形。作答長度上限在前端是 D-08 的 500 字,後端必須自己再擋一次 ——
  // 前端的字數限制擋的是誤觸,擋不住直接打 API。
  const shaped = []
  for (const it of items) {
    if (!it || !QUESTION_TYPES.includes(it.type) || typeof it.text !== 'string' || !it.text.trim()) {
      return res.status(400).json({ success: false, error: '作答內容不完整', code: 'INVALID_INPUT' })
    }
    const skipped = it.skipped === true
    const answer = typeof it.answer === 'string' ? it.answer : ''
    if (!skipped && answer.trim().length === 0) {
      return res.status(400).json({ success: false, error: '作答內容不完整', code: 'INVALID_INPUT' })
    }
    if (answer.length > ANSWER_MAX_CHARS) {
      return res.status(400).json({ success: false, error: `單題作答不得超過 ${ANSWER_MAX_CHARS} 字`, code: 'ANSWER_TOO_LONG' })
    }
    // it.text 是題目文字。它由請求端送回來（前端把 /interview/questions 拿到的
    // 題目原封不動帶回），先前只檢查「是非空字串」而沒有長度上限 —— answer 有
    // 500 字上限，題目卻沒有，因此單一請求可以用 body 上限（100kb）內的任意長度
    // 灌進送往 Gemini 的 prompt。aiLimiter 擋得住次數，擋不住單次大小。
    //
    // 上限取 QUESTION_MAX_CHARS：/interview/questions 的 maxOutputTokens 是 1024，
    // 五題平均下來單題遠低於此，300 字已經寬鬆得多。
    if (it.text.length > QUESTION_MAX_CHARS) {
      return res.status(400).json({ success: false, error: '題目內容不正確', code: 'INVALID_INPUT' })
    }
    shaped.push({ type: it.type, text: it.text, skipped, answer })
  }

  const answeredCount = shaped.filter((it) => !it.skipped).length

  const GEMINI_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_KEY) {
    console.error(`[AI Interview] score fail track=${track} lang=${language} reason=no_key attempt=0 ms=${elapsed()}`)
    return res.status(500).json({ success: false, error: 'AI 服務暫時無法使用，請稍後再試', code: 'AI_UNAVAILABLE' })
  }

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_KEY)
    const model = genAI.getGenerativeModel({
      model: INTERVIEW_MODEL,
      systemInstruction: buildScoringSystemPrompt(track, language),
      generationConfig: {
        responseMimeType: 'application/json',
        // 依語言注入 rating enum,拿到的是新物件,不會污染模組層的 schema。
        responseSchema: buildScoringResponseSchema(language),
        // 五題各要 comment + suggestion,輸出比出題那側大得多。
        maxOutputTokens: 3072,
        // 評分要穩定 —— 同一份作答不該每次跑出差很多的分數。
        temperature: 0.3,
      },
    }, interviewRequestOptions())

    // 出題那側只重試 transport 錯誤,這裡連契約違反也重試一次:
    // 使用者已經投入五段作答,多花一次呼叫換一次成功遠比讓他重打划算。
    const { result } = await runWithRetry(
      () => model.generateContent(buildScoringUserMessage(shaped, language)),
      {
        perAttemptMs: SCORE_ATTEMPT_MS,
        onAttemptFail: (n, e) => {
          attempt = n
          const reason = e instanceof DeadlineExceeded ? 'attempt_timeout' : 'transport'
          console.warn(`[AI Interview] score fail track=${track} lang=${language} reason=${reason} attempt=${n} ms=${elapsed()}`)
        },
      }
    )

    const response = result && result.response
    const finishReason = response && response.candidates && response.candidates[0] && response.candidates[0].finishReason
    if (finishReason !== 'STOP') throw new ContractViolation(`finish_${finishReason || 'unknown'}`)

    let raw
    try {
      raw = response.text()
    } catch (e) {
      throw new ContractViolation('text_throw')
    }

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      throw new ContractViolation('parse')
    }

    const per = parsed && parsed.perQuestion
    if (!Array.isArray(per) || per.length !== QUESTION_COUNT) throw new ContractViolation('shape')
    if (typeof parsed.overallScore !== 'number' || typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
      throw new ContractViolation('shape')
    }

    // 逐題正規化。分數一律夾回 0-100 並取整 —— schema 標的是 INTEGER,但那是
    // 對模型的要求,不是保證;直接把模型給的數字餵進前端的進度條是自找麻煩。
    // 跳過的題強制無分數,不採信模型可能自己補上的數字(D-11)。
    const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n))))
    // 【只用陣列位置對齊,絕不採信模型回傳的 questionIndex】
    // 實測(2026-08-03,backend 職缺 / 中文)模型回的是 1-based 的 questionIndex,
    // 而這裡的陣列是 0-based。先前用 `per.find(p => p.questionIndex === i)` 比對,
    // 對不上就退回 per[i] —— 結果是第 1、2 題拿到一模一樣的評語,注入嘗試那題
    // 被標成「未作答」。整份回饋看起來格式完全正常,只有逐字讀才會發現錯位。
    //
    // schema 已鎖定 minItems/maxItems 為 5 且輸出順序跟隨輸入順序,所以位置對齊
    // 是可靠的;questionIndex 則是模型自己數的,不可靠。題號一律由後端依位置產生,
    // 與出題端點的做法一致。
    const perQuestion = shaped.map((it, i) => {
      const src = per[i] || {}
      const hasScore = !it.skipped && Number.isFinite(Number(src.score))
      return {
        index: i,
        skipped: it.skipped,
        score: hasScore ? clamp(src.score) : null,
        comment: typeof src.comment === 'string' ? src.comment : '',
        suggestion: typeof src.suggestion === 'string' ? src.suggestion : '',
      }
    })

    // 總分自己算,不採信模型的 overallScore —— 模型算平均這件事並不可靠,
    // 而「總分與逐題分數對不起來」是使用者一眼就會抓到的破綻。
    const scored = perQuestion.filter((p) => p.score !== null)
    const overallScore = scored.length
      ? Math.round(scored.reduce((s, p) => s + p.score, 0) / scored.length)
      : 0

    const ratingList = RATING_ENUM_BY_LANG[language] || RATING_ENUM_BY_LANG.zh
    const rating = ratingList.includes(parsed.rating) ? parsed.rating : ratingList[ratingList.length - 1]

    console.log(`[AI Interview] score ok track=${track} lang=${language} answered=${answeredCount} overall=${overallScore} ms=${elapsed()}`)

    res.json({
      success: true,
      overallScore,
      rating,
      summary: parsed.summary,
      answeredCount,
      perQuestion,
    })
  } catch (err) {
    const ms = elapsed()
    if (err instanceof DeadlineExceeded) {
      console.warn(`[AI Interview] score fail track=${track} lang=${language} reason=timeout attempt=${attempt} ms=${ms}`)
      return res.status(504).json({ success: false, error: '評分花的時間太久了，你的作答還在，請按重試', code: 'SCORE_TIMEOUT' })
    }
    if (err instanceof ContractViolation) {
      console.warn(`[AI Interview] score fail track=${track} lang=${language} reason=${err.reason} attempt=${attempt} ms=${ms}`)
      return res.status(502).json({ success: false, error: '評分結果格式異常，你的作答還在，請按重試', code: 'SCORE_PARSE_FAILED' })
    }
    const classified = classifyGeminiFailure(err)
    console.error(`[AI Interview] score fail track=${track} lang=${language} reason=${classified.code.toLowerCase()} attempt=${attempt} ms=${ms}`)
    return res.status(classified.status).json({ success: false, error: classified.error, code: classified.code })
  }
})

module.exports = router
