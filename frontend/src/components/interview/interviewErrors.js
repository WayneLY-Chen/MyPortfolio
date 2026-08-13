// 後端錯誤碼 → 錯誤卡文案的對照表。零 React 依賴的純 ESM 模組。
//
// 所有字串逐字取自 05-UI-SPEC.md 的「Error Card Contract」與「Additional UI Strings」。
// 那份規格六個維度全數 PASS 且已 APPROVED,文案本身就是契約 —— 不要潤飾、不要意譯、
// 不要「順手」把逗號改成全形。interviewErrors.test.js 用 deepStrictEqual 盯著這件事。
//
// 兩個階段的差別只有標題與按鈕(D-20):
//   出題失敗 → 「出題失敗」/「重試」        (使用者還沒投入作答,損失只有等待時間)
//   評分失敗 → 「評分暫時失敗,你的作答都還在」/「重試評分」
//              ↑ 這句話本身就是設計的一部分:使用者此刻最怕的是白打五段字。

const EYEBROW = {
  QUOTA: '配額用完',
  BUSY: '伺服器繁忙',
  NETWORK: '網路問題',
  RATE_LIMITED: '請求過於頻繁',
  PARSE: '格式異常',
  TIMEOUT: '逾時',
}

const BODY = {
  QUOTA: 'AI 配額暫時用完了,請稍後再試。',
  BUSY: '現在使用的人太多,請稍後再試。',
  UNAVAILABLE: 'AI 服務暫時無法使用,請稍後再試。',
  NETWORK: '無法連上伺服器,請確認網路連線後再試。',
  RATE_LIMITED: '你在這一小時內的 AI 使用次數已達上限,請稍後再試。',
  SCORE_PARSE: '評分結果格式異常,你的作答都還在,請按重試',
  SCORE_TIMEOUT: '評分花的時間太久了,你的作答都還在,請按重試',
}

// 英文版。鍵名與中文版一一對應 —— 缺一個鍵就會在錯誤畫面上渲染出 undefined,
// 而錯誤畫面正是最少被日常操作走到、因此最不會被發現的地方,所以底下的
// EN_BY_KEY 用同一組鍵重建,任何一邊漏掉都會在 resolveInterviewError 立刻看得出來。
//
// 評分那兩句刻意保留「your answers are safe」的語氣 —— 這是 D-20 在文案層的落點,
// 使用者此刻怕的是白打五段字,英文版不能翻成單純的「something went wrong」。
const EYEBROW_EN = {
  QUOTA: 'Quota reached',
  BUSY: 'Server busy',
  NETWORK: 'Network problem',
  RATE_LIMITED: 'Too many requests',
  PARSE: 'Unexpected format',
  TIMEOUT: 'Timed out',
}

const BODY_EN = {
  QUOTA: 'The AI quota is used up for now. Please try again later.',
  BUSY: 'Too many people are using this right now. Please try again later.',
  UNAVAILABLE: 'The AI service is temporarily unavailable. Please try again later.',
  NETWORK: "Couldn't reach the server. Check your connection and try again.",
  RATE_LIMITED: "You've hit the AI usage limit for this hour. Please try again later.",
  SCORE_PARSE: 'The scoring result came back in an unexpected format. Your answers are safe — press retry.',
  SCORE_TIMEOUT: 'Scoring took too long. Your answers are safe — press retry.',
}

// 後端 backend/src/routes/ai.js 實際會回的 code(RATE_LIMITED 除外 —— 限流
// middleware 的 429 body 沒有 code 欄位,只能靠 status 判斷,見 resolveInterviewError)。
export const INTERVIEW_ERROR_CODES = [
  'AI_QUOTA',
  'AI_BUSY',
  'AI_UNAVAILABLE',
  'QUESTIONS_TIMEOUT',
  'QUESTIONS_PARSE_FAILED',
  'SCORE_TIMEOUT',
  'SCORE_PARSE_FAILED',
  'RATE_LIMITED',
  'NETWORK',
]

// code → { eyebrow, body }。出題與評分兩階段共用同一份內文(UI-SPEC 的表格裡
// 這幾列左右兩欄本來就是同一句話),只有評分專屬的兩個 code 例外。
// 必須是 Map,不可以改回物件字面值 —— code 直接來自後端回應,用物件查表時
// 'constructor' / '__proto__' / 'toString' 這類鍵會查到 Object.prototype 上的東西
// (truthy,所以 `|| FALLBACK` 不會觸發),錯誤卡就會渲染出 undefined。
// 後端 ai.js 的 TTS_RATE_WHITELIST 出於同一個理由也是 Map。
// 值存的是**鍵**而不是字串,實際文案在 resolveInterviewError 依語言取。
// 存字串的話等於把中文寫死在對照表裡,英文版就得再維護一份平行的 Map,
// 兩份 Map 遲早漂移。
const BY_CODE = new Map([
  ['AI_QUOTA', { eyebrow: 'QUOTA', body: 'QUOTA' }],
  ['AI_BUSY', { eyebrow: 'BUSY', body: 'BUSY' }],
  ['AI_UNAVAILABLE', { eyebrow: 'BUSY', body: 'UNAVAILABLE' }],

  // 出題的逾時與解析失敗沿用既有的「伺服器繁忙」那一組,不發明新文案 ——
  // 對使用者而言「AI 出不了題」就是一件事,分不分得清 502 與 504 沒有意義。
  ['QUESTIONS_TIMEOUT', { eyebrow: 'BUSY', body: 'UNAVAILABLE' }],
  ['QUESTIONS_PARSE_FAILED', { eyebrow: 'BUSY', body: 'UNAVAILABLE' }],

  // 評分專屬。兩句都寫明「你的作答都還在」—— 這是 D-20 在文案層的落點。
  // 後端實際送的是 SCORE_*(ai.js:728, 732);SCORING_* 是 UI-SPEC / AI-SPEC 的寫法,
  // 兩種都收,避免任何一邊改字時錯誤卡默默掉進 fallback。
  ['SCORE_PARSE_FAILED', { eyebrow: 'PARSE', body: 'SCORE_PARSE' }],
  ['SCORING_PARSE_FAILED', { eyebrow: 'PARSE', body: 'SCORE_PARSE' }],
  ['SCORE_TIMEOUT', { eyebrow: 'TIMEOUT', body: 'SCORE_TIMEOUT' }],
  ['SCORING_TIMEOUT', { eyebrow: 'TIMEOUT', body: 'SCORE_TIMEOUT' }],

  ['RATE_LIMITED', { eyebrow: 'RATE_LIMITED', body: 'RATE_LIMITED' }],
  ['NETWORK', { eyebrow: 'NETWORK', body: 'NETWORK' }],
])

const FALLBACK = BY_CODE.get('AI_UNAVAILABLE')

// 標題與按鈕文字。評分階段的標題不隨 code 變化 —— 那句話本身就是設計的一部分。
const TITLES = {
  zh: { scoring: '評分暫時失敗,你的作答都還在', questions: '出題失敗' },
  en: { scoring: "Scoring failed for now — your answers are still here", questions: "Couldn't generate questions" },
}
const BUTTONS = {
  zh: { scoring: '重試評分', questions: '重試' },
  en: { scoring: 'Retry scoring', questions: 'Retry' },
}

/**
 * @param {{ stage?: 'questions'|'scoring', status?: number, code?: string|null, language?: 'zh'|'en' }} input
 * @returns {{ eyebrow: string, title: string, body: string, buttonLabel: string }}
 *
 * `language` 省略時一律回中文 —— 既有呼叫端與 interviewErrors.test.js 的
 * deepStrictEqual 都是以中文為基準寫的,預設值換掉會讓它們無聲改變行為。
 */
export function resolveInterviewError(input = {}) {
  const { stage, status, code, language } = input
  const scoring = stage === 'scoring'
  const en = language === 'en'

  // D-23:429 一律走專屬那一組,而且要先判。限流 middleware 的回應沒有 code,
  // 只看 code 會讓它落進「AI 服務暫時無法使用」,使用者就不知道是自己打太快。
  const group =
    status === 429 || code === 'RATE_LIMITED'
      ? BY_CODE.get('RATE_LIMITED')
      : BY_CODE.get(code) || FALLBACK

  const eyebrows = en ? EYEBROW_EN : EYEBROW
  const bodies = en ? BODY_EN : BODY
  const stageKey = scoring ? 'scoring' : 'questions'

  return {
    eyebrow: eyebrows[group.eyebrow],
    title: (en ? TITLES.en : TITLES.zh)[stageKey],
    body: bodies[group.body],
    buttonLabel: (en ? BUTTONS.en : BUTTONS.zh)[stageKey],
  }
}
