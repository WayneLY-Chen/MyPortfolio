// backend/src/config/aiInputValidation.js
//
// /api/ai 底下「自由文字輸入」端點的共用驗證。沿用本專案既有慣例
// （ttsValidation.js / chatValidation.js / bossValidation.js）：路由層只負責
// 接收與回應，規則集中在 config/ 下的獨立模組。
//
// 涵蓋的端點：
//   POST /api/ai/generate-image   prompt
//   POST /api/ai/summarize        type / title / content
//
// /tts 與 /chat 已各自有 ttsValidation.js 與 chatValidation.js；那兩個模組不
// 併進來，因為它們還帶著各自端點專屬的邏輯（SSML 跳脫、對話歷史整形）。
//
// 這一層不處理 prompt injection —— 使用者的文字終究會進到模型的 prompt 裡。
// 這裡處理的是型別與規模：不讓非字串走到只有字串才有的方法上，不讓單一請求
// 把任意大小的文字送進計費的第三方 API。

// ---------------------------------------------------------------------------
// /generate-image
// ---------------------------------------------------------------------------

// Stability AI 的 SDXL text-to-image 對單一 text_prompt 的上限是 2000 字元，
// 這裡取同一個數字：比它更寬鬆只會換來對方回 400，更嚴格則可能擋掉合法輸入。
// 與 ttsValidation.js 的 TTS_TEXT_MAX_CHARS 一致。
//
// 前端的輸入框沒有 maxLength（FunPage.jsx），而 express.json() 的預設 body
// 上限是 100kb —— 也就是修補前單一請求可以把約 10 萬字元一路送進 Google
// Translate 與 Stability AI。aiLimiter 擋得住次數，擋不住單次大小。
const IMAGE_PROMPT_MAX_CHARS = 2000;

/**
 * 圖片生成的 prompt 是否合法。
 *
 * 型別檢查是這裡最重要的一項，不是防禦性冗贅。修補前的檢查只有 `if (!prompt)`，
 * 因此 {"prompt": 1} 這種請求會一路走到
 *
 *   prompt.split('').reduce(...)        // 未設定 STABILITY_API_KEY 的示範模式
 *
 * 而 Number 沒有 .split。這是 async handler 內未被 try/catch 包住的位置，
 * Express 4 不會把 async handler 的 rejection 交給錯誤中介層，因此變成
 * unhandledRejection —— Node 24 預設中止行程（已實測：請求永遠不回應，
 * 且 unhandledRejection 觸發）。
 *
 * @param {unknown} prompt
 * @returns {boolean}
 */
const isValidImagePrompt = (prompt) =>
  typeof prompt === 'string' &&
  prompt.trim().length > 0 &&
  prompt.length <= IMAGE_PROMPT_MAX_CHARS;

// ---------------------------------------------------------------------------
// /summarize
// ---------------------------------------------------------------------------

// content 在送進 prompt 前本來就有 .slice(0, 2000)，所以模型端的成本是有界的。
// 這裡的上限管的是「送進來的東西」本身：非字串會讓 .slice 直接爆掉（雖然
// /summarize 那一段包在 try 裡，會變成 500 而不是行程中止，但錯誤訊息會被回給
// 呼叫端，見下方 SUMMARY_TITLE_MAX_CHARS 的說明）。
const SUMMARY_CONTENT_MAX_CHARS = 20000;

// title 修補前完全沒有上限，也沒有被 slice —— 它是唯一一個「原樣、無界」進入
// prompt 的欄位：
//
//   `請總結以下${...}：\n標題：${title || '無標題'}\n內容：${content.slice(0, 2000)}`
//
// 也就是 body 上限（100kb）內的任何長度都會整份送進 Gemini 計費。
const SUMMARY_TITLE_MAX_CHARS = 200;

// 前端只送這兩種值（Projects.jsx 送 'project'，Blog.jsx 送 'blog'）。type 只
// 用來決定 prompt 裡寫「專案」還是「部落格文章」，不落地、不查詢，因此它本身
// 不是漏洞；收斂成白名單是為了不讓任意字串出現在 prompt 中。
const SUMMARY_TYPES = ['project', 'blog'];

/**
 * @param {unknown} type
 * @returns {'project'|'blog'} 不在白名單上一律當成 'project'（與修補前
 *   `type === 'blog' ? '部落格文章' : '專案'` 的行為一致）
 */
const normalizeSummaryType = (type) => (SUMMARY_TYPES.includes(type) ? type : 'project');

/**
 * @param {unknown} title
 * @returns {string} 缺少或非字串時回空字串，由呼叫端決定要不要填「無標題」
 */
const normalizeSummaryTitle = (title) =>
  typeof title === 'string' ? title.trim().slice(0, SUMMARY_TITLE_MAX_CHARS) : '';

/**
 * @param {unknown} content
 * @returns {boolean}
 */
const isValidSummaryContent = (content) =>
  typeof content === 'string' &&
  content.trim().length > 0 &&
  content.length <= SUMMARY_CONTENT_MAX_CHARS;

module.exports = {
  IMAGE_PROMPT_MAX_CHARS,
  isValidImagePrompt,
  SUMMARY_CONTENT_MAX_CHARS,
  SUMMARY_TITLE_MAX_CHARS,
  SUMMARY_TYPES,
  normalizeSummaryType,
  normalizeSummaryTitle,
  isValidSummaryContent,
};
