// JSON 格式化 / 驗證模組的機器可驗證契約。
//
// 用 Node 內建的 node:test / node:assert/strict,不引入任何 npm 套件 ——
// frontend/package.json 沒有測試執行器,也不允許為了測試新增 test script;
// jsonFormatter.js 刻意設計成零 React 依賴的 ESM 純函式模組,而 frontend/package.json
// 已宣告 "type": "module",Node 可以直接載入它。
//
// 執行方式必須指定「檔案路徑」而非目錄(本機實測 `node --test <目錄>` 會失敗,
// 報 MODULE_NOT_FOUND):
//   cd frontend && node --test src/components/devtools/jsonFormatter.test.js
//
// describe 標題沿用 typingEngine.test.js 的既有風格,帶上對應的決策編號,
// 方便日後看到測試失敗訊息時直接對回決策來源。

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatJson,
  validateJson,
  scanForFirstError,
  indexToLineCol,
  measureBytes,
  ERROR_REASONS,
  MAX_TEXT_BYTES,
} from './jsonFormatter.js'

describe('D-22: index 換算行列一律自己算,邊界輸入回傳保護值而不丟例外', () => {
  it('空字串與 index 0 都回到第 1 行第 1 欄', () => {
    assert.deepEqual(indexToLineCol('', 0), { line: 1, column: 1 })
    assert.deepEqual(indexToLineCol('a\nbc', 0), { line: 1, column: 1 })
  })

  it('index 落在第二行的字元上,回傳第 2 行第 2 欄', () => {
    // 'a\nbc' 的 index 3 是 'c'
    assert.deepEqual(indexToLineCol('a\nbc', 3), { line: 2, column: 2 })
  })

  it('index 正好落在換行字元上,仍算在前一行的行尾', () => {
    // index 1 是那個 '\n' 本身;第一行長度為 1,因此欄數為 1 + 1
    assert.deepEqual(indexToLineCol('a\nbc', 1), { line: 1, column: 2 })
  })

  it('超出範圍或非數字的 index 一律夾回合法範圍,不丟例外', () => {
    assert.deepEqual(indexToLineCol('abc', 999), { line: 1, column: 4 })
    assert.deepEqual(indexToLineCol('abc', -5), { line: 1, column: 1 })
    assert.deepEqual(indexToLineCol('abc', NaN), { line: 1, column: 1 })
    assert.deepEqual(indexToLineCol('abc', undefined), { line: 1, column: 1 })
  })
})

describe('D-22: 合法 JSON 一律通過,多位元組字元不得讓行列換算錯位', () => {
  it('單純物件通過驗證', () => {
    assert.deepEqual(validateJson('{"a":1}'), { valid: true })
  })

  it('全中文的鍵與值一樣通過驗證', () => {
    assert.deepEqual(validateJson('{"中文鍵": "中文值"}'), { valid: true })
  })

  it('中文內容後方的錯誤,欄數以字元數計算而非位元組數', () => {
    // 索引:0 { / 1 " / 2 中 / 3 文 / 4 鍵 / 5 " / 6 : / 7 空白 /
    //       8 " / 9 中 / 10 文 / 11 值 / 12 " / 13 , / 14 }
    // 多餘的逗號後方那個 '}' 在 index 14,即第 15 欄。若誤用 UTF-8 位元組數,
    // 三個中文字會各多算 2,欄數會變成 21 —— 這個斷言就是在擋那個錯誤。
    const result = validateJson('{"中文鍵": "中文值",}')
    assert.equal(result.valid, false)
    assert.equal(result.line, 1)
    assert.equal(result.column, 15)
  })
})

describe('D-22: 每一類語法錯誤都要有自己的位置與繁體中文類別', () => {
  it('多餘的逗號:{"a":1,} 指向逗號之後的右大括號', () => {
    const result = validateJson('{"a":1,}')
    assert.equal(result.valid, false)
    assert.equal(result.code, 'unexpected-comma')
    assert.equal(result.reason, ERROR_REASONS['unexpected-comma'])
    assert.equal(result.line, 1)
    assert.equal(result.column, 8)
    assert.equal(result.message, '第 1 行第 8 欄:多餘的逗號')
  })

  it('缺少值:{"a": } 指向該出現值的位置', () => {
    const result = validateJson('{"a": }')
    assert.equal(result.valid, false)
    assert.equal(result.code, 'missing-value')
    assert.equal(result.column, 7)
  })

  it('字串未閉合:指向那個沒有結尾的起始引號', () => {
    const result = validateJson('{"a": "未閉合')
    assert.equal(result.valid, false)
    assert.equal(result.code, 'unterminated-string')
    assert.equal(result.column, 7)
  })

  it('括號未閉合:[1, 2 指向那個沒有收尾的左中括號', () => {
    const result = validateJson('[1, 2')
    assert.equal(result.valid, false)
    assert.equal(result.code, 'unclosed-bracket')
    assert.equal(result.line, 1)
    assert.equal(result.column, 1)
  })

  it('缺少冒號:{"a" 1}', () => {
    const result = validateJson('{"a" 1}')
    assert.equal(result.valid, false)
    assert.equal(result.code, 'missing-colon')
    assert.equal(result.column, 6)
  })

  it('鍵必須是字串:{a: 1}', () => {
    const result = validateJson('{a: 1}')
    assert.equal(result.valid, false)
    assert.equal(result.code, 'key-must-be-string')
    assert.equal(result.column, 2)
  })

  it('缺少逗號:{"a":1 "b":2}', () => {
    const result = validateJson('{"a":1 "b":2}')
    assert.equal(result.valid, false)
    assert.equal(result.code, 'missing-comma')
    assert.equal(result.column, 8)
  })

  it('非預期的字元:{"a": @}', () => {
    const result = validateJson('{"a": @}')
    assert.equal(result.valid, false)
    assert.equal(result.code, 'unexpected-char')
    assert.equal(result.column, 7)
  })

  it('多行輸入的錯誤指向正確的行,不是永遠第 1 行', () => {
    const text = '{\n  "a": 1,\n  "b": 2,\n  "c": ,\n  "d": 4\n}'
    const result = validateJson(text)
    assert.equal(result.valid, false)
    assert.equal(result.line, 4)
    assert.equal(result.code, 'missing-value')
  })

  it('八種類別都有對應的繁體中文說明', () => {
    for (const code of [
      'missing-comma',
      'unexpected-comma',
      'missing-colon',
      'missing-value',
      'unterminated-string',
      'unclosed-bracket',
      'unexpected-char',
      'key-must-be-string',
    ]) {
      assert.equal(typeof ERROR_REASONS[code], 'string')
      assert.ok(ERROR_REASONS[code].length > 0)
    }
  })
})

describe('D-22: 錯誤訊息只能來自本模組,不得夾帶瀏覽器引擎的原始英文字串', () => {
  it('所有錯誤說明都不含任何拉丁字母', () => {
    // V8 / SpiderMonkey / JavaScriptCore 的原始訊息一律是英文,
    // 只要有一個拉丁字母漏進使用者可見文案,就代表有人把 err.message 接上來了。
    for (const [code, reason] of Object.entries(ERROR_REASONS)) {
      assert.ok(!/[A-Za-z]/.test(reason), `${code} 的說明夾帶了拉丁字母:${reason}`)
    }
  })

  it('message 一律是「第 N 行第 M 欄:說明」的固定格式', () => {
    const result = validateJson('[1, 2')
    assert.match(result.message, /^第 \d+ 行第 \d+ 欄:[^A-Za-z]+$/)
  })
})

describe('D-22: 錯誤位置來自自寫掃描器,合法輸入掃不出東西', () => {
  it('合法 JSON 掃描器回傳 null', () => {
    assert.equal(scanForFirstError('{"a":1}'), null)
    assert.equal(scanForFirstError('[1, 2, {"b": [true, false, null]}]'), null)
  })

  it('掃描器直接回報 index 與類別代碼,不含任何格式化文字', () => {
    assert.deepEqual(scanForFirstError('[1, 2'), { index: 0, code: 'unclosed-bracket' })
    assert.deepEqual(scanForFirstError('{"a":1,}'), { index: 7, code: 'unexpected-comma' })
  })
})

describe('D-06: 空輸入是「尚未輸入」而不是語法錯誤', () => {
  it('validateJson 對空字串回傳保護值,不帶行列號', () => {
    const result = validateJson('')
    assert.equal(result.valid, false)
    assert.equal(result.empty, true)
    assert.equal(result.line, undefined)
    assert.equal(result.message, undefined)
  })

  it('只有空白與換行也算尚未輸入', () => {
    assert.equal(validateJson('   \n\t ').empty, true)
  })

  it('formatJson 對空輸入回傳 ok:false + empty:true,不丟例外', () => {
    const result = formatJson('')
    assert.equal(result.ok, false)
    assert.equal(result.empty, true)
  })
})

describe('D-19 / D-25: 200 KB 上限先於 JSON.parse 生效', () => {
  it('MAX_TEXT_BYTES 就是 200 KB', () => {
    assert.equal(MAX_TEXT_BYTES, 204800)
  })

  it('位元組量測依 UTF-8 而非字串長度', () => {
    assert.equal(measureBytes(''), 0)
    assert.equal(measureBytes('abc'), 3)
    assert.equal(measureBytes('中'), 3)
  })

  it('超過上限時回傳 overLimit,且完全不呼叫 JSON.parse', () => {
    // 順序不可對調:量測必須先於 parse,否則 200 KB 上限就形同虛設。
    // 這裡直接把 JSON.parse 換掉當作探針 —— 只要它被呼叫過一次就代表順序寫反了。
    const huge = `"${'a'.repeat(MAX_TEXT_BYTES + 1)}"`
    const original = JSON.parse
    let calls = 0
    JSON.parse = (...args) => {
      calls += 1
      return original(...args)
    }
    let result
    try {
      result = formatJson(huge)
    } finally {
      JSON.parse = original
    }
    assert.equal(result.ok, false)
    assert.equal(result.overLimit, true)
    assert.equal(calls, 0)
  })

  it('中文內容以位元組數判定,不是字元數', () => {
    // 70000 個中文字 = 70000 個字元(遠低於 204800),但 UTF-8 是 210000 位元組,
    // 已經超過上限 —— 用 String.length 判斷的實作會在這裡漏掉。
    const cjk = `"${'中'.repeat(70000)}"`
    assert.ok(cjk.length < MAX_TEXT_BYTES)
    assert.equal(formatJson(cjk).overLimit, true)
  })

  it('剛好在上限之內的輸入正常格式化', () => {
    const fits = `{"a":"${'x'.repeat(1000)}"}`
    assert.equal(formatJson(fits).ok, true)
  })
})

describe('D-19: 格式化輸出固定為 2 空格縮排', () => {
  it('單層物件展開成三行', () => {
    assert.deepEqual(formatJson('{"a":1}'), {
      ok: true,
      formatted: '{\n  "a": 1\n}',
      byteLength: 7,
    })
  })

  it('巢狀結構逐層各縮排 2 空格', () => {
    const result = formatJson('{"a":{"b":[1,2]}}')
    assert.equal(result.ok, true)
    assert.equal(
      result.formatted,
      '{\n  "a": {\n    "b": [\n      1,\n      2\n    ]\n  }\n}'
    )
  })

  it('非法輸入回傳 ok:false 並帶上 validateJson 的錯誤資訊,不丟例外', () => {
    const result = formatJson('{"a":1,}')
    assert.equal(result.ok, false)
    assert.equal(result.code, 'unexpected-comma')
    assert.equal(result.line, 1)
    assert.equal(result.column, 8)
    assert.equal(result.message, '第 1 行第 8 欄:多餘的逗號')
  })
})
