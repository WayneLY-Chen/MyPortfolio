// 錯誤卡文案對照表的逐字契約。
//
//   cd frontend && node --test src/components/interview/interviewErrors.test.js
//
// 這裡一律用 deepStrictEqual 比對整個回傳物件,不用 includes —— 文案本身就是契約
// (05-UI-SPEC.md 的「Error Card Contract」與「Additional UI Strings」已 APPROVED),
// 潤飾一個字都算違約,所以測試要能抓到「只差一個標點」這種改動。

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveInterviewError, INTERVIEW_ERROR_CODES } from './interviewErrors.js'

describe('出題失敗:標題固定「出題失敗」、按鈕固定「重試」', () => {
  it('AI_QUOTA → 配額用完', () => {
    assert.deepStrictEqual(resolveInterviewError({ stage: 'questions', status: 503, code: 'AI_QUOTA' }), {
      eyebrow: '配額用完',
      title: '出題失敗',
      body: 'AI 配額暫時用完了,請稍後再試。',
      buttonLabel: '重試',
    })
  })

  it('AI_BUSY → 伺服器繁忙 /「現在使用的人太多」', () => {
    assert.deepStrictEqual(resolveInterviewError({ stage: 'questions', status: 503, code: 'AI_BUSY' }), {
      eyebrow: '伺服器繁忙',
      title: '出題失敗',
      body: '現在使用的人太多,請稍後再試。',
      buttonLabel: '重試',
    })
  })

  it('AI_UNAVAILABLE → 伺服器繁忙 /「AI 服務暫時無法使用」', () => {
    assert.deepStrictEqual(resolveInterviewError({ stage: 'questions', status: 500, code: 'AI_UNAVAILABLE' }), {
      eyebrow: '伺服器繁忙',
      title: '出題失敗',
      body: 'AI 服務暫時無法使用,請稍後再試。',
      buttonLabel: '重試',
    })
  })

  it('QUESTIONS_TIMEOUT 沿用既有的「伺服器繁忙」文案,不發明新的', () => {
    assert.deepStrictEqual(resolveInterviewError({ stage: 'questions', status: 504, code: 'QUESTIONS_TIMEOUT' }), {
      eyebrow: '伺服器繁忙',
      title: '出題失敗',
      body: 'AI 服務暫時無法使用,請稍後再試。',
      buttonLabel: '重試',
    })
  })

  it('QUESTIONS_PARSE_FAILED 同上', () => {
    assert.deepStrictEqual(resolveInterviewError({ stage: 'questions', status: 502, code: 'QUESTIONS_PARSE_FAILED' }), {
      eyebrow: '伺服器繁忙',
      title: '出題失敗',
      body: 'AI 服務暫時無法使用,請稍後再試。',
      buttonLabel: '重試',
    })
  })
})

describe('D-20: 評分失敗的標題與按鈕固定,不隨 code 變化', () => {
  it('SCORE_PARSE_FAILED → 格式異常', () => {
    assert.deepStrictEqual(resolveInterviewError({ stage: 'scoring', status: 502, code: 'SCORE_PARSE_FAILED' }), {
      eyebrow: '格式異常',
      title: '評分暫時失敗,你的作答都還在',
      body: '評分結果格式異常,你的作答都還在,請按重試',
      buttonLabel: '重試評分',
    })
  })

  it('SCORE_TIMEOUT → 逾時', () => {
    assert.deepStrictEqual(resolveInterviewError({ stage: 'scoring', status: 504, code: 'SCORE_TIMEOUT' }), {
      eyebrow: '逾時',
      title: '評分暫時失敗,你的作答都還在',
      body: '評分花的時間太久了,你的作答都還在,請按重試',
      buttonLabel: '重試評分',
    })
  })

  it('UI-SPEC 寫作 SCORING_* 的別名對應到同一組文案', () => {
    assert.deepStrictEqual(
      resolveInterviewError({ stage: 'scoring', status: 502, code: 'SCORING_PARSE_FAILED' }),
      resolveInterviewError({ stage: 'scoring', status: 502, code: 'SCORE_PARSE_FAILED' })
    )
    assert.deepStrictEqual(
      resolveInterviewError({ stage: 'scoring', status: 504, code: 'SCORING_TIMEOUT' }),
      resolveInterviewError({ stage: 'scoring', status: 504, code: 'SCORE_TIMEOUT' })
    )
  })

  it('不論哪一個 code,評分階段的 title 與按鈕都不變', () => {
    const codes = [
      'AI_QUOTA', 'AI_BUSY', 'AI_UNAVAILABLE', 'RATE_LIMITED',
      'SCORE_TIMEOUT', 'SCORE_PARSE_FAILED', 'NETWORK', 'INVALID_INPUT', undefined,
    ]
    for (const code of codes) {
      const card = resolveInterviewError({ stage: 'scoring', status: 500, code })
      assert.equal(card.title, '評分暫時失敗,你的作答都還在', `code=${code}`)
      assert.equal(card.buttonLabel, '重試評分', `code=${code}`)
    }
  })

  it('共用的 code 在兩個階段內文相同,只有 title / 按鈕不同', () => {
    const q = resolveInterviewError({ stage: 'questions', status: 503, code: 'AI_QUOTA' })
    const s = resolveInterviewError({ stage: 'scoring', status: 503, code: 'AI_QUOTA' })
    assert.equal(q.body, s.body)
    assert.equal(q.eyebrow, s.eyebrow)
    assert.notEqual(q.title, s.title)
  })
})

describe('D-23: 429 必須與其他錯誤明確區分', () => {
  it('code 為 RATE_LIMITED 時走專屬那一組', () => {
    assert.deepStrictEqual(resolveInterviewError({ stage: 'questions', status: 429, code: 'RATE_LIMITED' }), {
      eyebrow: '請求過於頻繁',
      title: '出題失敗',
      body: '你在這一小時內的 AI 使用次數已達上限,請稍後再試。',
      buttonLabel: '重試',
    })
  })

  it('後端限流的 429 回應沒有 code 欄位,單憑 status 也要判得出來', () => {
    // backend/src/middlewares/rateLimiters.js 的 429 body 是
    // { success:false, message:'請求過於頻繁,請稍後再試' } —— 沒有 code。
    const card = resolveInterviewError({ stage: 'scoring', status: 429, code: null })
    assert.equal(card.eyebrow, '請求過於頻繁')
    assert.equal(card.body, '你在這一小時內的 AI 使用次數已達上限,請稍後再試。')
  })

  it('429 的 eyebrow 與其他四類都不同', () => {
    const rate = resolveInterviewError({ stage: 'questions', status: 429 }).eyebrow
    const others = ['AI_QUOTA', 'AI_BUSY', 'AI_UNAVAILABLE', 'NETWORK'].map(
      (code) => resolveInterviewError({ stage: 'questions', status: 500, code }).eyebrow
    )
    assert.ok(!others.includes(rate))
  })
})

describe('前端 fetch 拋出(無回應)→ 網路問題', () => {
  it('NETWORK / status 0', () => {
    assert.deepStrictEqual(resolveInterviewError({ stage: 'questions', status: 0, code: 'NETWORK' }), {
      eyebrow: '網路問題',
      title: '出題失敗',
      body: '無法連上伺服器,請確認網路連線後再試。',
      buttonLabel: '重試',
    })
  })

  it('評分階段的網路問題保留 D-20 的標題', () => {
    assert.deepStrictEqual(resolveInterviewError({ stage: 'scoring', status: 0, code: 'NETWORK' }), {
      eyebrow: '網路問題',
      title: '評分暫時失敗,你的作答都還在',
      body: '無法連上伺服器,請確認網路連線後再試。',
      buttonLabel: '重試評分',
    })
  })
})

describe('未知 code 一律落到 AI_UNAVAILABLE,永遠不回 undefined 或空字串', () => {
  it('沒見過的 code', () => {
    assert.deepStrictEqual(resolveInterviewError({ stage: 'questions', status: 500, code: 'WAT_IS_THIS' }), {
      eyebrow: '伺服器繁忙',
      title: '出題失敗',
      body: 'AI 服務暫時無法使用,請稍後再試。',
      buttonLabel: '重試',
    })
  })

  it('完全沒帶參數也回得出一張完整的卡', () => {
    const card = resolveInterviewError()
    for (const key of ['eyebrow', 'title', 'body', 'buttonLabel']) {
      assert.equal(typeof card[key], 'string')
      assert.ok(card[key].length > 0, `${key} 不得為空字串`)
    }
  })

  it('後端所有已知 code 在兩個階段都回得出非空的四個欄位', () => {
    const codes = [...INTERVIEW_ERROR_CODES, 'INVALID_INPUT', 'ANSWER_TOO_LONG', null, undefined]
    for (const stage of ['questions', 'scoring']) {
      for (const code of codes) {
        const card = resolveInterviewError({ stage, status: 500, code })
        for (const key of ['eyebrow', 'title', 'body', 'buttonLabel']) {
          assert.equal(typeof card[key], 'string', `${stage}/${code}/${key}`)
          assert.ok(card[key].length > 0, `${stage}/${code}/${key} 為空`)
        }
      }
    }
  })
})
