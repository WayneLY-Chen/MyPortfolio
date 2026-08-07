// 面試出題與評分的評估檢查函式 —— 全部純函式、零 npm 依賴、零網路、零金鑰。
//
// 這個檔案被兩邊共用:
//   - evals.test.js(離線層,每次 npm test 都跑)
//   - run-evals.mjs(線上層,手動跑,擷取完立刻用同一套量尺印記分卡)
// 共用是刻意的 —— 線上層印出來的數字與離線層斷言的數字必須來自同一份程式碼,
// 不然「記分卡說 PASS、測試卻 FAIL」這種事遲早會發生,而且很難查。
//
// 演算法取自 05-AI-SPEC.md §5.2:
//   zh 取相鄰字元 bigram 集合;en 取小寫詞集合並剔除停用詞;兩集合取 Jaccard。
//
// 【這些數字是 proxy,不是判準】相似度、黑名單命中、建議前篩全部只負責「標記可疑」。
// 真正的判準(四軌鑑別度、建議是否通過 swap test)是人看的,理由見 AI-SPEC §5.2 註。
// 唯一例外是 QG-3 的組內相似度 0.6 —— 那個閾值已經高到近乎重複題,可以直接判。

// AI-SPEC §5.2 逐字列出的停用詞。刻意不擴充成一份「完整」的英文停用詞表:
// 這裡的目的是讓「How would you ...」這種共同開頭不要自己撐出相似度,不是做 NLP。
const EN_STOPWORDS = new Set([
  'the', 'a', 'how', 'what', 'would', 'you', 'your', 'is', 'are', 'to', 'of', 'in', 'and', 'for',
]);

// 漢字(含擴充 A 區)。刻意不含日文假名與韓文 —— 本站只有中英兩種模式。
const CJK_CHAR = /[㐀-䶿一-鿿]/;
const CJK_RUN = /[㐀-䶿一-鿿]+/g;
// 一個「英文詞」= 字母數字串,允許中間夾一個連字號或撇號(re-render、classmate's 算一個詞)。
const LATIN_TOKEN = /[a-z0-9]+(?:[''’-][a-z0-9]+)*/g;

// QG-4:預設候選人有正式生產環境經驗的用語。命中只代表「請站主複判這一題」,
// 不是自動 FAIL —— 但 fresher 軌的離線斷言把它當硬條件,因為 prompt 裡已經明文禁止。
const FRESHER_ASSUMPTION_TERMS = [
  '線上事故', '生產環境', '正式環境', '線上環境', '值班', '待命輪班',
  '你們團隊', '你的團隊在', '上一份工作', '前公司', '你負責的服務',
  'on-call', 'oncall', 'pager duty', 'pagerduty',
  'production outage', 'production incident', 'in production',
  'your last job', 'your previous employer', 'your team at work',
];

// QG-5:本站的專有名詞。刻意只放「不可能在通用技術題裡自然出現」的字串 ——
// 例如不放 portfolio 這個普通名詞,不然 "a project in your portfolio" 會被誤殺。
const SITE_PROPER_NOUNS = ['Wobot', 'YorkieDog', 'MyPortfolio', 'WayneLY'];

// SC-2 前篩用的通用語黑名單。這一份是「放到任何一份答案底下都成立」的場面話。
const GENERIC_SUGGESTION_TERMS = [
  '多加練習', '多練習', '多做練習', '再練習', '持續練習',
  '再多說明', '多說明一點', '說明得更詳細', '可以更詳細', '更詳細一點', '再詳細一點',
  '表達能力有待加強', '繼續加油', '持續努力', '再接再厲', '多充實',
  'practice more', 'more practice', 'keep practicing',
  'be more detailed', 'more detailed', 'elaborate more', 'add more detail',
  'be more specific', 'study more', 'work on your communication',
];

// SC-2 前篩的第二個訊號需要一個「短」的定義。AI-SPEC §5.3 註寫的是 30 字。
const SHORT_SUGGESTION_CHARS = 30;

function asText(value) {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function codePointLength(value) {
  return [...asText(value)].length;
}

// 相似度前的正規化:小寫化、丟掉標點與空白,只留文字與數字。
// 「畫面掉幀,你會怎麼查?」與「畫面掉幀 你會怎麼查」必須算同一題。
function normalizeForBigrams(value) {
  return asText(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function bigramSet(value) {
  const s = normalizeForBigrams(value);
  const out = new Set();
  for (let i = 0; i + 1 < s.length; i += 1) out.add(s.slice(i, i + 2));
  return out;
}

function contentWordSet(value) {
  const out = new Set();
  const words = asText(value).toLowerCase().match(LATIN_TOKEN) || [];
  for (const w of words) if (!EN_STOPWORDS.has(w)) out.add(w);
  return out;
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export function cjkCharCount(value) {
  const runs = asText(value).match(CJK_RUN) || [];
  return runs.reduce((sum, run) => sum + run.length, 0);
}

export function latinTokenCount(value) {
  return (asText(value).toLowerCase().match(LATIN_TOKEN) || []).length;
}

// 語言純度(QG-5)。
//
// 分母刻意用「漢字數 + 英文『詞』數」,不是「漢字數 + 英文字母數」:
// 一個 5 字母的技術名詞(React)若逐字母算,會把「React 的渲染流程」壓到 0.5,
// 於是 zh ≥ 0.6 的門檻會把完全正常的中文題判成不純。QG-5 明說「技術名詞的英文
// 夾雜在 zh 模式是正常的」,逐詞計才符合那個意思。
export function cjkRatio(value) {
  const cjk = cjkCharCount(value);
  const latin = latinTokenCount(value);
  const total = cjk + latin;
  return total === 0 ? 0 : cjk / total;
}

export function bigramJaccard(a, b) {
  return jaccard(bigramSet(a), bigramSet(b));
}

export function tokenJaccard(a, b) {
  return jaccard(contentWordSet(a), contentWordSet(b));
}

// 依語言分派。沒給語言時看有沒有漢字 —— 混合文字一律走 bigram,因為中文題裡
// 夾的英文技術名詞用詞集合比對會過於稀疏。
export function textSimilarity(a, b, language) {
  const lang = language || (cjkCharCount(a) + cjkCharCount(b) > 0 ? 'zh' : 'en');
  return lang === 'en' ? tokenJaccard(a, b) : bigramJaccard(a, b);
}

export function countByType(questions) {
  const list = Array.isArray(questions) ? questions : [];
  let technical = 0;
  let behavioral = 0;
  for (const q of list) {
    const type = q && q.type;
    if (type === 'technical') technical += 1;
    else if (type === 'behavioral') behavioral += 1;
    // 不認得的 type 兩邊都不加 —— 靜默歸類會讓 QG-3 的配比檢查失去意義。
  }
  return { technical, behavioral };
}

function hitsFrom(terms, value) {
  const low = asText(value).toLowerCase();
  return terms.filter((t) => low.includes(t.toLowerCase()));
}

export function fresherAssumptionHits(value) {
  return hitsFrom(FRESHER_ASSUMPTION_TERMS, value);
}

export function sitePropNounHits(value) {
  return hitsFrom(SITE_PROPER_NOUNS, value);
}

export function genericSuggestionHits(value) {
  return hitsFrom(GENERIC_SUGGESTION_TERMS, value);
}

// SC-2 前篩訊號 (a):建議是否引用了「出現在答案、但不出現在題目」的內容詞。
//
// zh 取漢字 bigram(長度 ≥ 2 的內容單位),en 取長度 ≥ 4 的非停用詞。
// 只在同一個漢字連續段內取 bigram,不跨標點 —— 「量測,再導入」不該產生「測再」。
function contentTerms(value) {
  const out = new Set();
  for (const run of asText(value).match(CJK_RUN) || []) {
    for (let i = 0; i + 1 < run.length; i += 1) out.add(run.slice(i, i + 2));
  }
  for (const w of asText(value).toLowerCase().match(LATIN_TOKEN) || []) {
    if (w.length >= 4 && !EN_STOPWORDS.has(w)) out.add(w);
  }
  return out;
}

export function suggestionReusesAnswerTerms(suggestion, answer, questionText) {
  const inQuestion = contentTerms(questionText);
  const inAnswer = contentTerms(answer);
  const inSuggestion = contentTerms(suggestion);
  for (const term of inAnswer) {
    if (!inQuestion.has(term) && inSuggestion.has(term)) return true;
  }
  return false;
}

// 組內最相似的一對(QG-3 的重複題檢查)。回傳值同時帶 pair,記分卡才印得出
// 「是第幾題跟第幾題」—— 只印一個數字的話,超標時還得自己回去翻。
export function maxPairwiseSimilarity(texts, language) {
  const list = Array.isArray(texts) ? texts : [];
  let value = 0;
  let pair = null;
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const s = textSimilarity(list[i], list[j], language);
      if (s > value) {
        value = s;
        pair = [i, j];
      }
    }
  }
  return { value, pair };
}

// 跨兩組的最相似一對(QG-1 的跨軌重疊)。刻意不比組內 —— 同一軌的兩題本來
// 就該互相接近,把它算進來會讓跨軌數字虛高。
export function maxCrossSimilarity(textsA, textsB, language) {
  const a = Array.isArray(textsA) ? textsA : [];
  const b = Array.isArray(textsB) ? textsB : [];
  let value = 0;
  let pair = null;
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      const s = textSimilarity(a[i], b[j], language);
      if (s > value) {
        value = s;
        pair = [i, j];
      }
    }
  }
  return { value, pair };
}

// 逐題評語是否互相重複。
//
// 這一條是實測長出來的:模型回的 questionIndex 是 1-based,而陣列是 0-based,
// 用 questionIndex 對齊會讓兩題拿到逐字相同的評語 —— 整份回饋的格式完全正常,
// 只有逐字讀才看得出錯位。任何「逐題回饋錯位」的 bug 都會在這裡現形。
export function duplicateCommentPairs(perQuestion, options = {}) {
  const threshold = typeof options.threshold === 'number' ? options.threshold : 0.9;
  const list = Array.isArray(perQuestion) ? perQuestion : [];
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = asText(list[i] && list[i].comment).trim();
      const b = asText(list[j] && list[j].comment).trim();
      // 空評語不算重複 —— 那是「評語缺漏」,是另一個問題,混進來只會讓兩邊都難查。
      if (!a || !b) continue;
      const similarity = a === b ? 1 : textSimilarity(a, b);
      if (similarity >= threshold) out.push({ pair: [i, j], similarity });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 聚合檢查 —— evals.test.js 與 run-evals.mjs 直接呼叫這三支。
// 它們一律回「量出來的數值」,不回 PASS/FAIL:閾值屬於斷言那一層,
// 而記分卡要印的是數值本身(趨勢比通過與否有用)。
// ---------------------------------------------------------------------------

export function checkQuestionSet(capture) {
  const questions = (capture && capture.questions) || [];
  const language = (capture && capture.language) || 'zh';
  const texts = questions.map((q) => asText(q && q.text));
  const { technical, behavioral } = countByType(questions);
  const pair = maxPairwiseSimilarity(texts, language);

  const siteHits = [];
  const fresherHits = [];
  texts.forEach((t, index) => {
    for (const hit of sitePropNounHits(t)) siteHits.push({ index, hit });
    for (const hit of fresherAssumptionHits(t)) fresherHits.push({ index, hit });
  });

  return {
    track: (capture && capture.track) || null,
    language,
    count: questions.length,
    tech: technical,
    beh: behavioral,
    maxLen: texts.reduce((m, t) => Math.max(m, codePointLength(t)), 0),
    maxPairJaccard: pair.value,
    maxPairIndices: pair.pair,
    cjkRatioMin: texts.length ? Math.min(...texts.map(cjkRatio)) : 0,
    cjkCharCountMax: texts.reduce((m, t) => Math.max(m, cjkCharCount(t)), 0),
    siteHits,
    fresherHits,
  };
}

// answers:字串或 null 的陣列(null = 跳過)。跳題位置以「這份資料集怎麼寫的」
// 為準,不以模型自己標的 skipped 為準 —— 兩者不一致本身就是要被抓出來的東西。
export function checkScoringShape(result, answers) {
  const per = (result && result.perQuestion) || [];
  const list = Array.isArray(answers) ? answers : [];

  const skippedIndices = [];
  const answeredIndices = [];
  list.forEach((a, i) => {
    const skipped = a == null || asText(a).trim() === '';
    (skipped ? skippedIndices : answeredIndices).push(i);
  });

  const modelSkippedIndices = per
    .map((p, i) => (p && p.skipped === true ? i : -1))
    .filter((i) => i >= 0);

  const skippedHaveGuidance = skippedIndices.every((i) => {
    const p = per[i];
    return !!p && asText(p.comment).trim() !== '' && asText(p.suggestion).trim() !== '';
  });

  const scores = answeredIndices
    .map((i) => per[i] && per[i].score)
    .filter((s) => Number.isFinite(Number(s)))
    .map(Number);
  const scoredMean = scores.length
    ? Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 100) / 100
    : null;

  return {
    perQuestionCount: per.length,
    answeredIndices,
    skippedIndices,
    modelSkippedIndices,
    skippedAligned:
      modelSkippedIndices.length === skippedIndices.length &&
      modelSkippedIndices.every((v, i) => v === skippedIndices[i]),
    skippedHaveGuidance,
    scoredMean,
    scoredCount: scores.length,
    overallScore: result && typeof result.overallScore === 'number' ? result.overallScore : null,
    duplicateComments: duplicateCommentPairs(per),
  };
}

// SC-2 的 Code 前篩。
//
// 【界線 —— 這一支只標記可疑,不判定通過與否。】
// 它的假陽性率不低:一則好建議完全可以不重用答案裡的任何詞(「把你說的那個
// 取捨換成一個具體數字」就是很好的建議,卻一個答案裡的詞都沒引用)。
// SC-2 的判定權在人(swap test),LLM judge 只是排序器,這一支只負責讓人
// 先看最可疑的那幾則。任何把 suspicious 直接當 FAIL 的用法都是誤用。
export function checkSuggestionSpecificity(perQuestion, answers, questions) {
  const per = Array.isArray(perQuestion) ? perQuestion : [];
  return per.map((p, i) => {
    const suggestion = asText(p && p.suggestion);
    const answer = (Array.isArray(answers) && answers[i]) || '';
    const questionText = (Array.isArray(questions) && questions[i]) || '';
    const reusesAnswerTerm = suggestionReusesAnswerTerms(suggestion, answer, questionText);
    const genericHit = genericSuggestionHits(suggestion);
    const length = codePointLength(suggestion);
    return {
      index: typeof (p && p.index) === 'number' ? p.index : i,
      skipped: !!(p && p.skipped),
      reusesAnswerTerm,
      genericHit,
      length,
      // 兩個訊號:(a) 沒引用任何只在答案裡出現的內容詞;(b) 命中通用語且句子很短。
      suspicious: (genericHit.length > 0 && length < SHORT_SUGGESTION_CHARS) || (!reusesAnswerTerm && length < SHORT_SUGGESTION_CHARS),
    };
  });
}

export const CONSTANTS = {
  EN_STOPWORDS: [...EN_STOPWORDS],
  FRESHER_ASSUMPTION_TERMS,
  SITE_PROPER_NOUNS,
  GENERIC_SUGGESTION_TERMS,
  SHORT_SUGGESTION_CHARS,
};
