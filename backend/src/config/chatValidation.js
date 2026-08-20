// backend/src/config/chatValidation.js
//
// /api/ai/chat 的輸入驗證。沿用本專案既有慣例：驗證規則集中在 config/ 下的
// 獨立模組，路由層只負責接收與回應。
//
// 這一層負責的是「規模」：message 原本沒有任何長度限制，而它會直接組成送往
// Gemini 的請求。單一請求即可塞入極大的內容，aiLimiter 的 40 次／小時擋得住
// 次數，擋不住單次大小。
//
// 曾經還有一個 sanitizeHistory，用來收斂請求端送來的對話歷史，並在此註明
// 「這一層不處理 prompt injection 本身」。那個欄位已經整個廢除 —— 對話歷史
// 改由伺服器保存（config/conversationStore.js），req.body.history 一律被忽略，
// 因此不再需要清洗它。留在這裡的只有 message 這一項。
//
// 仍然擋不住的：使用者在自己那一句 message 裡寫進指示。那是 LLM 應用的固有
// 問題，不是輸入驗證或儲存位置能解決的。差別在於攻擊者現在只能用自己的發言
// 去說服模型，不能再直接捏造模型的發言。

// 單則訊息長度上限。Wobot 是網頁上的對話框，正常提問遠低於此。
const MESSAGE_MAX_CHARS = 2000;


/**
 * @param {unknown} message
 * @returns {boolean}
 */
const isValidChatMessage = (message) =>
  typeof message === 'string' &&
  message.trim().length > 0 &&
  message.length <= MESSAGE_MAX_CHARS;


module.exports = {
  MESSAGE_MAX_CHARS,
  isValidChatMessage,
};
