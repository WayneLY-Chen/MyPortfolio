// 面試語音的選項常數與正規化。零 React 依賴的純 ESM 模組,才測得動:
//
//   cd frontend && node --test src/components/interview/ttsOptions.test.js
//
// 這一層全部是 UX 收斂,不是安全控制 —— 真正的白名單在後端
// backend/src/routes/ai.js 的 TTS_RATE_WHITELIST(rate 最終會被內插進
// <prosody rate="..."> 這個 XML 屬性,所以那一層必須是 Map 而且必須擋)。

// D-16:0.75x / 1x / 1.25x 三段。與 interviewReducer.js 的 RATE_OPTIONS 是同一份
// 清單的兩種說法(播放端 / 狀態機),ttsOptions.test.js 斷言兩者必須相等,
// 任何一邊單獨改動都會當場失敗。
export const SPEED_OPTIONS = [0.75, 1, 1.25]
export const DEFAULT_SPEED = 1

// D-15:中文沿用與 Wobot 同一聲線(曉曉);英文另換 —— zh-CN 聲線唸英文的腔調
// 明顯不自然,會直接打折英文模式的展示效果。
export const VOICE_BY_LANGUAGE = {
  zh: 'zh-CN-XiaoxiaoNeural',
  en: 'en-US-AriaNeural',
}

export const DEFAULT_LANGUAGE = 'zh'

// 未知語言退回中文聲線。用 Object.prototype.hasOwnProperty 而非直接索引,
// 避免 'constructor' / 'toString' 這類鍵查到原型上的東西。
export function resolveVoice(language) {
  return Object.prototype.hasOwnProperty.call(VOICE_BY_LANGUAGE, language)
    ? VOICE_BY_LANGUAGE[language]
    : VOICE_BY_LANGUAGE[DEFAULT_LANGUAGE]
}

// 不在三段之內(含字串型別的 '1.25')一律退回 1x。刻意不做字串轉數字 ——
// 讓型別不對的呼叫端當場看到語速沒變,比默默接受更容易發現問題。
export function normalizeSpeed(value) {
  return SPEED_OPTIONS.includes(value) ? value : DEFAULT_SPEED
}
