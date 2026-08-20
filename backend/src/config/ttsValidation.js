// backend/src/config/ttsValidation.js
//
// /api/ai/tts 的輸入驗證。沿用本專案既有慣例（leaderboardValidation.js、
// bossValidation.js、reactionValidation.js）：驗證規則集中在 config/ 下的
// 獨立模組，路由層只負責接收與回應。
//
// 背景 —— msedge-tts 的 SSML 是純字串內插，完全不做跳脫：
//
//   <voice name="${this._voice}">
//     <prosody pitch="..." rate="${options.rate}" ...>
//       ${input}
//
// 而 setMetadata() 對聲線的檢查只是一個「未錨定」的 /\w{2}-\w{2}/，字串裡
// 任何位置有 xx-xx 就通過。因此下列兩個值都能成功注入 SSML（已實測）：
//
//   voice = 'zh-CN"><audio src="https://evil.example/x.mp3"/><voice name="'
//   text  = 'hi<audio src="https://evil.example/x.mp3"/>'
//
// 影響範圍要說清楚：這段 SSML 是送到微軟的 Edge Read Aloud 服務，不是送到
// 瀏覽器，所以不是 XSS。實際後果是內容注入 —— SSML 的 <audio src> 會讓微軟
// 的合成服務去抓該網址並把音訊接進回傳的 MP3，等於本站的 TTS 端點可以被指
// 使吐出任意聲音，並藉本站身分消耗該服務。嚴重度不高，但修補成本極低。

// 聲線白名單。與 ai.js 既有的 TTS_RATE_WHITELIST 一樣刻意使用 Map 而非物件
// 字面值，理由相同：物件字面值查表時，'constructor' / '__proto__' /
// 'toString' 這類鍵會查到 Object.prototype 上的東西（truthy，因此 ?? 不會
// 觸發），整包被內插進 SSML。Map 沒有原型鍵可命中。
//
// 名單即前端實際使用的全部聲線，來源：
//   frontend/src/components/interview/ttsOptions.js 的 VOICE_BY_LANGUAGE
//   frontend/src/components/AIAssistant.jsx（Wobot 固定用曉曉）
const TTS_VOICE_WHITELIST = new Map([
  ['zh-CN-XiaoxiaoNeural', 'zh-CN-XiaoxiaoNeural'],
  ['en-US-AriaNeural', 'en-US-AriaNeural'],
]);

const DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural';

// 單次合成的文字長度上限。Wobot 會把回覆切成分句、每句各打一次 /tts，面試
// 題目也是單題朗讀，正常用途遠低於這個值。設上限是為了避免單一請求佔住
// WebSocket 連線與記憶體 —— 既有的 8 秒逾時只擋得住慢，擋不住大。
const TTS_TEXT_MAX_CHARS = 2000;

/**
 * 取得合法聲線。不在白名單內一律退回預設，不採信請求端的值。
 * @param {unknown} voice
 * @returns {string}
 */
const resolveVoice = (voice) => TTS_VOICE_WHITELIST.get(voice) ?? DEFAULT_VOICE;

/**
 * @param {unknown} voice
 * @returns {boolean}
 */
const isAllowedVoice = (voice) => TTS_VOICE_WHITELIST.has(voice);

// XML 特殊字元跳脫。刻意逐字元建構而非用正規表示式字面量，與
// bossValidation.js 的控制字元處理同一個理由：跳脫序列在經手的工具鏈中
// 容易被還原，改用碼位比較最穩。
const XML_ESCAPES = new Map([
  ['&', '&amp;'],
  ['<', '&lt;'],
  ['>', '&gt;'],
  ['"', '&quot;'],
  ["'", '&apos;'],
]);

/**
 * 把要放進 SSML 的文字做 XML 跳脫。
 *
 * 必須在 markdown 符號與 emoji 清除之後才呼叫 —— 那兩步只是去掉唸起來
 * 奇怪的字元，不具安全意義；真正封住注入的是這一步。
 *
 * @param {string} text
 * @returns {string}
 */
const escapeForSsml = (text) =>
  Array.from(String(text))
    .map((ch) => XML_ESCAPES.get(ch) ?? ch)
    .join('');

/**
 * @param {unknown} text
 * @returns {boolean}
 */
const isValidTtsText = (text) =>
  typeof text === 'string' && text.trim().length > 0 && text.length <= TTS_TEXT_MAX_CHARS;

module.exports = {
  TTS_VOICE_WHITELIST,
  DEFAULT_VOICE,
  TTS_TEXT_MAX_CHARS,
  resolveVoice,
  isAllowedVoice,
  escapeForSsml,
  isValidTtsText,
};
