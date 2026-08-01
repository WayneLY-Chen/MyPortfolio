// 打字競速計分引擎的機器可驗證契約。
//
// 用 Node 內建的 node:test / node:assert/strict,不引入任何 npm 套件——
// frontend/package.json 目前沒有測試執行器、沒有 vitest/jest 相依,而
// typingEngine.js 刻意設計成零 React 依賴的 ESM 純函式模組,frontend/package.json
// 已宣告 "type": "module",Node 可以直接載入它。
//
// 執行方式必須指定檔案路徑而非目錄(已實測本機環境下 `node --test <目錄>` 會
// 失敗,報 MODULE_NOT_FOUND):
//   cd frontend && node --test src/components/typing-race/typingEngine.test.js
//
// describe 標題比照 backend/src/routes/faction.test.js 的既有風格,帶上對應的
// 決策編號,方便日後閱讀測試失敗訊息時直接對回決策來源。

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  toChars,
  markWrongIndices,
  isComplete,
  calcAccuracy,
  calcWpmEn,
  calcCpmZh,
  pickNextSentence,
  ACCURACY_THRESHOLD,
  SPEED_CAP,
  calcElapsedMs,
} from './typingEngine.js'

describe('D-11: 逐字切割依 code point,不用 split(\'\')', () => {
  it('toChars 對中英混排字串回傳正確長度的陣列', () => {
    // 注意:03-01-PLAN.md 的行為契約範例寫「toChars('你好abc') 回傳長度 6」,
    // 但 '你好abc' 依 code point 切割實際是 5 個字元(你/好/a/b/c)——這是計畫
    // 文件範例本身的筆誤(Rule 1 偏差,已記錄於 SUMMARY),此處斷言依真實行為。
    const chars = toChars('你好abc')
    assert.equal(chars.length, 5)
    assert.deepEqual(chars, ['你', '好', 'a', 'b', 'c'])
  })
})

describe('D-14: 曾經打錯就永久記錄,只增不刪', () => {
  it('先用錯字讓某索引進入 set,再用已改對的字串呼叫同一個 set,該索引仍留在 set 內', () => {
    const everWrong = new Set()
    markWrongIndices('你女', '你好', everWrong)
    assert.ok(everWrong.has(1))

    // 改對之後再呼叫一次同一個 set —— 已存在的索引不會被清除
    markWrongIndices('你好', '你好', everWrong)
    assert.ok(everWrong.has(1))
  })

  it('多打超出題目長度的字元不會被加入 set(比對長度取兩者較短者)', () => {
    const everWrong = new Set()
    markWrongIndices('你好嗎啊啊啊', '你好', everWrong)
    assert.equal(everWrong.size, 0)
    assert.ok(!everWrong.has(2))
    assert.ok(!everWrong.has(3))
  })
})

describe('D-13: 完成條件採整段完全相等(Pitfall 5)', () => {
  it('typed 與 target 完全相等時為 true', () => {
    assert.equal(isComplete('你好', '你好'), true)
  })

  it('中間有未修正錯字但長度相同時為 false', () => {
    assert.equal(isComplete('你女', '你好'), false)
  })

  it('長度不足時為 false', () => {
    assert.equal(isComplete('你', '你好'), false)
  })
})

describe('D-14: 正確率依曾經打錯的字數計算', () => {
  it('4 字題目錯 1 字時回傳 75', () => {
    assert.equal(calcAccuracy('你好世界', new Set([1])), 75)
  })

  it('零錯字時回傳 100', () => {
    assert.equal(calcAccuracy('你好', new Set()), 100)
  })

  it('空題目時回傳 100', () => {
    assert.equal(calcAccuracy('', new Set()), 100)
  })
})

describe('D-29: 英文採標準 WPM 公式(字元數 / 5 / 分鐘數)', () => {
  it('calcWpmEn(300, 60000) 回傳 60', () => {
    assert.equal(calcWpmEn(300, 60000), 60)
  })
})

describe('D-29: 中文採「字/分」原始值,明確不除以 5', () => {
  it('calcCpmZh(60, 60000) 回傳 60,而非 12', () => {
    assert.equal(calcCpmZh(60, 60000), 60)
  })
})

describe('除零保護:elapsedMs 為 0 時不得回傳 Infinity 或 NaN', () => {
  it('calcWpmEn(100, 0) 回傳 0', () => {
    assert.equal(calcWpmEn(100, 0), 0)
  })

  it('calcCpmZh(100, 0) 回傳 0', () => {
    assert.equal(calcCpmZh(100, 0), 0)
  })
})

describe('D-08: 抽題只避免連續重複上一題', () => {
  it('多元素陣列時,對整個索引範圍逐一驗證回傳值恆不等於 excludeIndex', () => {
    const list = [0, 1, 2, 3, 4, 5]
    for (let excludeIndex = 0; excludeIndex < list.length; excludeIndex++) {
      // 重複呼叫多次,確保隨機性下每一次結果都符合約束(決定性驗證,不靠機率碰運氣)
      for (let attempt = 0; attempt < 20; attempt++) {
        const next = pickNextSentence(list, excludeIndex)
        assert.notEqual(next, excludeIndex)
        assert.ok(next >= 0 && next < list.length)
      }
    }
  })

  it('單元素陣列回傳 0', () => {
    assert.equal(pickNextSentence(['only'], 0), 0)
  })
})

describe('D-22: 速度硬上限常數', () => {
  it('SPEED_CAP.typing_zh 為 150', () => {
    assert.equal(SPEED_CAP.typing_zh, 150)
  })

  it('SPEED_CAP.typing_en 為 250', () => {
    assert.equal(SPEED_CAP.typing_en, 250)
  })
})

describe('D-20: 正確率門檻常數', () => {
  it('ACCURACY_THRESHOLD 為 90', () => {
    assert.equal(ACCURACY_THRESHOLD, 90)
  })
})

describe('D-17: calcElapsedMs 排除暫停時間的算術', () => {
  it('startTime 為 null(尚未開始)時回傳 0', () => {
    assert.equal(calcElapsedMs({ now: 61000, startTime: null, totalPausedMs: 0, pausedAt: null }), 0)
  })

  it('未暫停過時回傳完整經過時間', () => {
    assert.equal(calcElapsedMs({ now: 61000, startTime: 1000, totalPausedMs: 0, pausedAt: null }), 60000)
  })

  it('曾暫停並已恢復時,扣除累積暫停時長', () => {
    assert.equal(calcElapsedMs({ now: 61000, startTime: 1000, totalPausedMs: 5000, pausedAt: null }), 55000)
  })

  it('目前正在暫停中時,連同進行中的這一段也即時扣除', () => {
    assert.equal(calcElapsedMs({ now: 61000, startTime: 1000, totalPausedMs: 0, pausedAt: 31000 }), 30000)
  })

  it('同時有歷史暫停與進行中暫停時,兩者都扣除', () => {
    assert.equal(calcElapsedMs({ now: 61000, startTime: 1000, totalPausedMs: 5000, pausedAt: 41000 }), 35000)
  })

  it('結果永不為負,即使參數組合異常導致算出負數', () => {
    assert.equal(calcElapsedMs({ now: 1000, startTime: 1000, totalPausedMs: 5000, pausedAt: null }), 0)
  })
})
