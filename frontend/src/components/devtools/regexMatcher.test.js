// regexMatcher.js 的行為契約(FEAT-10 正則測試工具)。
//
// 執行方式(frontend/package.json 沒有 test script,本階段一律指名檔案):
//   cd frontend && node --test src/components/devtools/regexMatcher.test.js
//
// 【為什麼這支測試特別重要】
// 這個模組的程式碼實際執行的位置是 Web Worker 執行緒(regexWorker.js)。Worker 裡面
// 的無窮迴圈不會噴例外、不會留下堆疊,只會表現成「每一次比對都在 1000ms 後逾時」——
// 從畫面上看跟「使用者寫了一個很慢的正則」一模一樣,幾乎不可能追。所以零寬匹配那幾條
// 一定要在這裡被擋下來,而不是等到 Worker 裡才發現。
//
// 【對付「掛住而不是失敗」】
// 迴圈失控的測試預設會整支掛住(node:test 沒有預設逾時),CI 上看到的是 timeout
// 而不是斷言失敗。兩道保險:
//   1. 實作端有 MAX_MATCHES 上限,失控時會回傳被截斷的結果而不是永遠不回來。
//   2. 這裡每一條零寬測試都先斷言筆數上限,再斷言確切筆數 —— 先炸的是上限那一條,
//      訊息會直接寫著「疑似無窮迴圈」。
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MAX_MATCHES,
  REGEX_TIMEOUT_MS,
  buildSegments,
  parsePatternInput,
  runRegexMatch,
} from './regexMatcher.js'

/** 所有片段串接後的文字。highlight 不漏字、不重字的唯一判準。 */
function concatSegments(segments) {
  return segments.map((s) => s.text).join('')
}

describe('D-24: 逾時門檻是 1000ms 整數,元件不得另寫字面值', () => {
  it('REGEX_TIMEOUT_MS 恰為 1000', () => {
    assert.equal(REGEX_TIMEOUT_MS, 1000)
    assert.equal(typeof REGEX_TIMEOUT_MS, 'number')
  })
})

describe('D-23: buildSegments 把文字切成命中與未命中的片段', () => {
  it('沒有任何命中時,合併後文字仍為原文', () => {
    const segments = buildSegments('abc', [])
    assert.equal(concatSegments(segments), 'abc')
    assert.equal(segments.length, 1)
    assert.equal(segments[0].matched, false)
  })

  it('命中在中間時切成三段,中間那段 matched 為 true', () => {
    const segments = buildSegments('abc', [{ index: 1, length: 1 }])
    assert.equal(segments.length, 3)
    assert.deepEqual(segments[0], { text: 'a', matched: false })
    assert.deepEqual(segments[1], { text: 'b', matched: true })
    assert.deepEqual(segments[2], { text: 'c', matched: false })
  })

  it('命中位於字串開頭時,不得產生長度為 0 的前導未命中片段', () => {
    const segments = buildSegments('abc', [{ index: 0, length: 1 }])
    assert.equal(segments.length, 2)
    assert.equal(segments[0].matched, true)
    assert.equal(segments[0].text, 'a')
    for (const s of segments) assert.notEqual(s.text, '')
  })

  it('命中位於字串結尾時,不得產生長度為 0 的尾隨未命中片段', () => {
    const segments = buildSegments('abc', [{ index: 2, length: 1 }])
    assert.equal(segments.length, 2)
    assert.equal(segments[1].matched, true)
    assert.equal(segments[1].text, 'c')
    for (const s of segments) assert.notEqual(s.text, '')
  })

  it('整串命中時只有一段', () => {
    const segments = buildSegments('abc', [{ index: 0, length: 3 }])
    assert.deepEqual(segments, [{ text: 'abc', matched: true }])
  })

  it('多筆相鄰命中之間不插入空的未命中片段', () => {
    const segments = buildSegments('ab', [
      { index: 0, length: 1 },
      { index: 1, length: 1 },
    ])
    assert.deepEqual(segments, [
      { text: 'a', matched: true },
      { text: 'b', matched: true },
    ])
  })

  it('零寬命中不產生空的 matched 片段(否則畫面上會是幾千個看不見的空標記)', () => {
    const segments = buildSegments('abc', [{ index: 1, length: 0 }])
    assert.equal(concatSegments(segments), 'abc')
    for (const s of segments) assert.notEqual(s.text, '')
  })

  it('空字串不丟例外', () => {
    assert.deepEqual(buildSegments('', []), [])
  })

  it('property:任何情況下所有片段依序串接都等於原始 text', () => {
    const cases = [
      ['', []],
      ['abc', []],
      ['abc', [{ index: 0, length: 3 }]],
      ['a1b22c', [{ index: 1, length: 1 }, { index: 3, length: 2 }]],
      ['你好,世界', [{ index: 0, length: 2 }, { index: 3, length: 2 }]],
      ['aaa', [{ index: 0, length: 0 }, { index: 1, length: 0 }, { index: 2, length: 0 }]],
      ['x'.repeat(50), [{ index: 10, length: 5 }, { index: 40, length: 10 }]],
    ]
    for (const [text, matches] of cases) {
      assert.equal(
        concatSegments(buildSegments(text, matches)),
        text,
        `串接結果與原文不符:${JSON.stringify(text)}`
      )
    }
  })
})

describe('D-23: runRegexMatch 逐筆回傳 match 與它的捕獲群組', () => {
  it('全域比對回傳每一筆命中的 index 與值', () => {
    const result = runRegexMatch('\\d+', 'g', 'a1b22c')
    assert.equal(result.ok, true)
    assert.equal(result.matches.length, 2)
    assert.equal(result.matches[0].index, 1)
    assert.equal(result.matches[0].value, '1')
    assert.equal(result.matches[0].length, 1)
    assert.equal(result.matches[1].index, 3)
    assert.equal(result.matches[1].value, '22')
    assert.equal(result.matches[1].length, 2)
  })

  it('每一筆 match 帶有捕獲群組陣列', () => {
    const result = runRegexMatch('(\\w)(\\d)', 'g', 'a1 b2')
    assert.equal(result.matches.length, 2)
    assert.deepEqual(result.matches[0].groups, ['a', '1'])
    assert.deepEqual(result.matches[1].groups, ['b', '2'])
  })

  it('沒有捕獲群組時 groups 為空陣列,不是 undefined', () => {
    const result = runRegexMatch('\\d+', 'g', 'a1')
    assert.deepEqual(result.matches[0].groups, [])
  })

  it('未參與比對的選擇性群組回傳 null(undefined 會在結構化複製後變得難以辨識)', () => {
    const result = runRegexMatch('(a)?(b)', 'g', 'b')
    assert.deepEqual(result.matches[0].groups, [null, 'b'])
  })

  it('具名群組一併回傳', () => {
    const result = runRegexMatch('(?<year>\\d{4})-(?<month>\\d{2})', 'g', '訂於 2026-08 出貨')
    assert.equal(result.matches.length, 1)
    assert.deepEqual(result.matches[0].namedGroups, { year: '2026', month: '08' })
    assert.deepEqual(result.matches[0].groups, ['2026', '08'])
  })

  it('沒有具名群組時 namedGroups 為 null', () => {
    const result = runRegexMatch('(\\d)', 'g', 'a1')
    assert.equal(result.matches[0].namedGroups, null)
  })

  it('segments 與 matches 一致,且串接後等於測試文字', () => {
    const text = 'a1b22c'
    const result = runRegexMatch('\\d+', 'g', text)
    assert.equal(concatSegments(result.segments), text)
    assert.deepEqual(
      result.segments.filter((s) => s.matched).map((s) => s.text),
      ['1', '22']
    )
  })
})

describe('D-19/D-22: 無窮迴圈與失控輸入必須以失敗呈現,不得掛住 Worker', () => {
  it('未帶 g 旗標時只回傳第一筆,且不進入無窮迴圈', () => {
    const result = runRegexMatch('\\d+', '', 'a1b22c')
    assert.ok(
      result.matches.length <= 4,
      `疑似無窮迴圈:非全域比對回傳了 ${result.matches.length} 筆`
    )
    assert.equal(result.matches.length, 1)
    assert.equal(result.matches[0].value, '1')
  })

  it("零寬匹配 'a*' 配 'bbb' 不會卡死,每個位置各一筆", () => {
    const result = runRegexMatch('a*', 'g', 'bbb')
    assert.ok(
      result.matches.length <= 16,
      `疑似無窮迴圈:回傳了 ${result.matches.length} 筆零寬匹配`
    )
    assert.equal(result.matches.length, 4)
    for (const m of result.matches) assert.equal(m.length, 0)
    assert.equal(concatSegments(result.segments), 'bbb')
  })

  it("零寬前瞻 '(?=b)' 不會卡死", () => {
    const result = runRegexMatch('(?=b)', 'g', 'abcb')
    assert.ok(result.matches.length <= 16, `疑似無窮迴圈:回傳了 ${result.matches.length} 筆`)
    assert.equal(result.matches.length, 2)
    assert.deepEqual(result.matches.map((m) => m.index), [1, 3])
  })

  it('命中筆數超過 MAX_MATCHES 時截斷並標記,而不是無上限累積', () => {
    const result = runRegexMatch('x*', 'g', 'b'.repeat(MAX_MATCHES + 500))
    assert.equal(result.matches.length, MAX_MATCHES)
    assert.equal(result.truncated, true)
    assert.equal(concatSegments(result.segments).length, MAX_MATCHES + 500)
  })

  it('MAX_MATCHES 是一個有限的正整數', () => {
    assert.ok(Number.isInteger(MAX_MATCHES) && MAX_MATCHES > 0 && MAX_MATCHES < 1e6)
  })
})

describe('D-23: 非法 pattern 回傳錯誤旗標,絕不丟例外', () => {
  it("'(' 不丟例外,回傳 ok: false 與錯誤資訊", () => {
    let result
    assert.doesNotThrow(() => {
      result = runRegexMatch('(', 'g', 'abc')
    })
    assert.equal(result.ok, false)
    assert.equal(result.error.kind, 'invalid-pattern')
    assert.equal(typeof result.error.raw, 'string')
    assert.ok(result.error.raw.length > 0)
    assert.deepEqual(result.matches, [])
  })

  it('非法旗標不丟例外', () => {
    let result
    assert.doesNotThrow(() => {
      result = runRegexMatch('a', 'gz', 'abc')
    })
    assert.equal(result.ok, false)
    assert.equal(result.error.kind, 'invalid-pattern')
  })

  it('空 pattern 視為尚未輸入,不是錯誤', () => {
    const result = runRegexMatch('', 'g', 'abc')
    assert.equal(result.ok, true)
    assert.equal(result.empty, true)
    assert.deepEqual(result.matches, [])
  })

  it('沒有任何命中時 ok 為 true、matches 為空、segments 仍是完整原文', () => {
    const result = runRegexMatch('zzz', 'g', 'abc')
    assert.equal(result.ok, true)
    assert.deepEqual(result.matches, [])
    assert.equal(concatSegments(result.segments), 'abc')
  })
})

describe('D-19: 回傳值必須能通過 postMessage 的結構化複製', () => {
  it('成功結果結構化複製後完全相等(不含 RegExp 物件、不含函式)', () => {
    const result = runRegexMatch('(?<d>\\d+)', 'g', 'a1b22c')
    const cloned = structuredClone(result)
    assert.deepEqual(cloned, result)
  })

  it('錯誤結果同樣可結構化複製', () => {
    const result = runRegexMatch('(', 'g', 'abc')
    assert.deepEqual(structuredClone(result), result)
  })
})

describe('D-23: 旗標寫在正則式子裡(本階段不做旗標勾選框)', () => {
  it('裸 pattern 預設帶 g 旗標,才能標出全部符合的片段', () => {
    assert.deepEqual(parsePatternInput('\\d+'), { pattern: '\\d+', flags: 'g' })
  })

  it("'/pattern/flags' 形式逐字採用使用者寫的旗標", () => {
    assert.deepEqual(parsePatternInput('/\\d+/gi'), { pattern: '\\d+', flags: 'gi' })
  })

  it('斜線形式但沒寫 g 時,旗標原樣保留(只標第一筆是使用者自己的選擇)', () => {
    assert.deepEqual(parsePatternInput('/\\d+/i'), { pattern: '\\d+', flags: 'i' })
  })

  it('斜線形式可以完全不帶旗標', () => {
    assert.deepEqual(parsePatternInput('/abc/'), { pattern: 'abc', flags: '' })
  })

  it('內含跳脫斜線的正則不會被切錯', () => {
    assert.deepEqual(parsePatternInput('/a\\/b/g'), { pattern: 'a\\/b', flags: 'g' })
  })

  it('只有開頭一條斜線、沒有收尾斜線時視為裸 pattern', () => {
    assert.deepEqual(parsePatternInput('/abc'), { pattern: '/abc', flags: 'g' })
  })

  it('空字串回傳空 pattern', () => {
    assert.deepEqual(parsePatternInput(''), { pattern: '', flags: 'g' })
  })
})
