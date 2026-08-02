// 顏色格式轉換的純函式核心(FEAT-13)—— 零 React 依賴,可直接用 node:test 驗證。
//
// Source:
//   04-CONTEXT.md D-16:HEX / RGB / HSL 三組數值互相連動 + 即時預覽色塊 + 原生
//     <input type="color"> 取色器。**不做**配色建議 / 互補色 / 類似色調盤 /
//     WCAG 對比度檢查 —— 四項都在 Deferred Ideas 明文排除,不得「順手加上去」。
//   04-CONTEXT.md D-21:顏色轉換是瞬間完成的運算,不進 Worker(那是正則專屬的例外)。
//   04-RESEARCH.md §Code Examples「HSL ⇄ RGB 轉換公式」:以下 rgbToHsl / hslToRgb
//     為 CSS Color Module 定義的標準公式,業界通用實作,非本站專屬。
//   04-RESEARCH.md §Common Pitfalls #7:反覆轉換的四捨五入漂移,以及唯一的解法。
//
// 【為什麼 rgbToHsl 刻意不取整】
// HSL 的三個分量是浮點數,RGB 是 0–255 整數,兩者之間每跨一次就有一次四捨五入。
// 如果在這一層就把 h / s / l 取成整數,RGB → HSL → RGB 的往返會在整數格點上失真,
// 而使用者反覆微調同一個顏色時,那個失真會累積成肉眼可見的色偏(#336699 變成
// #326698,而且沒有任何錯誤訊息)。
// 因此:**這一層保留完整浮點精度,取整只發生在兩個地方 ——(a)hslToRgb 的最終
// 輸出(RGB 本來就是整數);(b)顯示層(ColorTool.jsx 印出來給人看的數字)。**
// 對應的斷言在 colorConversion.test.js 的「往返 10 次 === 往返 1 次」那一條。
//
// 【異常輸入回保護值,不丟例外】
// 沿用本目錄既有模組(jsonFormatter.js / base64Utils.js / regexMatcher.js)的慣例:
// 解析失敗回 null、數值超界就夾值,呼叫端不需要包 try/catch。

/**
 * 本站主色 --accent(#C8942A)對應的 RGB 三元組,ColorTool.jsx 拿它當初始值
 * ——「顏色工具打開來是一片空白」等於沒有預覽,D-16 的預覽色塊必須一進來就有東西。
 *
 * 【改一邊要改兩邊】此值必須與 frontend/src/index.css 的 `--accent` 保持一致。
 * 這裡不從 CSS 變數讀取是刻意的:本模組零瀏覽器相依,才能被 node:test 直接驗證。
 * colorConversion.test.js 對這個值寫了逐字斷言,改錯會當場失敗。
 */
export const ACCENT_RGB = { r: 200, g: 148, b: 42 }

/** 單一 RGB 分量:非數值退化成 0,其餘四捨五入後夾進 0–255。 */
function clampChannel(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(255, Math.max(0, Math.round(n)))
}

/** 單一 HSL 分量:非數值退化成 0,其餘夾進 0–max。**不取整** —— 精度要留給往返。 */
function clampUnit(value, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(max, Math.max(0, n))
}

/**
 * 把 RGB 三元組夾成合法的 0–255 整數。
 * `clampRgb({ r: -5, g: 300, b: 128 })` → `{ r: 0, g: 255, b: 128 }`
 *
 * T-04-26:數值欄位是使用者可以打進任何東西的地方,這裡是 NaN 的止血點 ——
 * 一旦 NaN 流進 canonical state,三組顯示值會同時變成 NaN 而畫面不會有任何錯誤提示。
 */
export function clampRgb(rgb) {
  return {
    r: clampChannel(rgb?.r),
    g: clampChannel(rgb?.g),
    b: clampChannel(rgb?.b),
  }
}

/**
 * 把 HSL 三元組夾成合法範圍:h 0–360、s 與 l 0–100。
 * 刻意不四捨五入 —— 顯示層要取整是顯示層自己的事。
 */
export function clampHsl(hsl) {
  return {
    h: clampUnit(hsl?.h, 360),
    s: clampUnit(hsl?.s, 100),
    l: clampUnit(hsl?.l, 100),
  }
}

/**
 * HEX 字串 → RGB 三元組。支援 3 碼與 6 碼、`#` 前綴可有可無、大小寫皆可。
 * 解析失敗一律回 `null`(不丟例外)—— 呼叫端據此判斷「這串還不是合法顏色」,
 * 而不是把使用者打到一半的字硬改掉。
 */
export function hexToRgb(input) {
  if (typeof input !== 'string') return null

  const raw = input.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]+$/.test(raw)) return null

  let six
  if (raw.length === 3) {
    six = raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2]
  } else if (raw.length === 6) {
    six = raw
  } else {
    return null
  }

  return {
    r: parseInt(six.slice(0, 2), 16),
    g: parseInt(six.slice(2, 4), 16),
    b: parseInt(six.slice(4, 6), 16),
  }
}

/**
 * RGB 三元組 → 固定 6 碼小寫 HEX 字串(單碼分量補零,不輸出 3 碼縮寫)。
 *
 * T-04-25:**內部先過 clampRgb 才轉字串**,因此本函式的輸出恆為 `/^#[0-9a-f]{6}$/`,
 * 任何輸入都一樣。色塊的 inline background 只能由這個函式產生,絕不可以把使用者
 * 原始輸入的字串直接塞進 style —— 那等於開放任意 CSS 值注入。
 */
export function rgbToHex(rgb) {
  const { r, g, b } = clampRgb(rgb)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * RGB(0–255)→ HSL。回傳 `{ h, s, l }`,h 為 0–360、s 與 l 為 0–100 的**浮點數**。
 *
 * 無彩色(max === min)時色相定為 0。這一行不是美化:公式裡的 `d` 為 0,少了這個
 * 分支就會除以零而得到 NaN,而 NaN 會安靜地流進顯示層與往返運算。
 */
export function rgbToHsl(rInput, gInput, bInput) {
  const { r: r255, g: g255, b: b255 } = clampRgb({ r: rInput, g: gInput, b: bInput })

  const r = r255 / 255
  const g = g255 / 255
  const b = b255 / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) return { h: 0, s: 0, l: l * 100 }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let h
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h /= 6

  return { h: h * 360, s: s * 100, l: l * 100 }
}

/**
 * HSL → RGB(0–255 整數)。h 0–360、s 與 l 0–100,超界一律先夾值。
 * h = 0 與 h = 360 得到同一個顏色(色相環的同一點)。
 */
export function hslToRgb(hInput, sInput, lInput) {
  const { h: h360, s: s100, l: l100 } = clampHsl({ h: hInput, s: sInput, l: lInput })

  const h = h360 / 360
  const s = s100 / 100
  const l = l100 / 100

  // 無彩色捷徑。同時也避開下方 hue2rgb 在 s = 0 時的無意義計算。
  if (s === 0) {
    const v = Math.round(l * 255)
    return { r: v, g: v, b: v }
  }

  const hue2rgb = (p, q, t) => {
    let tt = t
    if (tt < 0) tt += 1
    if (tt > 1) tt -= 1
    if (tt < 1 / 6) return p + (q - p) * 6 * tt
    if (tt < 1 / 2) return q
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
    return p
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q

  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  }
}
