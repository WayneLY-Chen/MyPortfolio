// backend/src/config/chatValidation.js
//
// /api/ai/chat 的輸入驗證。沿用本專案既有慣例：驗證規則集中在 config/ 下的
// 獨立模組，路由層只負責接收與回應。
//
// 先講清楚這一層擋得住什麼、擋不住什麼 —— 避免日後有人以為 prompt injection
// 已經解決了：
//
// 擋得住：配額與資源濫用。message 與 history 原本都沒有任何長度或筆數限制，
//   而兩者會直接組成送往 Gemini 的請求。單一請求即可塞入極大的內容，
//   aiLimiter 的 40 次／小時擋得住次數，擋不住單次大小。history 也可以被塞
//   進上萬筆偽造對話。
//
// 擋不住：prompt injection 本身。history 由客戶端提供是這個功能的既有設計
//   （前端不保存伺服器端 session），因此請求端本來就能偽造「model 說過的
//   話」來引導後續回覆。要真正解決得把對話狀態移到伺服器端，那是功能層級的
//   改動，不在輸入驗證的範圍內。此處只把可濫用的規模壓到與正常使用相當。

// 單則訊息長度上限。Wobot 是網頁上的對話框，正常提問遠低於此。
const MESSAGE_MAX_CHARS = 2000;

// 保留的歷史輪數上限。前端 AIAssistant.jsx 取 .slice(-6)，此處留到 10 作為
// 緩衝，讓日後前端小幅調整不必同步改這裡。
const HISTORY_MAX_TURNS = 10;

// 單輪內容長度上限。歷史中的每一則本來就是先前的 message 或 Wobot 回覆，
// 與 MESSAGE_MAX_CHARS 同級即可。
const HISTORY_TURN_MAX_CHARS = 2000;

// Gemini 的 history 只認這兩種角色。
const VALID_ROLES = ['user', 'model'];

/**
 * @param {unknown} message
 * @returns {boolean}
 */
const isValidChatMessage = (message) =>
  typeof message === 'string' &&
  message.trim().length > 0 &&
  message.length <= MESSAGE_MAX_CHARS;

/**
 * 把客戶端送來的 history 收斂成安全可用的形狀。
 *
 * 刻意採取「丟棄不合格的項目」而非「整包拒絕回 400」：history 是輔助性的
 * 脈絡，格式有瑕疵時讓對話少一點記憶、仍能回答，比讓使用者看到錯誤好。
 * 真正需要嚴格把關的是 message，那個走 isValidChatMessage 回 400。
 *
 * @param {unknown} history
 * @returns {Array<{role: string, parts: Array<{text: string}>}>}
 */
const sanitizeHistory = (history) => {
  if (!Array.isArray(history)) return [];

  const cleaned = [];
  for (const turn of history) {
    if (!turn || typeof turn !== 'object' || Array.isArray(turn)) continue;
    if (!VALID_ROLES.includes(turn.role)) continue;
    if (!Array.isArray(turn.parts) || turn.parts.length === 0) continue;

    const parts = [];
    for (const part of turn.parts) {
      if (!part || typeof part !== 'object') continue;
      if (typeof part.text !== 'string' || part.text.length === 0) continue;
      parts.push({ text: part.text.slice(0, HISTORY_TURN_MAX_CHARS) });
    }
    if (parts.length === 0) continue;

    cleaned.push({ role: turn.role, parts });
  }

  // 只保留最近的幾輪 —— 較早的內容對回覆的影響本來就最小。
  const trimmed = cleaned.slice(-HISTORY_MAX_TURNS);

  // Gemini 要求 history 必須以 user 輪開頭，否則 startChat 會直接拋錯。
  // 前端已經做過同樣的處理，但 history 來自請求端，不能依賴它做過。
  while (trimmed.length > 0 && trimmed[0].role !== 'user') trimmed.shift();

  return trimmed;
};

module.exports = {
  MESSAGE_MAX_CHARS,
  HISTORY_MAX_TURNS,
  HISTORY_TURN_MAX_CHARS,
  VALID_ROLES,
  isValidChatMessage,
  sanitizeHistory,
};
