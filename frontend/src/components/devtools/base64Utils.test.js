// Base64 編解碼模組的機器可驗證契約。
//
// 用 Node 內建的 node:test / node:assert/strict,不引入任何 npm 套件 ——
// frontend/package.json 沒有測試執行器,也不允許為了測試新增 test script;
// base64Utils.js 刻意設計成零 React 依賴的 ESM 純函式模組,而 frontend/package.json
// 已宣告 "type": "module",Node 可以直接載入它。
//
// 執行方式必須指定「檔案路徑」而非目錄(本機實測 `node --test <目錄>` 會失敗,
// 報 MODULE_NOT_FOUND):
//   cd frontend && node --test src/components/devtools/base64Utils.test.js
//
// 【為什麼可以 import node:buffer】
// Node 的 Buffer 是一份與本模組完全獨立的 Base64 實作,拿來當交叉比對的 oracle
// 最省事也最可信 —— 手寫的 TextEncoder → btoa 路徑若有任何一步寫錯,結果一定會與
// Buffer 分岔。測試檔不會被任何元件 import,不會進 bundle,因此不影響 FEAT-14
// 「零外部依賴、零對外通訊」的保證。
//
// describe 標題沿用 jsonFormatter.test.js 的既有風格,帶上對應的決策編號。

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import {
  textToBase64,
  base64ToText,
  toBase64Url,
  fromBase64Url,
  isValidBase64,
  measureBytes,
  MAX_TEXT_BYTES,
  MAX_FILE_BYTES,
} from './base64Utils.js'

describe('D-18: 文字轉 Base64 必須走 UTF-8 位元組,結果與 Node Buffer 完全一致', () => {
  it('純 ASCII 的已知值', () => {
    assert.equal(textToBase64('Hello'), 'SGVsbG8=')
    assert.equal(textToBase64('M'), 'TQ==')
    assert.equal(textToBase64('Ma'), 'TWE=')
    assert.equal(textToBase64('Man'), 'TWFu')
  })

  it('中文字串與 Buffer 的結果相同(裸 btoa 在這裡會直接丟例外)', () => {
    assert.equal(textToBase64('你好'), Buffer.from('你好', 'utf8').toString('base64'))
  })

  it('中英混排、emoji、多行字串逐一與 Buffer 交叉比對', () => {
    const samples = [
      'Hello, 世界!',
      '😀 emoji',
      '第一行\n第二行\t有 tab',
      '繁體中文の混排テスト',
      'ÀÉÎÕÜ ß ñ',
      '你'.repeat(500),
    ]
    for (const s of samples) {
      assert.equal(textToBase64(s), Buffer.from(s, 'utf8').toString('base64'), s.slice(0, 12))
    }
  })

  it('空字串轉出空字串,非字串輸入回傳保護值而不丟例外', () => {
    assert.equal(textToBase64(''), '')
    assert.equal(textToBase64(null), '')
    assert.equal(textToBase64(undefined), '')
    assert.equal(textToBase64(12345), '')
  })
})

describe('D-18: Base64 轉回文字必須還原成一模一樣的原文', () => {
  it('已知值解碼', () => {
    assert.equal(base64ToText('SGVsbG8='), 'Hello')
    assert.equal(base64ToText(Buffer.from('中文', 'utf8').toString('base64')), '中文')
  })

  it('往返不壞:空字串、中英混排、emoji、多行、三種 padding 長度', () => {
    const samples = [
      '',
      'a',
      'ab',
      'abc',
      'Hello, 世界!',
      '😀 emoji',
      '第一行\n第二行\n\t縮排的第三行',
      '你好'.repeat(1000),
    ]
    for (const s of samples) {
      assert.equal(base64ToText(textToBase64(s)), s, `往返失敗:${s.slice(0, 12)}`)
    }
  })

  it('容忍換行與空白(貼上長 Base64 時常被自動折行)', () => {
    const b64 = textToBase64('Hello, 世界!')
    const wrapped = `${b64.slice(0, 4)}\n${b64.slice(4, 8)} ${b64.slice(8)}`
    assert.equal(base64ToText(wrapped), 'Hello, 世界!')
  })

  it('不合法輸入回傳保護值而不丟例外', () => {
    assert.doesNotThrow(() => base64ToText('!!!'))
    assert.equal(base64ToText('!!!'), '')
    assert.equal(base64ToText(''), '')
    assert.equal(base64ToText(null), '')
    assert.equal(base64ToText(undefined), '')
    assert.equal(base64ToText(42), '')
  })
})

describe('base64url 互轉(04-04 JWT 工具會重用同一組函式)', () => {
  it('編碼側:兩個字元替換並去掉 padding', () => {
    assert.equal(toBase64Url('a+b/c=='), 'a-b_c')
    assert.equal(toBase64Url('+/+/'), '-_-_')
    assert.equal(toBase64Url('SGVsbG8='), 'SGVsbG8')
    assert.equal(toBase64Url(''), '')
    assert.equal(toBase64Url(null), '')
  })

  it('解碼側:還原兩個字元並補回 padding 至 4 的倍數', () => {
    // 這裡刻意用真的算得出來的 Base64:
    //   [0xFB]           → '+w=='  → base64url '-w'
    //   [0xFB, 0xFF]     → '+/8='  → base64url '-_8'
    //   [0xFB,0xFF,0xBF] → '+/+/'  → base64url '-_-_'
    assert.equal(fromBase64Url('-w'), '+w==')
    assert.equal(fromBase64Url('-_8'), '+/8=')
    assert.equal(fromBase64Url('-_-_'), '+/+/')
    assert.equal(fromBase64Url(''), '')
    assert.equal(fromBase64Url(null), '')
  })

  it('三種 padding 長度的來回轉換都回到原值', () => {
    for (const s of ['a', 'ab', 'abc', 'abcd', '你', '你好', 'Hello, 世界!']) {
      const b64 = textToBase64(s)
      assert.equal(fromBase64Url(toBase64Url(b64)), b64, `來回失敗:${s}`)
    }
  })

  it('與 Node 的 base64url 編碼一致', () => {
    for (const s of ['a', 'ab', 'abc', '你好', '😀']) {
      const expected = Buffer.from(s, 'utf8').toString('base64url')
      assert.equal(toBase64Url(textToBase64(s)), expected, `不一致:${s}`)
    }
  })

  it('base64url 片段可直接接到 base64ToText 還原成 JSON 字串(JWT 的實際用法)', () => {
    const payload = '{"sub":"demo-user","name":"訪客"}'
    const segment = toBase64Url(textToBase64(payload))
    assert.ok(!segment.includes('='), 'base64url 不應帶 padding')
    assert.equal(base64ToText(fromBase64Url(segment)), payload)
  })

  it('長度除以 4 餘 1 是不可能的 Base64,補 padding 也救不回來,但不得丟例外', () => {
    assert.doesNotThrow(() => fromBase64Url('-'))
    assert.equal(fromBase64Url('-'), '+')
  })
})

describe('isValidBase64: 用字元集與長度判斷,不靠 try/catch 引擎行為', () => {
  it('合法的 Base64 回傳 true', () => {
    assert.equal(isValidBase64('SGVsbG8='), true)
    assert.equal(isValidBase64('TWFu'), true)
    assert.equal(isValidBase64('TQ=='), true)
    assert.equal(isValidBase64('+/+/'), true)
  })

  it('省略 padding 仍視為可解碼(貼上時常見)', () => {
    assert.equal(isValidBase64('SGVsbG8'), true)
    assert.equal(isValidBase64('TQ'), true)
  })

  it('空字串視為「尚未輸入」而非合法', () => {
    assert.equal(isValidBase64(''), false)
    assert.equal(isValidBase64('   '), false)
    assert.equal(isValidBase64('\n\t'), false)
    assert.equal(isValidBase64(null), false)
    assert.equal(isValidBase64(undefined), false)
    assert.equal(isValidBase64(123), false)
  })

  it('含字元集外的字元、或長度餘 1 的字串一律 false', () => {
    assert.equal(isValidBase64('!!!'), false)
    assert.equal(isValidBase64('SGVsbG8@'), false)
    assert.equal(isValidBase64('你好'), false)
    assert.equal(isValidBase64('SGVsbG8=='), false)
    assert.equal(isValidBase64('SGVs=bG8='), false)
    assert.equal(isValidBase64('-_-_'), false)
  })

  it('前後與中間的空白會先被剝掉再判斷', () => {
    assert.equal(isValidBase64('  SGVsbG8=  '), true)
    assert.equal(isValidBase64('SGVs\nbG8='), true)
  })
})

describe('D-25: 兩個大小上限常數的數值本身就是契約', () => {
  it('文字側上限為 200 KB', () => {
    assert.equal(MAX_TEXT_BYTES, 204800)
    assert.equal(MAX_TEXT_BYTES, 200 * 1024)
  })

  it('檔案側上限為 5 MB', () => {
    assert.equal(MAX_FILE_BYTES, 5242880)
    assert.equal(MAX_FILE_BYTES, 5 * 1024 * 1024)
  })

  it('measureBytes 量的是 UTF-8 位元組而不是字串長度', () => {
    assert.equal(measureBytes(''), 0)
    assert.equal(measureBytes('abc'), 3)
    assert.equal(measureBytes('你好'), 6)
    assert.equal(measureBytes('😀'), 4)
    assert.equal(measureBytes(null), 0)
  })

  it('超過上限時只回傳長度下界,不實際配置整份位元組陣列', () => {
    const huge = 'a'.repeat(MAX_TEXT_BYTES + 10)
    assert.equal(measureBytes(huge), huge.length)
    // 中文字的 length 遠小於位元組數,這是「用 String.length 判斷」會漏掉的形狀
    const cjk = '你'.repeat(70000)
    assert.equal(measureBytes(cjk), 210000)
    assert.ok(measureBytes(cjk) > MAX_TEXT_BYTES)
    assert.ok(cjk.length < MAX_TEXT_BYTES)
  })
})
