// colorConversion.js 的行為契約(FEAT-13 顏色格式轉換工具)。
//
// 執行方式(frontend/package.json 沒有 test script,本階段一律指名檔案):
//   cd frontend && node --test src/components/devtools/colorConversion.test.js
//
// 【為什麼這支測試存在,而且最重要的是最後一組】
// 這個工具看起來是七個裡面最單純的一個,但它有一個不會噴錯、只會安靜壞掉的陷阱:
// HSL 的色相 / 飽和度 / 明度是浮點數,RGB 是 0–255 整數,每次跨越邊界都有一次
// 四捨五入。使用者從 #336699 改去 HSL 再改回來,可能拿到 #326698 —— 沒有例外、
// 沒有錯誤訊息,只有數值悄悄走掉。
//
// 「往返一次的差距不超過 1」這種寫法**不足以**證明沒有漂移:每一次都差 1 而且方向
// 一致的實作也會通過,而那正是漂移本身。真正的判準是「往返 10 次的結果與往返 1 次
// 完全相同」—— 那代表往返函式在自己的值域上是冪等的,誤差不會累積。
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ACCENT_RGB,
  clampHsl,
  clampRgb,
  hexToRgb,
  hslToRgb,
  rgbToHex,
  rgbToHsl,
} from './colorConversion.js'

/** 一次「RGB → HSL → RGB」的完整往返。canonical 是 RGB,所以往返的端點也必須是 RGB。 */
function roundTrip(rgb) {
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b)
  return hslToRgb(h, s, l)
}

/** 0–255 每隔 17 取樣 —— 0, 17, 34, …, 255 共 16 個值(255 = 17 × 15,端點都取得到)。 */
const SAMPLE_STEP = 17
const SAMPLES = []
for (let v = 0; v <= 255; v += SAMPLE_STEP) SAMPLES.push(v)

describe('D-16: hexToRgb 接受 3 碼 / 6 碼、前綴 # 可有可無', () => {
  it('#C8942A 解析為本站主色的 RGB', () => {
    assert.deepEqual(hexToRgb('#C8942A'), { r: 200, g: 148, b: 42 })
  })

  it('沒有 # 前綴也接受', () => {
    assert.deepEqual(hexToRgb('C8942A'), { r: 200, g: 148, b: 42 })
  })

  it('大小寫皆可', () => {
    assert.deepEqual(hexToRgb('#c8942a'), { r: 200, g: 148, b: 42 })
  })

  it('3 碼縮寫展開為每碼重複兩次', () => {
    assert.deepEqual(hexToRgb('#fff'), { r: 255, g: 255, b: 255 })
    assert.deepEqual(hexToRgb('#000'), { r: 0, g: 0, b: 0 })
    assert.deepEqual(hexToRgb('#369'), { r: 51, g: 102, b: 153 })
  })

  it('前後空白不影響解析', () => {
    assert.deepEqual(hexToRgb('  #336699  '), { r: 51, g: 102, b: 153 })
  })
})

describe('D-16: 非法 HEX 回傳保護值而不丟例外(沿用本目錄既有慣例)', () => {
  it('非十六進位字元回傳 null', () => {
    assert.equal(hexToRgb('#zzz'), null)
    assert.equal(hexToRgb('#gg0011'), null)
  })

  it('空字串與只有一個 # 回傳 null', () => {
    assert.equal(hexToRgb(''), null)
    assert.equal(hexToRgb('#'), null)
  })

  it('長度不是 3 或 6 回傳 null', () => {
    assert.equal(hexToRgb('#ffff'), null)
    assert.equal(hexToRgb('#12345'), null)
    assert.equal(hexToRgb('#1234567'), null)
  })

  it('非字串輸入回傳 null,不丟例外', () => {
    assert.equal(hexToRgb(null), null)
    assert.equal(hexToRgb(undefined), null)
    assert.equal(hexToRgb(123456), null)
    assert.equal(hexToRgb({}), null)
  })
})

describe('D-16: rgbToHex 固定輸出 6 碼小寫並補零', () => {
  it('主色轉回小寫 6 碼', () => {
    assert.equal(rgbToHex({ r: 200, g: 148, b: 42 }), '#c8942a')
  })

  it('全黑補滿六個零', () => {
    assert.equal(rgbToHex({ r: 0, g: 0, b: 0 }), '#000000')
  })

  it('單碼分量補零而不是輸出 3 碼縮寫', () => {
    assert.equal(rgbToHex({ r: 1, g: 2, b: 3 }), '#010203')
  })

  it('全白', () => {
    assert.equal(rgbToHex({ r: 255, g: 255, b: 255 }), '#ffffff')
  })
})

describe('T-04-25: rgbToHex 內部先夾值,永遠產不出非法的 CSS 顏色值', () => {
  it('超出範圍的分量被夾進 0–255 後才轉字串', () => {
    assert.equal(rgbToHex({ r: -5, g: 300, b: 128 }), '#00ff80')
  })

  it('非數值分量退化成 0 而不是 NaN 字串', () => {
    assert.equal(rgbToHex({ r: 'abc', g: undefined, b: null }), '#000000')
    assert.equal(rgbToHex(null), '#000000')
  })

  it('輸出恆為 /^#[0-9a-f]{6}$/,任何輸入都一樣', () => {
    const inputs = [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
      { r: -1e9, g: 1e9, b: Number.NaN },
      { r: 12.6, g: 12.4, b: 0.5 },
    ]
    for (const input of inputs) {
      assert.match(rgbToHex(input), /^#[0-9a-f]{6}$/)
    }
  })
})

describe('T-04-26: clampRgb 把分量夾成 0–255 的整數', () => {
  it('負值夾成 0、超過 255 夾成 255、範圍內原樣保留', () => {
    assert.deepEqual(clampRgb({ r: -5, g: 300, b: 128 }), { r: 0, g: 255, b: 128 })
  })

  it('小數四捨五入成整數', () => {
    assert.deepEqual(clampRgb({ r: 12.4, g: 12.6, b: 0.5 }), { r: 12, g: 13, b: 1 })
  })

  it('NaN / undefined / 字串一律退化成 0,不外洩 NaN', () => {
    const out = clampRgb({ r: Number.NaN, g: undefined, b: 'abc' })
    assert.deepEqual(out, { r: 0, g: 0, b: 0 })
    for (const v of Object.values(out)) assert.equal(Number.isNaN(v), false)
  })
})

describe('T-04-26: clampHsl 把 h 夾 0–360、s 與 l 夾 0–100', () => {
  it('三個分量各自夾在自己的範圍', () => {
    assert.deepEqual(clampHsl({ h: -30, s: 140, l: 50 }), { h: 0, s: 100, l: 50 })
    assert.deepEqual(clampHsl({ h: 400, s: -20, l: 120 }), { h: 360, s: 0, l: 100 })
  })

  it('不四捨五入 —— 浮點精度必須留給往返使用', () => {
    assert.deepEqual(clampHsl({ h: 40.253, s: 65.289, l: 47.451 }), {
      h: 40.253,
      s: 65.289,
      l: 47.451,
    })
  })

  it('非數值退化成 0,不外洩 NaN', () => {
    assert.deepEqual(clampHsl({ h: 'x', s: Number.NaN, l: undefined }), { h: 0, s: 0, l: 0 })
  })
})

describe('D-16: rgbToHsl 依 CSS Color Module 標準公式,且不在這一層取整', () => {
  it('純紅為 h 0 / s 100 / l 50', () => {
    const { h, s, l } = rgbToHsl(255, 0, 0)
    assert.ok(Math.abs(h - 0) < 1e-9, `h=${h}`)
    assert.ok(Math.abs(s - 100) < 1e-9, `s=${s}`)
    assert.ok(Math.abs(l - 50) < 1e-9, `l=${l}`)
  })

  it('純綠 h 120、純藍 h 240', () => {
    assert.ok(Math.abs(rgbToHsl(0, 255, 0).h - 120) < 1e-9)
    assert.ok(Math.abs(rgbToHsl(0, 0, 255).h - 240) < 1e-9)
  })

  it('中灰的飽和度為 0、色相定為 0 而不是 NaN', () => {
    const { h, s, l } = rgbToHsl(128, 128, 128)
    assert.equal(s, 0)
    assert.equal(h, 0)
    assert.equal(Number.isNaN(h), false)
    assert.ok(Math.abs(l - (128 / 255) * 100) < 1e-9)
  })

  it('全黑與全白的色相同樣是 0 而不是 NaN', () => {
    for (const v of [0, 255]) {
      const { h, s } = rgbToHsl(v, v, v)
      assert.equal(h, 0)
      assert.equal(s, 0)
    }
  })

  it('#336699 的 HSL 恰為 210 / 50 / 40(人工驗收會用到的那組值)', () => {
    const { h, s, l } = rgbToHsl(51, 102, 153)
    assert.ok(Math.abs(h - 210) < 1e-9, `h=${h}`)
    assert.ok(Math.abs(s - 50) < 1e-9, `s=${s}`)
    assert.ok(Math.abs(l - 40) < 1e-9, `l=${l}`)
  })

  it('回傳的不是整數 —— 取整是顯示層的事,這一層取整就會製造漂移', () => {
    const { h } = rgbToHsl(200, 148, 42)
    assert.equal(Number.isInteger(h), false, `h=${h} 已被取整,往返會漂移`)
  })
})

describe('D-16: hslToRgb 回傳 0–255 整數', () => {
  it('飽和度 0 產生三個分量相等的灰', () => {
    const grey = hslToRgb(0, 0, 50)
    assert.equal(grey.r, grey.g)
    assert.equal(grey.g, grey.b)
    assert.equal(grey.r, Math.round(0.5 * 255))
  })

  it('色相不影響無彩色的結果', () => {
    assert.deepEqual(hslToRgb(0, 0, 50), hslToRgb(210, 0, 50))
  })

  it('h 0 與 h 360 是同一個顏色', () => {
    assert.deepEqual(hslToRgb(0, 100, 50), hslToRgb(360, 100, 50))
  })

  it('三個分量都是 0–255 的整數', () => {
    for (const h of [0, 47, 120, 210, 300, 359]) {
      for (const l of [0, 12, 50, 88, 100]) {
        const rgb = hslToRgb(h, 73, l)
        for (const v of Object.values(rgb)) {
          assert.equal(Number.isInteger(v), true)
          assert.ok(v >= 0 && v <= 255)
        }
      }
    }
  })

  it('210 / 50 / 40 還原成 #336699 的 RGB', () => {
    assert.deepEqual(hslToRgb(210, 50, 40), { r: 51, g: 102, b: 153 })
  })
})

describe('Pitfall #7: RGB → HSL → RGB 往返不得累積漂移', () => {
  it('取樣網格上,往返一次的每個分量差距不超過 1', () => {
    for (const r of SAMPLES) {
      for (const g of SAMPLES) {
        for (const b of SAMPLES) {
          const back = roundTrip({ r, g, b })
          assert.ok(
            Math.abs(back.r - r) <= 1 && Math.abs(back.g - g) <= 1 && Math.abs(back.b - b) <= 1,
            `(${r},${g},${b}) 往返後變成 (${back.r},${back.g},${back.b})`,
          )
        }
      }
    }
  })

  it('往返 10 次的結果與往返 1 次完全相同 —— 誤差不累積(這一條才是真正的判準)', () => {
    for (const r of SAMPLES) {
      for (const g of SAMPLES) {
        for (const b of SAMPLES) {
          const once = roundTrip({ r, g, b })
          let many = { r, g, b }
          for (let i = 0; i < 10; i += 1) many = roundTrip(many)
          assert.deepEqual(
            many,
            once,
            `(${r},${g},${b}) 往返 10 次得到 (${many.r},${many.g},${many.b}),`
              + ` 往返 1 次是 (${once.r},${once.g},${once.b}) —— 誤差正在累積`,
          )
        }
      }
    }
  })

  it('人工驗收那一組:#336699 往返 10 次仍是 #336699', () => {
    let rgb = hexToRgb('#336699')
    for (let i = 0; i < 10; i += 1) rgb = roundTrip(rgb)
    assert.equal(rgbToHex(rgb), '#336699')
  })

  it('HEX → RGB → HEX 對整個取樣網格皆為原值', () => {
    for (const r of SAMPLES) {
      for (const g of SAMPLES) {
        for (const b of SAMPLES) {
          const hex = rgbToHex({ r, g, b })
          assert.deepEqual(hexToRgb(hex), { r, g, b })
        }
      }
    }
  })
})

describe('D-16: ACCENT_RGB 是本站主色 #C8942A,改一邊必須改兩邊', () => {
  it('值恰為 { r: 200, g: 148, b: 42 }', () => {
    assert.deepEqual(ACCENT_RGB, { r: 200, g: 148, b: 42 })
  })

  it('與 frontend/src/index.css 的 --accent(#C8942A)一致', () => {
    assert.deepEqual(ACCENT_RGB, hexToRgb('#C8942A'))
    assert.equal(rgbToHex(ACCENT_RGB), '#c8942a')
  })

  it('往返 10 次不漂移', () => {
    let rgb = { ...ACCENT_RGB }
    for (let i = 0; i < 10; i += 1) rgb = roundTrip(rgb)
    assert.equal(rgbToHex(rgb), '#c8942a')
  })
})
