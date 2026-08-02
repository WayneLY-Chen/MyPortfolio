// 手刻 MD5 的機器可驗證契約。
//
// 用 Node 內建的 node:test / node:assert/strict,不引入任何 npm 套件 ——
// frontend/package.json 沒有測試執行器,也不允許為了測試新增 test script;
// md5.js 刻意設計成零 React 依賴的 ESM 純函式模組,而 frontend/package.json
// 已宣告 "type": "module",Node 可以直接載入它。
//
// 執行方式必須指定「檔案路徑」而非目錄(本機實測 `node --test <目錄>` 會失敗,
// 報 MODULE_NOT_FOUND):
//   cd frontend && node --test src/components/devtools/md5.test.js
//
// 【為什麼可以 import node:crypto】
// Node 的 createHash('md5') 是一份與本模組完全獨立的實作(OpenSSL),拿來當交叉比對的
// oracle 最省事也最可信 —— 手刻的填充、位元組序、四輪運算只要有任何一步寫錯,結果一定
// 會與它分岔。這個測試檔不會被任何元件 import,不會進 bundle,因此不影響 FEAT-14
// 「零外部依賴、零對外通訊」的保證,前端也沒有真的引入 Node 模組。
//
// 【為什麼要掃 0 到 130 這麼長一段】
// 04-RESEARCH.md 明講研究文件沒有提供 MD5 的逐行程式碼,只給結構描述與測試向量,
// 而 padding 與位元組序是最容易出錯的地方。RFC 1321 那七條標準向量最長只有 80 個字元,
// 完全不足以涵蓋所有邊界:55/56 是「這一塊還塞不塞得下 8 位元組長度欄位」的分界,
// 63/64 是區塊邊界,119/120 是第二塊的同一組分界。逐一長度掃過去才是真的護欄。

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { md5 } from './md5.js'

/** oracle:與本模組完全獨立的 Node 內建實作。 */
function oracle(text) {
  return createHash('md5').update(text, 'utf8').digest('hex')
}

describe('D-14: 手刻 MD5 必須逐字符合 RFC 1321 的七條標準測試向量', () => {
  it('空字串', () => {
    assert.equal(md5(''), 'd41d8cd98f00b204e9800998ecf8427e')
  })

  it('單一字元 a', () => {
    assert.equal(md5('a'), '0cc175b9c0f1b6a831c399e269772661')
  })

  it('abc', () => {
    assert.equal(md5('abc'), '900150983cd24fb0d6963f7d28e17f72')
  })

  it('message digest', () => {
    assert.equal(md5('message digest'), 'f96b697d7cb7938d525a2f31aaf161d0')
  })

  it('小寫字母表', () => {
    assert.equal(md5('abcdefghijklmnopqrstuvwxyz'), 'c3fcd3d76192e4007dfb496cca67e13b')
  })

  it('大小寫字母加數字(62 字元,跨過第一個區塊邊界)', () => {
    assert.equal(
      md5('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'),
      'd174ab98d277d9f5a5611c2c9f419d9f'
    )
  })

  it('八組 1234567890(80 字元)', () => {
    assert.equal(
      md5('12345678901234567890123456789012345678901234567890123456789012345678901234567890'),
      '57edf4a22be3c955ac49da2e2107b67a'
    )
  })
})

describe('D-14: 長度 0 到 130 的每一種輸入都必須與 Node 內建實作相同', () => {
  it('逐一長度交叉比對,涵蓋 55 / 56 / 63 / 64 / 119 / 120 幾個填充邊界', () => {
    for (let len = 0; len <= 130; len += 1) {
      // 用可預期但不重複的 ASCII 內容,避免全部同一個字元時掩蓋掉位元組序的錯誤。
      let input = ''
      for (let i = 0; i < len; i += 1) {
        input += String.fromCharCode(33 + ((i * 7) % 94))
      }
      assert.equal(md5(input), oracle(input), `長度 ${len} 的結果與 Node 不一致`)
    }
  })

  it('填充邊界逐一單獨斷言(壞掉時能一眼看出是哪一個邊界)', () => {
    for (const len of [54, 55, 56, 57, 63, 64, 65, 119, 120, 121, 127, 128]) {
      const input = 'x'.repeat(len)
      assert.equal(md5(input), oracle(input), `長度 ${len} 的結果與 Node 不一致`)
    }
  })
})

describe('D-14: 非 ASCII 輸入必須先轉成 UTF-8 位元組再運算', () => {
  it('中文字串', () => {
    // 逐字元取 charCode 的實作會在這裡與 Node 分岔 —— 中文在本站是常態輸入,不是邊界案例。
    assert.equal(md5('你好,世界'), oracle('你好,世界'))
    assert.equal(md5('繁體中文測試'), oracle('繁體中文測試'))
  })

  it('emoji(代理對,單一字元佔兩個 UTF-16 code unit)', () => {
    assert.equal(md5('🎉'), oracle('🎉'))
    assert.equal(md5('a🎉b🚀c'), oracle('a🎉b🚀c'))
  })

  it('中英數混合與長中文字串', () => {
    assert.equal(md5('Hello, 世界! 123'), oracle('Hello, 世界! 123'))
    assert.equal(md5('你'.repeat(200)), oracle('你'.repeat(200)))
  })

  it('含 NUL 字元的字串(不得被當成字串結尾而提早截斷)', () => {
    // 用 String.fromCharCode(0) 取得 NUL,而不是把裸的 NUL 位元組寫進原始碼 ——
    // 裸 NUL 在編輯器與 git diff 上都看不見,日後很容易被誤刪或被工具吃掉。
    const NUL = String.fromCharCode(0)
    assert.equal(md5(`a${NUL}b`), oracle(`a${NUL}b`))
    assert.equal(md5(NUL), oracle(NUL))
    assert.equal(md5(NUL.repeat(3)), oracle(NUL.repeat(3)))
    // 尾端的 NUL 必須被算進去:'abc' 與 'abc' + NUL 是兩個不同的輸入,
    // 長度欄位算錯的實作會讓這兩者撞在一起。
    assert.notEqual(md5(`abc${NUL}`), md5('abc'))
  })

  it('換行、tab 與其他控制字元', () => {
    assert.equal(md5('line1\nline2\r\nline3\t結束'), oracle('line1\nline2\r\nline3\t結束'))
  })
})

describe('D-14: 輸出格式永遠是 32 個小寫十六進位字元', () => {
  it('各種長度的輸出都是 32 字元且只含 0-9a-f', () => {
    for (const input of ['', 'a', 'abc', 'x'.repeat(1000), '你好', '🎉']) {
      const out = md5(input)
      assert.equal(out.length, 32, `輸入長度 ${input.length} 的輸出不是 32 字元`)
      assert.match(out, /^[0-9a-f]{32}$/)
    }
  })

  it('非字串輸入回傳保護值而不丟例外(與同目錄其他純函式模組一致)', () => {
    // base64Utils.js 對非字串輸入一律回保護值,呼叫端因此不必到處包 try/catch。
    // MD5 沿用同一個慣例:視同空字串。
    assert.equal(md5(undefined), 'd41d8cd98f00b204e9800998ecf8427e')
    assert.equal(md5(null), 'd41d8cd98f00b204e9800998ecf8427e')
    assert.equal(md5(12345), 'd41d8cd98f00b204e9800998ecf8427e')
  })
})

describe('D-14: 相同輸入必須永遠得到相同輸出(不得殘留跨呼叫狀態)', () => {
  it('連續呼叫不同輸入後,重算舊輸入的結果不變', () => {
    const first = md5('abc')
    md5('完全不同的另一段輸入,長度也不一樣'.repeat(10))
    md5('')
    md5('x'.repeat(64))
    assert.equal(md5('abc'), first)
    assert.equal(md5('abc'), '900150983cd24fb0d6963f7d28e17f72')
  })
})
