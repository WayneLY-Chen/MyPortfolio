// frontend/src/components/moneyExpression.js
//
// 分帳計算機的金額算式求值。零 React 依賴的純 ESM 模組，才測得動：
//
//   cd frontend && node --test src/components/moneyExpression.test.js
//
// 取代 MoneyCalculator.jsx 原本的做法：
//
//   const cleanExp = itemPriceExp.replace(/[^0-9+\-*/().]/g, "")
//   const amount = eval(cleanExp)
//
// 那個寫法有兩個問題，其中第二個才是實際會害到使用者的：
//
// 1. eval 本身。以該字元白名單而言目前無法造成程式碼執行——沒有字母、沒有
//    [ ] !，JSFuck 式的建構做不出來，實測各種 payload 不是被剝成無害片段就是
//    SyntaxError。所以這不是當下的漏洞，而是一顆延遲引信：只要日後有人為了
//    支援百分比或千分位而放寬那個字元類別，它就會變成真正的程式碼執行。
//
// 2. 消毒方式是「剝除」而非「拒絕」，會產生靜默的錯誤金額：
//       1e5  -> 剝成 15    （使用者預期 100000）
//       2^3  -> 剝成 23    （使用者預期 8）
//       1,2  -> 剝成 12
//    在分帳情境下，這代表大家照著錯誤數字付錢，而且畫面上不會有任何提示。
//    本模組改為遇到無法解析的輸入就回傳 null，由呼叫端顯示錯誤。
//
// 支援的語法：十進位數字（可含小數點）、+ - * /、括號、一元正負號。
// 刻意不支援 ** 次方與科學記號——分帳用不到，且兩者都是上面那類誤解的來源。

const isDigit = (ch) => ch >= '0' && ch <= '9';

/**
 * 把算式字串切成 token。遇到不認識的字元回傳 null（拒絕，不剝除）。
 * @param {string} input
 * @returns {Array<{type: string, value?: number}>|null}
 */
const tokenize = (input) => {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];

    if (ch === ' ' || ch === '\t') { i += 1; continue; }

    if (isDigit(ch) || ch === '.') {
      let start = i;
      let seenDot = false;
      while (i < input.length && (isDigit(input[i]) || input[i] === '.')) {
        if (input[i] === '.') {
          if (seenDot) return null;   // 1.2.3 這種不接受
          seenDot = true;
        }
        i += 1;
      }
      const raw = input.slice(start, i);
      if (raw === '.') return null;
      const value = Number(raw);
      if (!Number.isFinite(value)) return null;
      tokens.push({ type: 'number', value });
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: ch });
      i += 1;
      continue;
    }

    if (ch === '(' || ch === ')') {
      tokens.push({ type: ch });
      i += 1;
      continue;
    }

    return null;  // 其他任何字元一律拒絕
  }
  return tokens;
};

/**
 * 求值一段金額算式。
 *
 * @param {unknown} input 使用者輸入的算式
 * @returns {number|null} 合法且結果為有限數時回傳該數，否則回傳 null
 */
export const evaluateMoneyExpression = (input) => {
  if (typeof input !== 'string') return null;
  const tokens = tokenize(input);
  if (tokens === null || tokens.length === 0) return null;

  let pos = 0;
  let failed = false;
  const peek = () => tokens[pos];
  const fail = () => { failed = true; return 0; };

  // expression := term (('+' | '-') term)*
  const parseExpression = () => {
    let left = parseTerm();
    while (!failed && peek() && (peek().type === '+' || peek().type === '-')) {
      const op = peek().type;
      pos += 1;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };

  // term := factor (('*' | '/') factor)*
  const parseTerm = () => {
    let left = parseFactor();
    while (!failed && peek() && (peek().type === '*' || peek().type === '/')) {
      const op = peek().type;
      pos += 1;
      const right = parseFactor();
      if (op === '*') {
        left = left * right;
      } else {
        // 除以零得 Infinity，交由最後的 Number.isFinite 統一擋掉，
        // 使用者會看到「算式錯誤」而不是拿到一個 Infinity 金額。
        left = left / right;
      }
    }
    return left;
  };

  // factor := ('+' | '-') factor | primary
  const parseFactor = () => {
    const t = peek();
    if (!t) return fail();
    if (t.type === '+') { pos += 1; return parseFactor(); }
    if (t.type === '-') { pos += 1; return -parseFactor(); }
    return parsePrimary();
  };

  // primary := number | '(' expression ')'
  const parsePrimary = () => {
    const t = peek();
    if (!t) return fail();
    if (t.type === 'number') { pos += 1; return t.value; }
    if (t.type === '(') {
      pos += 1;
      const value = parseExpression();
      if (failed) return 0;
      if (!peek() || peek().type !== ')') return fail();
      pos += 1;
      return value;
    }
    return fail();
  };

  const result = parseExpression();
  if (failed) return null;
  if (pos !== tokens.length) return null;   // 有沒吃完的 token，例如 "1 2"
  if (!Number.isFinite(result)) return null;
  return result;
};

export default evaluateMoneyExpression;
