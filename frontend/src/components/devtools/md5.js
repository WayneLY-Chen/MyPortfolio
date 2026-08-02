// MD5(RFC 1321)—— 本階段唯一一份手刻的密碼學原語,零 React 依賴的純函式模組。
//
// 【這是一次被明確核准的例外,範圍僅限 MD5】
// Source: 04-CONTEXT.md D-14。ASVS 的通則是「絕不手刻密碼學原語」,這裡刻意背離,
// 由使用者拍板。理由:MD5 在實務上仍常被拿來比對檔案 checksum,而 Web Crypto 的
// crypto.subtle.digest() 只提供 SHA 家族,不提供 MD5;為了一個 checksum 工具去裝
// crypto-js / blueimp-md5 / js-md5 之類的套件,與本站「不引入新依賴」的約束衝突。
//
// **這個例外不得被援引來正當化其他任何演算法的手刻。**
// SHA-1 / SHA-256 / SHA-384 / SHA-512 一律走原生 crypto.subtle.digest(),
// 見 HashTool.jsx。任何人想在這個目錄裡再手寫第二個雜湊演算法,答案是不行。
//
// 【MD5 不具密碼學安全性】
// MD5 早已被實作出碰撞攻擊,不得用於密碼雜湊、簽章或任何安全用途。本工具對它的定位
// 只有一個:比對檔案 checksum(下載回來的檔案跟對方給的值一不一樣)。畫面上那一列
// 因此帶著「非密碼學安全」的說明文案,那段文案是防止誤用的,不得移除。
//
// 【正確性怎麼保證】
// 04-RESEARCH.md 沒有提供逐行程式碼,只給結構描述與測試向量,而填充(padding)與
// 位元組序是最容易寫錯的地方。護欄是 md5.test.js:七條 RFC 1321 標準向量,加上長度
// 0 到 130 逐一與 Node 內建實作交叉比對(跨過 55 / 56 / 63 / 64 / 119 / 120 幾個
// 填充邊界),以及中文、emoji、NUL 字元。改動這個檔案後必須重跑:
//   cd frontend && node --test src/components/devtools/md5.test.js

// RFC 1321 §3.4 的 T 表:T[i] = floor(2^32 × abs(sin(i))),i 從 1 到 64。
// 刻意寫死而不是用 Math.sin 當場算 —— ECMAScript 只要求 Math.sin 近似,各家引擎的
// 最後一位可能不同,而這裡差一個 ULP 就會讓 floor 掉進不同的整數、整個摘要全錯。
// 常數表是規格的一部分,不是計算結果。
const T = [
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee,
  0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be,
  0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa,
  0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed,
  0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
  0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05,
  0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039,
  0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1,
  0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
]

// 每一輪的左旋位移量(RFC 1321 §3.4)。四輪各自四個值、每輪重複四次。
const SHIFT = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

const BLOCK_BYTES = 64
// 填充後每一塊的最後 8 個位元組要留給原始訊息的位元長度,所以訊息本體最多只能佔 56。
const LENGTH_FIELD_BYTES = 8

/** 32 位元左旋。>>> 0 是必要的 —— JavaScript 的 << 產生有號 int32,不轉回無號會出現負數。 */
function rotateLeft(value, bits) {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0
}

/**
 * RFC 1321 §3.1:訊息填充。
 * 先補一個 0x80 位元組,再補零到「長度模 64 等於 56」,最後 8 個位元組放原始訊息的
 * 位元長度(64-bit little-endian)。回傳的 Uint8Array 長度必定是 64 的倍數。
 */
function padMessage(bytes) {
  // +1 是那個 0x80。整除後 +1 塊,剛好涵蓋「剩餘空間放不下長度欄位」要多開一塊的情況。
  const blocks = Math.floor((bytes.length + LENGTH_FIELD_BYTES) / BLOCK_BYTES) + 1
  const padded = new Uint8Array(blocks * BLOCK_BYTES)
  padded.set(bytes)
  padded[bytes.length] = 0x80

  // 位元長度可能超過 32 位元(理論上),所以拆成高低兩個 32 位元字分別寫入。
  // bytes.length × 8 在 Number 的安全整數範圍內是精確的,不會掉精度。
  const bitLength = bytes.length * 8
  const low = bitLength >>> 0
  const high = Math.floor(bitLength / 4294967296) >>> 0
  const offset = padded.length - LENGTH_FIELD_BYTES
  for (let i = 0; i < 4; i += 1) {
    padded[offset + i] = (low >>> (i * 8)) & 0xff
    padded[offset + 4 + i] = (high >>> (i * 8)) & 0xff
  }
  return padded
}

/** 32 位元字轉成 little-endian 的 8 個十六進位字元(摘要輸出的位元組序)。 */
function wordToHex(word) {
  let hex = ''
  for (let i = 0; i < 4; i += 1) {
    hex += ((word >>> (i * 8)) & 0xff).toString(16).padStart(2, '0')
  }
  return hex
}

/**
 * 計算 MD5,回傳 32 個小寫十六進位字元。
 *
 * 輸入一律先用 TextEncoder 轉成 UTF-8 位元組再運算 —— **不得改成逐字元取 charCode**,
 * 那樣中文與 emoji 會算出與其他所有實作都不同的錯誤結果(本站以繁體中文為主,
 * 這不是邊界案例)。
 *
 * 非字串輸入視同空字串回傳保護值,不丟例外(沿用 base64Utils.js 的同目錄慣例,
 * 呼叫端因此不必到處包 try/catch)。
 */
export function md5(text) {
  const source = typeof text === 'string' ? text : ''
  const padded = padMessage(new TextEncoder().encode(source))

  // 初始向量(RFC 1321 §3.3)。每次呼叫都重新宣告,函式因此沒有任何跨呼叫殘留狀態。
  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  const words = new Uint32Array(16)

  for (let base = 0; base < padded.length; base += BLOCK_BYTES) {
    // 每一塊切成 16 個 little-endian 的 32 位元字。
    for (let i = 0; i < 16; i += 1) {
      const p = base + i * 4
      words[i] =
        padded[p] | (padded[p + 1] << 8) | (padded[p + 2] << 16) | (padded[p + 3] << 24)
    }

    let a = a0
    let b = b0
    let c = c0
    let d = d0

    for (let i = 0; i < 64; i += 1) {
      let f
      let g
      if (i < 16) {
        // 第一輪 F(b,c,d) = (b AND c) OR (NOT b AND d)
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        // 第二輪 G(b,c,d) = (b AND d) OR (c AND NOT d)
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        // 第三輪 H(b,c,d) = b XOR c XOR d
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        // 第四輪 I(b,c,d) = c XOR (b OR NOT d)
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }

      // 四個加數各自小於 2^32,總和最大約 2^34 —— 仍在 Number 的精確整數範圍內,
      // 交給 >>> 0 一次取模到 32 位元無號即可(f 為有號時取模結果同樣正確)。
      const sum = (a + (f >>> 0) + T[i] + words[g]) >>> 0
      const previousD = d
      d = c
      c = b
      b = (b + rotateLeft(sum, SHIFT[i])) >>> 0
      a = previousD
    }

    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  return wordToHex(a0) + wordToHex(b0) + wordToHex(c0) + wordToHex(d0)
}
