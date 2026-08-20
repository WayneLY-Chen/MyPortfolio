// backend/src/test/__mocks__/google-generative-ai.js
//
// @google/generative-ai 的測試替身，透過 test/setup.js 的 Module._load 轉接
// 掛上（與 msedge-tts 的替身同一套機制 —— routes/ai.js 是純 CommonJS，內部的
// require 走 Node 原生載入，vi.mock 攔不到）。
//
// 只實作 routes/ai.js 實際用到的那幾個方法：
//   genAI.getGenerativeModel(config, requestOptions)
//     .startChat({ history, generationConfig }).sendMessage(text)
//     .generateContent(promptOrMessage)
//
// 每次呼叫都留下記錄，測試才驗得了「送進模型的 history 到底是什麼」——
// 那正是 prompt injection 那條修補的核心斷言。

const calls = {
  models: [],
  chats: [],
  sendMessages: [],
  generateContents: [],
};

let nextReplyText = 'mock reply';
let nextGenerateContentText = '{}';
let nextFinishReason = 'STOP';

const makeResponse = (text) => ({
  response: {
    text: () => text,
    candidates: [{ finishReason: nextFinishReason }],
  },
});

class GoogleGenerativeAI {
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  getGenerativeModel(config, requestOptions) {
    calls.models.push({ config, requestOptions });
    return {
      startChat: (chatOptions) => {
        calls.chats.push(chatOptions);
        return {
          sendMessage: async (text) => {
            calls.sendMessages.push(text);
            return makeResponse(nextReplyText);
          },
        };
      },
      generateContent: async (prompt) => {
        calls.generateContents.push(prompt);
        return makeResponse(nextGenerateContentText);
      },
    };
  }
}

// --- 測試控制介面 ---------------------------------------------------------

const __reset = () => {
  calls.models.length = 0;
  calls.chats.length = 0;
  calls.sendMessages.length = 0;
  calls.generateContents.length = 0;
  nextReplyText = 'mock reply';
  nextGenerateContentText = '{}';
  nextFinishReason = 'STOP';
};

const __calls = () => calls;
/** 最近一次 startChat 收到的參數（含 history）。 */
const __lastChat = () => calls.chats[calls.chats.length - 1];
const __setReplyText = (text) => { nextReplyText = text; };
const __setGenerateContentText = (text) => { nextGenerateContentText = text; };
const __setFinishReason = (reason) => { nextFinishReason = reason; };

// interview/schemas.js 在模組載入時就用到 SchemaType，值必須與真實套件一致
// （它們會被寫進送給 Gemini 的 responseSchema）。真實套件用的是這些小寫字串。
const SchemaType = {
  STRING: 'string',
  NUMBER: 'number',
  INTEGER: 'integer',
  BOOLEAN: 'boolean',
  ARRAY: 'array',
  OBJECT: 'object',
};

module.exports = {
  GoogleGenerativeAI,
  SchemaType,
  __reset,
  __calls,
  __lastChat,
  __setReplyText,
  __setGenerateContentText,
  __setFinishReason,
};
