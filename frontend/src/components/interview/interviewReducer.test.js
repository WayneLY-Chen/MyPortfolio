// 面試狀態機的機器可驗證契約。
//
// 用 Node 內建的 node:test / node:assert/strict,不引入任何 npm 套件 ——
// frontend/package.json 沒有測試執行器,而 interviewReducer.js 刻意設計成零 React
// 依賴的 ESM 純模組,frontend/package.json 已宣告 "type": "module",Node 直接載得動。
//
// 執行方式必須指定檔案路徑而非目錄(本機實測 `node --test <目錄>` 會以
// MODULE_NOT_FOUND 失敗):
//   cd frontend && node --test src/components/interview/interviewReducer.test.js
//
// describe 標題帶上對應決策編號,比照 typing-race/typingEngine.test.js 的既有風格。
// 本檔最重要的一組是「REL-1」那三個 describe —— 它們是 D-20(答完五題卻評分失敗時
// 作答必須完好無損)唯一的機器保證。

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  INITIAL_STATE,
  ACTION_TYPES,
  TRACKS,
  LANGUAGES,
  QUESTION_COUNT,
  ANSWER_MAX_CHARS,
  RATE_OPTIONS,
  interviewReducer,
  buildScoringPayload,
  canStart,
  answeredCount,
} from './interviewReducer.js'

// ── 測試素材 ────────────────────────────────────────────────────────────────
const QUESTIONS = [
  { index: 0, type: 'technical', text: '第一題:說明一次你排查渲染效能問題的過程。' },
  { index: 1, type: 'technical', text: '第二題:你會怎麼決定快取放在哪一層?' },
  { index: 2, type: 'technical', text: '第三題:描述一個你做過的取捨。' },
  { index: 3, type: 'behavioral', text: '第四題:團隊意見不合時你怎麼處理?' },
  { index: 4, type: 'behavioral', text: '第五題:講一次你遇到困難的經驗。' },
]

// 走到 interviewing 的最短路徑
function startedState({ track = 'frontend', language = 'zh' } = {}) {
  let s = INITIAL_STATE
  s = interviewReducer(s, { type: ACTION_TYPES.SELECT_TRACK, track })
  s = interviewReducer(s, { type: ACTION_TYPES.SELECT_LANGUAGE, language })
  s = interviewReducer(s, { type: ACTION_TYPES.START_INTERVIEW })
  s = interviewReducer(s, { type: ACTION_TYPES.QUESTIONS_LOADED, questions: QUESTIONS })
  return s
}

// 五題全部作答完畢、已進入 scoring 的狀態
function filledState() {
  let s = startedState()
  for (let i = 0; i < QUESTION_COUNT; i += 1) {
    s = interviewReducer(s, { type: ACTION_TYPES.UPDATE_DRAFT, text: `第 ${i + 1} 題的作答內容` })
    s = interviewReducer(s, { type: ACTION_TYPES.NEXT_QUESTION })
  }
  return s
}

describe('D-26: 開場必須先選方向才能開始', () => {
  it('初始狀態 phase 為 setup、canStart 為 false', () => {
    assert.equal(INITIAL_STATE.phase, 'setup')
    assert.equal(canStart(INITIAL_STATE), false)
  })

  it('只選語言(預設已有值)仍不能開始 —— 方向是必要條件', () => {
    const s = interviewReducer(INITIAL_STATE, { type: ACTION_TYPES.SELECT_LANGUAGE, language: 'en' })
    assert.equal(s.language, 'en')
    assert.equal(canStart(s), false)
  })

  it('選了方向之後 canStart 為 true', () => {
    const s = interviewReducer(INITIAL_STATE, { type: ACTION_TYPES.SELECT_TRACK, track: 'fullstack' })
    assert.equal(s.track, 'fullstack')
    assert.equal(canStart(s), true)
  })

  it('不在白名單內的方向與語言一律被忽略', () => {
    const s1 = interviewReducer(INITIAL_STATE, { type: ACTION_TYPES.SELECT_TRACK, track: 'devops' })
    assert.equal(s1.track, null)
    const s2 = interviewReducer(INITIAL_STATE, { type: ACTION_TYPES.SELECT_LANGUAGE, language: 'jp' })
    assert.equal(s2.language, INITIAL_STATE.language)
  })

  it('TRACKS 與 LANGUAGES 與後端白名單一致', () => {
    assert.deepStrictEqual(TRACKS, ['frontend', 'backend', 'fullstack', 'fresher'])
    assert.deepStrictEqual(LANGUAGES, ['zh', 'en'])
  })
})

describe('D-02 / D-03: QUESTIONS_LOADED 帶入 5 題後進入 interviewing', () => {
  it('phase 轉為 interviewing,currentIndex 為 0,answers 是 5 個未作答項', () => {
    const s = startedState()
    assert.equal(s.phase, 'interviewing')
    assert.equal(s.currentIndex, 0)
    assert.equal(s.questions.length, QUESTION_COUNT)
    assert.deepStrictEqual(s.answers, [
      { index: 0, text: null },
      { index: 1, text: null },
      { index: 2, text: null },
      { index: 3, text: null },
      { index: 4, text: null },
    ])
  })

  it('題數不是 5 時不進 interviewing(後端契約違反時不讓畫面半殘)', () => {
    let s = interviewReducer(INITIAL_STATE, { type: ACTION_TYPES.SELECT_TRACK, track: 'backend' })
    s = interviewReducer(s, { type: ACTION_TYPES.START_INTERVIEW })
    const bad = interviewReducer(s, { type: ACTION_TYPES.QUESTIONS_LOADED, questions: QUESTIONS.slice(0, 3) })
    assert.equal(bad.phase, 'loading_questions')
    assert.deepStrictEqual(bad.answers, [])
  })

  it('出題失敗進 questions_error 並記下 code / status,重試回到 loading_questions', () => {
    let s = interviewReducer(INITIAL_STATE, { type: ACTION_TYPES.SELECT_TRACK, track: 'backend' })
    s = interviewReducer(s, { type: ACTION_TYPES.START_INTERVIEW })
    s = interviewReducer(s, { type: ACTION_TYPES.QUESTIONS_FAILED, code: 'AI_QUOTA', status: 503 })
    assert.equal(s.phase, 'questions_error')
    assert.equal(s.errorCode, 'AI_QUOTA')
    assert.equal(s.errorStatus, 503)

    s = interviewReducer(s, { type: ACTION_TYPES.RETRY_QUESTIONS })
    assert.equal(s.phase, 'loading_questions')
    assert.equal(s.errorCode, null)
    assert.equal(s.errorStatus, null)
  })
})

describe('D-08: 作答上限 500 字,draft 不會超限', () => {
  it('超過 500 字的輸入被截斷在 500', () => {
    const s = startedState()
    const long = '字'.repeat(600)
    const next = interviewReducer(s, { type: ACTION_TYPES.UPDATE_DRAFT, text: long })
    assert.equal(Array.from(next.draft).length, ANSWER_MAX_CHARS)
    // 後端擋的是 String.length,截斷後也必須同時滿足這個口徑
    assert.ok(next.draft.length <= ANSWER_MAX_CHARS)
  })

  it('恰好 500 字原樣保留', () => {
    const s = startedState()
    const exact = '字'.repeat(ANSWER_MAX_CHARS)
    const next = interviewReducer(s, { type: ACTION_TYPES.UPDATE_DRAFT, text: exact })
    assert.equal(next.draft, exact)
  })

  it('截斷後的作答寫進 answers 也不超限', () => {
    let s = startedState()
    s = interviewReducer(s, { type: ACTION_TYPES.UPDATE_DRAFT, text: '字'.repeat(900) })
    s = interviewReducer(s, { type: ACTION_TYPES.NEXT_QUESTION })
    assert.equal(s.answers[0].text.length, ANSWER_MAX_CHARS)
  })
})

describe('D-05: 作答推進是單向的,沒有任何動作能回到上一題', () => {
  it('NEXT_QUESTION 把 draft 寫進當題並 +1,draft 清空', () => {
    let s = startedState()
    s = interviewReducer(s, { type: ACTION_TYPES.UPDATE_DRAFT, text: '我的第一段回答' })
    s = interviewReducer(s, { type: ACTION_TYPES.NEXT_QUESTION })
    assert.equal(s.currentIndex, 1)
    assert.equal(s.answers[0].text, '我的第一段回答')
    assert.equal(s.draft, '')
  })

  it('對每一個 action type 各發一次,currentIndex 從不變小', () => {
    let s = startedState()
    s = interviewReducer(s, { type: ACTION_TYPES.UPDATE_DRAFT, text: '答案一' })
    s = interviewReducer(s, { type: ACTION_TYPES.NEXT_QUESTION })
    s = interviewReducer(s, { type: ACTION_TYPES.SKIP_QUESTION })
    const base = s
    assert.equal(base.currentIndex, 2)

    for (const type of Object.values(ACTION_TYPES)) {
      if (type === ACTION_TYPES.RESTART_INTERVIEW) continue // 重新面試本來就是整場歸零
      const next = interviewReducer(base, sampleAction(type))
      assert.ok(
        next.currentIndex >= base.currentIndex,
        `${type} 讓 currentIndex 從 ${base.currentIndex} 退回 ${next.currentIndex}`
      )
    }
  })

  it('ACTION_TYPES 裡沒有任何「上一題」動作', () => {
    const names = Object.keys(ACTION_TYPES).join(' ').toUpperCase()
    assert.ok(!names.includes('PREV'))
    assert.ok(!names.includes('BACK'))
  })

  it('第 5 題送出後進入 scoring', () => {
    const s = filledState()
    assert.equal(s.phase, 'scoring')
    assert.equal(answeredCount(s), 5)
  })
})

describe('D-11: 跳過的題留成 null', () => {
  it('SKIP_QUESTION 不寫入文字並 +1', () => {
    let s = startedState()
    s = interviewReducer(s, { type: ACTION_TYPES.UPDATE_DRAFT, text: '打到一半又不想答了' })
    s = interviewReducer(s, { type: ACTION_TYPES.SKIP_QUESTION })
    assert.equal(s.currentIndex, 1)
    assert.equal(s.answers[0].text, null)
    assert.equal(s.draft, '')
  })

  it('空白作答按下一題視同未作答(後端會擋空字串)', () => {
    let s = startedState()
    s = interviewReducer(s, { type: ACTION_TYPES.UPDATE_DRAFT, text: '   \n  ' })
    s = interviewReducer(s, { type: ACTION_TYPES.NEXT_QUESTION })
    assert.equal(s.answers[0].text, null)
  })

  it('跳過的題在送評分的 payload 裡是 skipped:true 且 answer 為空字串', () => {
    let s = startedState()
    s = interviewReducer(s, { type: ACTION_TYPES.UPDATE_DRAFT, text: '有答' })
    s = interviewReducer(s, { type: ACTION_TYPES.NEXT_QUESTION })
    s = interviewReducer(s, { type: ACTION_TYPES.SKIP_QUESTION })
    s = interviewReducer(s, { type: ACTION_TYPES.SKIP_QUESTION })
    s = interviewReducer(s, { type: ACTION_TYPES.SKIP_QUESTION })
    s = interviewReducer(s, { type: ACTION_TYPES.SKIP_QUESTION })
    const payload = buildScoringPayload(s)
    assert.equal(payload.items.length, QUESTION_COUNT)
    assert.deepStrictEqual(payload.items[0], {
      type: 'technical',
      text: QUESTIONS[0].text,
      skipped: false,
      answer: '有答',
    })
    assert.deepStrictEqual(payload.items[1], {
      type: 'technical',
      text: QUESTIONS[1].text,
      skipped: true,
      answer: '',
    })
  })
})

describe('D-07: 提前結束把已作答的送去評分,未作答的以 null 標記', () => {
  it('第 2 題時提前結束,phase 進 scoring,已作答保留、其餘為 null', () => {
    let s = startedState()
    s = interviewReducer(s, { type: ACTION_TYPES.UPDATE_DRAFT, text: '第一題答完' })
    s = interviewReducer(s, { type: ACTION_TYPES.NEXT_QUESTION })
    s = interviewReducer(s, { type: ACTION_TYPES.UPDATE_DRAFT, text: '第二題打到一半' })
    s = interviewReducer(s, { type: ACTION_TYPES.END_EARLY })

    assert.equal(s.phase, 'scoring')
    assert.equal(s.answers[0].text, '第一題答完')
    // 已經打進輸入框的字不算「未作答」—— 直接丟掉才是 D-20 精神的反面
    assert.equal(s.answers[1].text, '第二題打到一半')
    assert.equal(s.answers[2].text, null)
    assert.equal(s.answers[3].text, null)
    assert.equal(s.answers[4].text, null)
    assert.equal(answeredCount(s), 2)
  })

  it('一題都沒答就提前結束,五題皆為 null 且仍可送出', () => {
    const s = interviewReducer(startedState(), { type: ACTION_TYPES.END_EARLY })
    assert.equal(s.phase, 'scoring')
    assert.equal(answeredCount(s), 0)
    const payload = buildScoringPayload(s)
    assert.equal(payload.items.every((it) => it.skipped === true), true)
  })
})

describe('REL-1 / D-20: 評分失敗後五段作答逐字不變', () => {
  it('SCORING_FAILED 後 phase 為 scoring_error,answers 與失敗前深度相等', () => {
    const before = filledState()
    const snapshot = JSON.parse(JSON.stringify(before.answers))
    const after = interviewReducer(before, {
      type: ACTION_TYPES.SCORING_FAILED,
      code: 'SCORE_TIMEOUT',
      status: 504,
    })
    assert.equal(after.phase, 'scoring_error')
    assert.equal(after.errorCode, 'SCORE_TIMEOUT')
    assert.equal(after.errorStatus, 504)
    assert.deepStrictEqual(after.answers, snapshot)
    assert.deepStrictEqual(after.questions, before.questions)
  })

  it('RETRY_SCORING 的 payload 與第一次深度相等,且不改寫 state.answers', () => {
    const scoring = filledState()
    const firstPayload = buildScoringPayload(scoring)

    const failed = interviewReducer(scoring, {
      type: ACTION_TYPES.SCORING_FAILED,
      code: 'SCORE_PARSE_FAILED',
      status: 502,
    })
    const retrying = interviewReducer(failed, { type: ACTION_TYPES.RETRY_SCORING })
    assert.equal(retrying.phase, 'scoring')
    assert.equal(retrying.errorCode, null)

    const secondPayload = buildScoringPayload(retrying)
    assert.deepStrictEqual(secondPayload, firstPayload)
    // buildScoringPayload 是純函式:呼叫兩次不得動到 state
    assert.deepStrictEqual(retrying.answers, scoring.answers)
  })

  it('buildScoringPayload 不共用 answers 的物件參考(呼叫端改 payload 動不到 state)', () => {
    const s = filledState()
    const payload = buildScoringPayload(s)
    payload.items[0].answer = '被呼叫端竄改'
    assert.notEqual(s.answers[0].text, '被呼叫端竄改')
  })

  it('payload 形狀符合後端 /ai/interview/score 的契約', () => {
    const s = filledState()
    const payload = buildScoringPayload(s)
    assert.deepStrictEqual(Object.keys(payload).sort(), ['items', 'language', 'track'])
    assert.equal(payload.track, 'frontend')
    assert.equal(payload.language, 'zh')
    assert.equal(payload.items.length, QUESTION_COUNT)
    for (const it of payload.items) {
      assert.deepStrictEqual(Object.keys(it).sort(), ['answer', 'skipped', 'text', 'type'])
      assert.ok(['technical', 'behavioral'].includes(it.type))
      assert.ok(typeof it.text === 'string' && it.text.trim().length > 0)
      assert.equal(typeof it.skipped, 'boolean')
      assert.equal(typeof it.answer, 'string')
      assert.ok(it.answer.length <= ANSWER_MAX_CHARS)
      // 後端對「沒跳過卻空答」回 400,前端不得送出這種組合
      if (!it.skipped) assert.ok(it.answer.trim().length > 0)
    }
  })
})

// 每個 action type 的最小合法 payload。新增 action type 卻忘了在這裡補一筆時,
// 下面的不變式測試會直接失敗 —— 這是刻意的:漏掉的那個 type 正是最可能沒顧到
// 「保留作答」的那一個。
function sampleAction(type) {
  switch (type) {
    case ACTION_TYPES.SELECT_TRACK: return { type, track: 'backend' }
    case ACTION_TYPES.SELECT_LANGUAGE: return { type, language: 'en' }
    case ACTION_TYPES.START_INTERVIEW: return { type }
    case ACTION_TYPES.QUESTIONS_LOADED: return { type, questions: QUESTIONS }
    case ACTION_TYPES.QUESTIONS_FAILED: return { type, code: 'AI_BUSY', status: 503 }
    case ACTION_TYPES.RETRY_QUESTIONS: return { type }
    case ACTION_TYPES.UPDATE_DRAFT: return { type, text: '一段新的草稿' }
    case ACTION_TYPES.NEXT_QUESTION: return { type }
    case ACTION_TYPES.SKIP_QUESTION: return { type }
    case ACTION_TYPES.END_EARLY: return { type }
    case ACTION_TYPES.SCORING_SUCCEEDED: return { type, result: { overallScore: 70, rating: '良好', summary: '總評', perQuestion: [] } }
    case ACTION_TYPES.SCORING_FAILED: return { type, code: 'AI_QUOTA', status: 503 }
    case ACTION_TYPES.RETRY_SCORING: return { type }
    case ACTION_TYPES.RESTART_INTERVIEW: return { type }
    case ACTION_TYPES.SET_RATE: return { type, rate: 1.25 }
    case ACTION_TYPES.TOGGLE_MUTE: return { type }
    default: throw new Error(`sampleAction 沒有涵蓋 action type: ${type}`)
  }
}

describe('REL-1 不變式: answers 只會被 RESTART_INTERVIEW 清空', () => {
  const bases = [
    ['答完五題等待評分', filledState()],
    ['評分失敗', interviewReducer(filledState(), { type: ACTION_TYPES.SCORING_FAILED, code: 'AI_BUSY', status: 503 })],
    ['已拿到結果', interviewReducer(filledState(), { type: ACTION_TYPES.SCORING_SUCCEEDED, result: { overallScore: 70 } })],
    ['面試進行到第三題', (() => {
      let s = startedState()
      s = interviewReducer(s, { type: ACTION_TYPES.UPDATE_DRAFT, text: '第一段' })
      s = interviewReducer(s, { type: ACTION_TYPES.NEXT_QUESTION })
      s = interviewReducer(s, { type: ACTION_TYPES.SKIP_QUESTION })
      return s
    })()],
  ]

  for (const [label, base] of bases) {
    it(`${label}:遍歷所有 action type,只有 RESTART_INTERVIEW 動得了 answers`, () => {
      for (const type of Object.values(ACTION_TYPES)) {
        const next = interviewReducer(base, sampleAction(type))
        if (type === ACTION_TYPES.RESTART_INTERVIEW) {
          assert.deepStrictEqual(next.answers, [], 'RESTART_INTERVIEW 應該清空 answers')
          assert.equal(next.phase, 'setup')
        } else {
          assert.deepStrictEqual(
            next.answers,
            base.answers,
            `${type} 改動了 answers —— 這是 REL-1 明文禁止的第二條清空/改寫路徑`
          )
        }
      }
    })
  }

  it('未知的 action type 原樣回傳同一個 state', () => {
    const base = filledState()
    assert.equal(interviewReducer(base, { type: 'NOT_A_REAL_ACTION' }), base)
  })

  it('RESTART_INTERVIEW 之後保留語音偏好(靜音與語速),其餘歸零', () => {
    let s = filledState()
    s = interviewReducer(s, { type: ACTION_TYPES.TOGGLE_MUTE })
    s = interviewReducer(s, { type: ACTION_TYPES.SET_RATE, rate: 1.25 })
    const restarted = interviewReducer(s, { type: ACTION_TYPES.RESTART_INTERVIEW })
    assert.equal(restarted.phase, 'setup')
    assert.equal(restarted.track, null)
    assert.deepStrictEqual(restarted.questions, [])
    assert.deepStrictEqual(restarted.answers, [])
    assert.equal(restarted.currentIndex, 0)
    assert.equal(restarted.draft, '')
    assert.equal(restarted.result, null)
    assert.equal(restarted.muted, true)
    assert.equal(restarted.rate, 1.25)
  })
})

describe('D-16: 語速三段與靜音切換', () => {
  it('RATE_OPTIONS 就是 0.75 / 1 / 1.25', () => {
    assert.deepStrictEqual(RATE_OPTIONS, [0.75, 1, 1.25])
  })

  it('SET_RATE 只接受白名單內的三個值', () => {
    const base = startedState()
    for (const rate of RATE_OPTIONS) {
      assert.equal(interviewReducer(base, { type: ACTION_TYPES.SET_RATE, rate }).rate, rate)
    }
    for (const bad of [0.5, 2, '1.25', null, undefined, NaN]) {
      assert.equal(interviewReducer(base, { type: ACTION_TYPES.SET_RATE, rate: bad }).rate, base.rate)
    }
  })

  it('TOGGLE_MUTE 純翻轉', () => {
    const base = startedState()
    const muted = interviewReducer(base, { type: ACTION_TYPES.TOGGLE_MUTE })
    assert.equal(muted.muted, true)
    assert.equal(interviewReducer(muted, { type: ACTION_TYPES.TOGGLE_MUTE }).muted, false)
  })
})

describe('D-22: 不做任何持久化', () => {
  it('模組原始碼裡沒有 localStorage / sessionStorage', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(new URL('./interviewReducer.js', import.meta.url), 'utf8')
    assert.ok(!src.includes('localStorage'))
    assert.ok(!src.includes('sessionStorage'))
  })
})
