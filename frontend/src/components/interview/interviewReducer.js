// 模擬面試的狀態機 —— 零 React 依賴的純 ESM 模組,可用 node --test 直接驗證
// (比照 typing-race/typingEngine.js 的既有做法)。
//
// 這個檔案存在的理由只有一個:D-20 —— 使用者打完五段字之後評分失敗時,那五段字
// 必須完好無損地留在狀態裡,重試送出的內容與第一次逐字相同。這件事的真相在
// reducer,不在畫面上,所以它被寫成可斷言的不變式(REL-1),畫面只是把它呈現出來。
//
// 三條硬規則,改這個檔案的人請先讀:
//   1. `answers` 只會被 RESTART_INTERVIEW 清空。其他每一個分支一律用展開既有
//      `answers` 的方式產生新陣列,絕不重建成空陣列或 null(AI-SPEC §6.3 前端契約 4)。
//   2. 每個 action 都有 phase 守衛。晚到的回應(例如使用者已經答完才回來的
//      QUESTIONS_LOADED)必須是 no-op,而不是把進行中的面試洗掉。
//   3. 沒有「上一題」動作(D-05 單向)、沒有自動重試(D-19,重試永遠是使用者按的)、
//      沒有任何持久化(D-22:切分頁保留靠 React state,重整就歸零)。

// 後端白名單,與 backend/src/interview/prompts.js 的 TRACKS / LANGUAGES 一致。
// 送出不在清單內的值會被後端以 INVALID_INPUT 擋下,所以前端這一層先收斂。
export const TRACKS = ['frontend', 'backend', 'fullstack', 'fresher']
export const LANGUAGES = ['zh', 'en']

// D-03:一場面試固定 5 題。D-08:單題作答上限 500 字。
export const QUESTION_COUNT = 5
export const ANSWER_MAX_CHARS = 500

// D-16:語速三段。這裡是狀態機接受的白名單;ttsOptions.js 的 SPEED_OPTIONS 是
// 同一份清單的播放端說法,兩者由 ttsOptions.test.js 斷言必須相等(避免日後漂移)。
// 真正的控制在後端 ai.js 的 TTS_RATE_WHITELIST,前端這兩層都只是 UX。
export const RATE_OPTIONS = [0.75, 1, 1.25]

export const ACTION_TYPES = {
  SELECT_TRACK: 'SELECT_TRACK',
  SELECT_LANGUAGE: 'SELECT_LANGUAGE',
  START_INTERVIEW: 'START_INTERVIEW',
  QUESTIONS_LOADED: 'QUESTIONS_LOADED',
  QUESTIONS_FAILED: 'QUESTIONS_FAILED',
  RETRY_QUESTIONS: 'RETRY_QUESTIONS',
  UPDATE_DRAFT: 'UPDATE_DRAFT',
  NEXT_QUESTION: 'NEXT_QUESTION',
  SKIP_QUESTION: 'SKIP_QUESTION',
  END_EARLY: 'END_EARLY',
  SCORING_SUCCEEDED: 'SCORING_SUCCEEDED',
  SCORING_FAILED: 'SCORING_FAILED',
  RETRY_SCORING: 'RETRY_SCORING',
  RESTART_INTERVIEW: 'RESTART_INTERVIEW',
  SET_RATE: 'SET_RATE',
  TOGGLE_MUTE: 'TOGGLE_MUTE',
}

export const INITIAL_STATE = {
  // setup → loading_questions → interviewing → scoring → results
  //              ↘ questions_error              ↘ scoring_error
  phase: 'setup',
  track: null,
  language: 'zh',
  questions: [],
  answers: [],
  currentIndex: 0,
  draft: '',
  result: null,
  errorCode: null,
  errorStatus: null,
  muted: false,
  rate: 1,
}

// D-08 的截斷。用 code point 切(比照 typingEngine.js 的 toChars),再補一道
// String.length 的收尾 —— 後端 ai.js 擋的是 `answer.length > 500`(UTF-16 口徑),
// 若日後作答含 BMP 外字元,只切 code point 會讓兩邊口徑對不上而吃到 400。
function clampAnswer(text) {
  if (typeof text !== 'string') return ''
  const chars = Array.from(text)
  let out = chars.length > ANSWER_MAX_CHARS ? chars.slice(0, ANSWER_MAX_CHARS).join('') : text
  while (out.length > ANSWER_MAX_CHARS) {
    out = Array.from(out).slice(0, -1).join('')
  }
  return out
}

function hasContent(text) {
  return typeof text === 'string' && text.trim().length > 0
}

// 把 draft 寫進目前這一題。展開既有 answers,絕不重建 —— 見檔頭規則 1。
function commitDraft(state, text) {
  return state.answers.map((a) =>
    a.index === state.currentIndex ? { index: a.index, text: hasContent(text) ? text : null } : a
  )
}

export function canStart(state) {
  return state.phase === 'setup' && TRACKS.includes(state.track) && LANGUAGES.includes(state.language)
}

export function answeredCount(state) {
  return state.answers.filter((a) => hasContent(a.text)).length
}

export function isLastQuestion(state) {
  return state.currentIndex >= QUESTION_COUNT - 1
}

export function interviewReducer(state, action) {
  switch (action.type) {
    case ACTION_TYPES.SELECT_TRACK: {
      if (state.phase !== 'setup') return state
      if (!TRACKS.includes(action.track)) return state
      return { ...state, track: action.track }
    }

    case ACTION_TYPES.SELECT_LANGUAGE: {
      if (state.phase !== 'setup') return state
      if (!LANGUAGES.includes(action.language)) return state
      return { ...state, language: action.language }
    }

    case ACTION_TYPES.START_INTERVIEW: {
      if (!canStart(state)) return state
      return { ...state, phase: 'loading_questions', errorCode: null, errorStatus: null }
    }

    case ACTION_TYPES.QUESTIONS_LOADED: {
      // 只有正在等出題時才接受。已經在答題或已答完的狀態收到晚到的回應時必須是
      // no-op —— 否則它就成了 answers 的第二條清空路徑(REL-1 禁止)。
      if (state.phase !== 'loading_questions') return state
      const questions = Array.isArray(action.questions) ? action.questions : []
      if (questions.length !== QUESTION_COUNT) return state
      return {
        ...state,
        phase: 'interviewing',
        questions: questions.map((q, i) => ({ index: i, type: q.type, text: q.text })),
        answers: Array.from({ length: QUESTION_COUNT }, (_, i) => ({ index: i, text: null })),
        currentIndex: 0,
        draft: '',
        result: null,
        errorCode: null,
        errorStatus: null,
      }
    }

    case ACTION_TYPES.QUESTIONS_FAILED: {
      if (state.phase !== 'loading_questions') return state
      return {
        ...state,
        phase: 'questions_error',
        errorCode: action.code ?? null,
        errorStatus: action.status ?? null,
      }
    }

    case ACTION_TYPES.RETRY_QUESTIONS: {
      // D-19:重試是使用者按的,前端不自動重試。
      if (state.phase !== 'questions_error') return state
      return { ...state, phase: 'loading_questions', errorCode: null, errorStatus: null }
    }

    case ACTION_TYPES.UPDATE_DRAFT: {
      if (state.phase !== 'interviewing') return state
      return { ...state, draft: clampAnswer(action.text) }
    }

    case ACTION_TYPES.NEXT_QUESTION: {
      if (state.phase !== 'interviewing') return state
      const answers = commitDraft(state, state.draft)
      const last = isLastQuestion(state)
      return {
        ...state,
        answers,
        currentIndex: state.currentIndex + 1,
        draft: '',
        phase: last ? 'scoring' : 'interviewing',
      }
    }

    case ACTION_TYPES.SKIP_QUESTION: {
      // D-11:跳過的題 text 留成 null,不寫入 draft。
      if (state.phase !== 'interviewing') return state
      const last = isLastQuestion(state)
      return {
        ...state,
        currentIndex: state.currentIndex + 1,
        draft: '',
        phase: last ? 'scoring' : 'interviewing',
      }
    }

    case ACTION_TYPES.END_EARLY: {
      // D-07:已作答的題送去評分,未作答的維持 null。輸入框裡已經打好的字算「已作答」——
      // 把它默默丟掉正是 D-20 精神的反面。
      if (state.phase !== 'interviewing') return state
      return {
        ...state,
        answers: commitDraft(state, state.draft),
        draft: '',
        phase: 'scoring',
      }
    }

    case ACTION_TYPES.SCORING_SUCCEEDED: {
      if (state.phase !== 'scoring') return state
      return {
        ...state,
        phase: 'results',
        result: action.result ?? null,
        errorCode: null,
        errorStatus: null,
      }
    }

    case ACTION_TYPES.SCORING_FAILED: {
      // REL-1 的核心:只換 phase 與錯誤碼,answers / questions 一個字都不碰。
      if (state.phase !== 'scoring') return state
      return {
        ...state,
        phase: 'scoring_error',
        errorCode: action.code ?? null,
        errorStatus: action.status ?? null,
      }
    }

    case ACTION_TYPES.RETRY_SCORING: {
      // 同一份 state 再組一次 payload,內容與第一次逐字相同(AI-SPEC §6.3 前端契約 3)。
      if (state.phase !== 'scoring_error') return state
      return { ...state, phase: 'scoring', errorCode: null, errorStatus: null }
    }

    case ACTION_TYPES.RESTART_INTERVIEW: {
      // 全站唯一會清空 answers 的地方(REL-1 不變式)。語音偏好屬於使用者設定而非
      // 面試進度,刻意保留;語言保留成預選值,開場畫面仍可改。
      return {
        ...INITIAL_STATE,
        language: state.language,
        muted: state.muted,
        rate: state.rate,
      }
    }

    case ACTION_TYPES.SET_RATE: {
      if (!RATE_OPTIONS.includes(action.rate)) return state
      return { ...state, rate: action.rate }
    }

    case ACTION_TYPES.TOGGLE_MUTE: {
      return { ...state, muted: !state.muted }
    }

    default:
      return state
  }
}

// 評分請求的 body。純函式:只讀 state、不改 state,重試時由同一份 state 再呼叫一次,
// 結果逐字相同(AI-SPEC §6.3 前端契約 1 與 3)。
//
// 形狀對齊後端 POST /api/ai/interview/score 實測契約
// (backend/src/routes/ai.js:581-610):{ track, language, items:[{ type, text, skipped, answer }] × 5}。
// 未作答(text 為 null 或全空白)一律標成 skipped 並送空字串 —— 後端對「沒跳過卻空答」
// 回 400 INVALID_INPUT。
export function buildScoringPayload(state) {
  return {
    track: state.track,
    language: state.language,
    items: state.questions.map((q, i) => {
      const answer = state.answers[i] ? state.answers[i].text : null
      const answered = hasContent(answer)
      return {
        type: q.type,
        text: q.text,
        skipped: !answered,
        answer: answered ? answer : '',
      }
    }),
  }
}
