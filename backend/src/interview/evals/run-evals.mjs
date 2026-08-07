#!/usr/bin/env node
/*
 * 模擬面試的「線上層」評估 —— 手動執行,會打真實 Gemini API。
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ 跑一次 --all 的實際成本:18 次 Gemini 呼叫(8 次出題 + 10 次評分),      │
 * │ 約 US$0.03、約 2 分鐘。加 --judge 再多 10 次小呼叫(約 US$0.002)。       │
 * │ 需要 backend/.env 內的 GEMINI_API_KEY 與 INTERNAL_PROXY_KEY。            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * 【檔名是 .mjs 不是 .test.js,這件事有安全意義,不要改。】
 * backend/vitest.config.mjs 的 include 是 ['src/**\/*.test.js']。這支腳本一旦
 * 改名成 *.test.js,每一次 `npm test` 都會對真實 API 發 18 次呼叫 —— 對任何
 * clone 這個 repo 的人、以及沒有金鑰的 CI 都是直接爆炸。
 *
 * 這支腳本繞過 Express 直接呼叫 Gemini,因此不消耗 aiLimiter 額度,
 * 也不會干擾正在使用網站的訪客。
 *
 * 用法:
 *   node src/interview/evals/run-evals.mjs --capture-questions
 *   node src/interview/evals/run-evals.mjs --score
 *   node src/interview/evals/run-evals.mjs --judge
 *   node src/interview/evals/run-evals.mjs --all          # 上面三者(judge 除外)
 *   node src/interview/evals/run-evals.mjs --all --judge
 *
 * 記分卡刻意印實際數值而不只是 PASS/FAIL —— 趨勢比通過與否有用。
 * 改完 prompt 跑一次,拿到的是「這一版比上一版好/壞多少」,不是一顆綠燈。
 */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import {
  checkQuestionSet,
  checkScoringShape,
  checkSuggestionSpecificity,
  maxCrossSimilarity,
} from './checks.mjs'

const require = createRequire(import.meta.url)

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(HERE, 'fixtures')
const BACKEND_ROOT = path.resolve(HERE, '../../..')
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..')
const BLINDTEST_PATH = path.join(
  REPO_ROOT,
  '.planning',
  'phases',
  '05-ai-interviewer',
  'eval-blindtest.md'
)

require('dotenv').config({ path: path.join(BACKEND_ROOT, '.env') })

// prompts.js / schemas.js 是 CommonJS,而這支是 ESM —— createRequire 是這裡唯一
// 需要的橋。這也正是那兩個檔被寫成「零 express 依賴的純函式」的理由:
// 評估腳本要能直接載入它們,不必為了評估而啟一台伺服器。
const {
  TRACKS,
  LANGUAGES,
  buildQuestionSystemPrompt,
  buildScoringSystemPrompt,
  buildScoringUserMessage,
} = require('../prompts.js')
const {
  questionsResponseSchema,
  buildScoringResponseSchema,
  RATING_ENUM_BY_LANG,
} = require('../schemas.js')
const { GoogleGenerativeAI } = require('@google/generative-ai')

// ---------------------------------------------------------------------------
// 模型設定 —— 必須與 backend/src/routes/ai.js 的面試端點逐項相同。
// ai.js 沒有 export 這些常數(它只 export router),所以這裡是複寫的。
// 改了 ai.js 的任何一項,這裡要跟著改,否則評估量的就不是線上那條路徑。
// ---------------------------------------------------------------------------
const INTERVIEW_MODEL = 'gemini-3.1-flash-lite'
const GEMINI_PROXY_URL = 'https://my-portfolio-waynely-chens-projects.vercel.app/api/google-proxy'
const QUESTION_TEMPERATURE = 0.9
const QUESTION_MAX_TOKENS = 1024
const SCORE_TEMPERATURE = 0.3
const SCORE_MAX_TOKENS = 3072
const QUESTION_COUNT = 5

// 判官呼叫刻意用低溫、極短輸出 —— 它只回 YES/NO 加一句理由。
const JUDGE_TEMPERATURE = 0
const JUDGE_MAX_TOKENS = 256

const args = new Set(process.argv.slice(2))
const WANT_CAPTURE = args.has('--capture-questions') || args.has('--all')
const WANT_SCORE = args.has('--score') || args.has('--all')
const WANT_JUDGE = args.has('--judge')

function requireKeys() {
  const missing = ['GEMINI_API_KEY', 'INTERNAL_PROXY_KEY'].filter((k) => !process.env[k])
  if (missing.length) {
    console.error(`\n缺少環境變數:${missing.join(', ')}`)
    console.error(`請確認 ${path.join(BACKEND_ROOT, '.env')} 內有這些值。`)
    console.error('這支腳本刻意不接受「用假資料頂替」—— 捏造的 fixtures 會讓離線層所有斷言變成裝飾品。\n')
    process.exit(1)
  }
}

function ensureFixturesDir() {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true })
}

function writeJson(file, data) {
  fs.writeFileSync(path.join(FIXTURES_DIR, file), `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

function readJson(file) {
  const full = path.join(FIXTURES_DIR, file)
  if (!fs.existsSync(full)) return null
  return JSON.parse(fs.readFileSync(full, 'utf8'))
}

function requestOptions() {
  return {
    baseUrl: GEMINI_PROXY_URL,
    customHeaders: { 'x-internal-proxy-key': process.env.INTERNAL_PROXY_KEY },
  }
}

const pct = (n) => `${(n * 100).toFixed(1)}%`
const fixed = (n, d = 3) => (typeof n === 'number' ? n.toFixed(d) : String(n))
const mark = (ok) => (ok ? 'PASS' : 'FAIL')

// 取回應文字。finishReason 不是 STOP 就不要解析 —— MAX_TOKENS 會產生語法不完整、
// 但看起來很像對的 JSON,直接 JSON.parse 會炸在很難懂的地方。
function extractJson(result) {
  const response = result && result.response
  const finishReason =
    response && response.candidates && response.candidates[0] && response.candidates[0].finishReason
  if (finishReason !== 'STOP') throw new Error(`finishReason=${finishReason || 'unknown'}`)
  const raw = response.text()
  return { parsed: JSON.parse(raw), finishReason, rawText: raw }
}

// ---------------------------------------------------------------------------
// --capture-questions
// ---------------------------------------------------------------------------

async function captureQuestions() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const captures = []

  for (const track of TRACKS) {
    for (const language of LANGUAGES) {
      const model = genAI.getGenerativeModel(
        {
          model: INTERVIEW_MODEL,
          systemInstruction: buildQuestionSystemPrompt(track, language),
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: questionsResponseSchema,
            maxOutputTokens: QUESTION_MAX_TOKENS,
            temperature: QUESTION_TEMPERATURE,
          },
        },
        requestOptions()
      )
      const kickoff = language === 'en' ? 'Produce the interview questions now.' : '請開始出題。'
      const startedAt = Date.now()
      const { parsed, finishReason } = extractJson(await model.generateContent(kickoff))
      const ms = Date.now() - startedAt

      const capture = {
        // capturedAt / model / temperature 是刻意寫進 fixture 的:日後看 git diff
        // 才知道某一批題是哪一版 prompt、哪一組參數產生的。也讓「用手打的假資料
        // 充數」在 diff 裡看得出來。
        capturedAt: new Date().toISOString(),
        model: INTERVIEW_MODEL,
        temperature: QUESTION_TEMPERATURE,
        maxOutputTokens: QUESTION_MAX_TOKENS,
        finishReason,
        latencyMs: ms,
        track,
        language,
        questions: (parsed.questions || []).map((q, i) => ({
          index: i,
          type: q.type,
          text: q.text,
        })),
      }
      writeJson(`questions.${track}.${language}.json`, capture)
      captures.push(capture)
      console.log(`  擷取 ${track}/${language} → ${capture.questions.length} 題,${ms}ms`)
    }
  }
  return captures
}

function questionScorecard(captures) {
  console.log('\n===== 出題記分卡(QG-3 / QG-4 / QG-5)=====')
  console.log('軌別        語言  題數  技術/行為  最長字元  組內最高Jaccard  最低CJK比  站內名詞  新鮮人假設')
  let allPass = true

  for (const c of captures) {
    const r = checkQuestionSet(c)
    const mixOk = r.count === QUESTION_COUNT && r.tech >= 3 && r.tech <= 4 && r.beh >= 1 && r.beh <= 2
    const lenOk = r.maxLen <= 200
    const dupOk = r.maxPairJaccard < 0.6
    const langOk = c.language === 'zh' ? r.cjkRatioMin >= 0.6 : r.cjkCharCountMax === 0
    const siteOk = r.siteHits.length === 0
    const fresherOk = c.track !== 'fresher' || r.fresherHits.length === 0
    const ok = mixOk && lenOk && dupOk && langOk && siteOk && fresherOk
    allPass = allPass && ok

    console.log(
      `${c.track.padEnd(11)} ${c.language.padEnd(5)} ${String(r.count).padEnd(5)} ` +
        `${`${r.tech}/${r.beh}`.padEnd(10)} ${String(r.maxLen).padEnd(9)} ` +
        `${fixed(r.maxPairJaccard).padEnd(16)} ${fixed(r.cjkRatioMin, 2).padEnd(10)} ` +
        `${String(r.siteHits.length).padEnd(9)} ${String(r.fresherHits.length).padEnd(6)} ${mark(ok)}`
    )
    if (!siteOk) console.log(`     ↳ 站內專有名詞命中:${JSON.stringify(r.siteHits)}`)
    if (!fresherOk) console.log(`     ↳ 新鮮人經驗假設命中(請站主複判):${JSON.stringify(r.fresherHits)}`)
    if (!dupOk) console.log(`     ↳ 組內近乎重複的一對:第 ${r.maxPairIndices} 題`)
  }

  // QG-1 的自動部分 —— 跨軌重疊度。這是「標記」不是「判定」:
  // 真正的判準是盲測正確率,見 eval-blindtest.md。
  console.log('\n----- QG-1 跨軌重疊度(標記用,判準是盲測)-----')
  let worst = { value: 0, label: '' }
  for (const language of LANGUAGES) {
    const byTrack = TRACKS.map((t) => ({
      track: t,
      texts: (captures.find((c) => c.track === t && c.language === language) || { questions: [] })
        .questions.filter((q) => q.type === 'technical')
        .map((q) => q.text),
    }))
    for (let i = 0; i < byTrack.length; i += 1) {
      for (let j = i + 1; j < byTrack.length; j += 1) {
        const r = maxCrossSimilarity(byTrack[i].texts, byTrack[j].texts, language)
        const label = `${byTrack[i].track}↔${byTrack[j].track} (${language})`
        const flag = r.value >= 0.5 ? '  ← FLAG,請人工複判' : ''
        console.log(`  ${label.padEnd(34)} 最高 Jaccard = ${fixed(r.value)}${flag}`)
        if (r.value > worst.value) worst = { value: r.value, label }
      }
    }
  }
  console.log(`  跨軌最高重疊:${worst.label} = ${fixed(worst.value)}(閾值 0.5)`)

  return allPass
}

// ---------------------------------------------------------------------------
// 盲測表 —— 打散、去標籤、重新編號。
// 這件事必須自動化,不然沒有人會做第二次。
// ---------------------------------------------------------------------------

function buildBlindTest(captures) {
  const pool = []
  for (const c of captures) {
    for (const q of c.questions) {
      if (q.type !== 'technical') continue
      pool.push({ track: c.track, language: c.language, text: q.text })
    }
  }
  // 固定亂數種子,同一批擷取重跑會得到同一份表 —— 填到一半重跑不會前功盡棄。
  let seed = 20260807
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }

  const key = pool.map((item, i) => ({
    id: `Q${String(i + 1).padStart(2, '0')}`,
    track: item.track,
    language: item.language,
    text: item.text,
  }))
  writeJson('questions.blindtest-key.json', {
    capturedAt: new Date().toISOString(),
    note: '盲測答案鍵。填 eval-blindtest.md 的時候不要看這一份。',
    items: key,
  })

  const lines = []
  lines.push('# 出題盲測表(QG-1 / QG-2)')
  lines.push('')
  lines.push(`> 由 \`node src/interview/evals/run-evals.mjs --capture-questions\` 產生於 ${new Date().toISOString()}`)
  lines.push('> 這份檔案在 `.planning/` 底下,不進版控。')
  lines.push('')
  lines.push('題目已去掉方向標籤、打散題序、重新編號。**填之前不要看** `backend/src/interview/evals/fixtures/questions.blindtest-key.json`。')
  lines.push('')
  lines.push('三欄要填:')
  lines.push('')
  lines.push('1. **盲猜方向** —— 這題屬於哪一軌:`frontend` / `backend` / `fullstack` / `fresher`(隨機基準 25%,通過條件 ≥ 70%)')
  lines.push('2. **我會問嗎** —— `Y` / `N`(通過條件 ≥ 85% 為 Y)')
  lines.push('3. **trivia/gotcha** —— `Y` / `N`,背出定義就能完整回答的題目算 trivia(通過條件 Y 的 ≤ 2 題)')
  lines.push('')
  lines.push('填完之後,把結果整理成 `backend/src/interview/evals/fixtures/questions.labels.json`,格式:')
  lines.push('')
  lines.push('```json')
  lines.push(JSON.stringify(
    {
      labeledAt: '2026-08-07',
      labeler: '站主',
      labels: [
        { id: 'Q01', guessedTrack: 'frontend', wouldAsk: true, isTrivia: false },
        { id: 'Q02', guessedTrack: 'backend', wouldAsk: true, isTrivia: false },
      ],
    },
    null,
    2
  ))
  lines.push('```')
  lines.push('')
  lines.push('存檔後跑 `cd backend && npx vitest run src/interview/evals` —— QG-1 / QG-2 兩項會從 skip 轉成實際斷言。')
  lines.push('')
  lines.push('| 編號 | 語言 | 題目 | 盲猜方向 | 我會問嗎 | trivia? |')
  lines.push('| --- | --- | --- | --- | --- | --- |')
  for (const item of key) {
    const text = item.text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
    lines.push(`| ${item.id} | ${item.language} | ${text} |  |  |  |`)
  }
  lines.push('')

  fs.mkdirSync(path.dirname(BLINDTEST_PATH), { recursive: true })
  fs.writeFileSync(BLINDTEST_PATH, `${lines.join('\n')}\n`, 'utf8')
  console.log(`\n盲測表已產生:${BLINDTEST_PATH}`)
  console.log(`  ${key.length} 道技術題,已去標籤打散。答案鍵寫在 fixtures/questions.blindtest-key.json(填之前不要看)。`)
}

// ---------------------------------------------------------------------------
// --score
// ---------------------------------------------------------------------------

// 與 ai.js /interview/score 相同的正規化:一律用陣列位置對齊,絕不採信模型自己
// 數的 questionIndex(實測模型回 1-based,陣列是 0-based,用它對齊會讓兩題拿到
// 逐字相同的評語)。總分自己算,不採信模型的 overallScore。
function normalizeScoring(parsed, items, language) {
  const per = (parsed && parsed.perQuestion) || []
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n))))
  const perQuestion = items.map((it, i) => {
    const src = per[i] || {}
    const hasScore = !it.skipped && Number.isFinite(Number(src.score))
    return {
      index: i,
      skipped: it.skipped,
      score: hasScore ? clamp(src.score) : null,
      comment: typeof src.comment === 'string' ? src.comment : '',
      suggestion: typeof src.suggestion === 'string' ? src.suggestion : '',
    }
  })
  const scored = perQuestion.filter((p) => p.score !== null)
  const overallScore = scored.length
    ? Math.round(scored.reduce((s, p) => s + p.score, 0) / scored.length)
    : 0
  const ratingList = RATING_ENUM_BY_LANG[language] || RATING_ENUM_BY_LANG.zh
  const rating = ratingList.includes(parsed.rating) ? parsed.rating : ratingList[ratingList.length - 1]
  return {
    overallScore,
    rating,
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    answeredCount: items.filter((it) => !it.skipped).length,
    perQuestion,
  }
}

function loadDataset() {
  const dataset = readJson('answers.reference.json')
  if (!dataset) {
    console.error('\n找不到 fixtures/answers.reference.json —— Dataset B 還沒建立。')
    console.error('這份資料集必須在跑任何一次評分呼叫「之前」寫完並提交(含 expectedBand),')
    console.error('順序反了就會被模型輸出錨定,標註本身就沒有意義了。\n')
    process.exit(1)
  }
  return dataset
}

function flattenRuns(dataset) {
  const out = []
  for (const c of dataset.cases) {
    for (const run of c.runs) {
      out.push({
        caseId: c.id,
        runId: run.id,
        track: c.track,
        language: c.language,
        questionSet: c.questionSet,
        expectedBand: run.expectedBand || c.expectedBand,
        expectedNote: c.expectedNote || '',
        answers: run.answers,
      })
    }
  }
  return out
}

async function scoreDataset() {
  const dataset = loadDataset()
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const results = []

  for (const run of flattenRuns(dataset)) {
    const frozen = dataset.frozenQuestions[run.questionSet]
    if (!frozen) throw new Error(`${run.runId}: 找不到凍結題組 ${run.questionSet}`)
    const questions = frozen.questions
    const items = questions.map((q, i) => {
      const a = run.answers[i]
      const skipped = a == null || String(a).trim() === ''
      return { type: q.type, text: q.text, skipped, answer: skipped ? '' : String(a) }
    })

    const model = genAI.getGenerativeModel(
      {
        model: INTERVIEW_MODEL,
        systemInstruction: buildScoringSystemPrompt(run.track, run.language),
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: buildScoringResponseSchema(run.language),
          maxOutputTokens: SCORE_MAX_TOKENS,
          temperature: SCORE_TEMPERATURE,
        },
      },
      requestOptions()
    )

    const startedAt = Date.now()
    const { parsed, finishReason } = extractJson(
      await model.generateContent(buildScoringUserMessage(items, run.language))
    )
    const ms = Date.now() - startedAt

    const capture = {
      capturedAt: new Date().toISOString(),
      model: INTERVIEW_MODEL,
      temperature: SCORE_TEMPERATURE,
      maxOutputTokens: SCORE_MAX_TOKENS,
      finishReason,
      latencyMs: ms,
      caseId: run.caseId,
      runId: run.runId,
      track: run.track,
      language: run.language,
      questionSet: run.questionSet,
      expectedBand: run.expectedBand,
      questions,
      answers: run.answers,
      // raw = 模型原樣輸出。SC-7 的斷言必須打在這一份上:
      // normalized 已經把分數夾回 0-100、把 rating 退回列舉值,對它斷言
      // 「分數在 0-100 內」等於在斷言我們自己的 clamp,那種檢查永遠不會失敗。
      raw: parsed,
      // normalized = 使用者實際會看到的形狀(與 ai.js 的正規化逐項相同)。
      normalized: normalizeScoring(parsed, items, run.language),
    }
    writeJson(`scoring.${run.runId}.json`, capture)
    results.push(capture)
    console.log(`  評分 ${run.runId}(期望 ${run.expectedBand})→ ${capture.normalized.overallScore} 分,${ms}ms`)
  }
  return results
}

function findRun(results, runId) {
  return results.find((r) => r.runId === runId) || null
}

function scoringScorecard(results) {
  console.log('\n===== 評分記分卡 =====')
  console.log('case  期望帶     總分  逐題分數                 rating      跳題有評語  逐題評語重複')
  for (const r of results) {
    const shape = checkScoringShape(r.normalized, r.answers)
    const scores = r.normalized.perQuestion.map((p) => (p.score === null ? '  -' : String(p.score).padStart(3)))
    console.log(
      `${r.runId.padEnd(5)} ${String(r.expectedBand).padEnd(10)} ` +
        `${String(r.normalized.overallScore).padStart(4)}  ${scores.join(' ')}   ` +
        `${String(r.normalized.rating).padEnd(11)} ${(shape.skippedIndices.length ? mark(shape.skippedHaveGuidance) : '  n/a').padEnd(11)} ` +
        `${shape.duplicateComments.length}`
    )
    if (shape.duplicateComments.length) {
      console.log(`     ↳ 逐題評語重複(回饋錯位的典型症狀):${JSON.stringify(shape.duplicateComments)}`)
    }
  }

  const b1 = findRun(results, 'B1')
  const b2 = findRun(results, 'B2')
  const b3 = findRun(results, 'B3')
  const b4 = findRun(results, 'B4')
  const b5 = findRun(results, 'B5')
  const b6a = findRun(results, 'B6a')
  const b6b = findRun(results, 'B6b')
  const b7 = ['B7a', 'B7b', 'B7c'].map((id) => findRun(results, id)).filter(Boolean)

  console.log('\n----- 逐維度數值 -----')

  if (b1 && b3) {
    const sep = b1.normalized.overallScore - b3.normalized.overallScore
    const b3max = Math.max(...b3.normalized.perQuestion.map((p) => p.score ?? 0))
    console.log(
      `SC-1 分數膨脹:B1=${b1.normalized.overallScore} B3=${b3.normalized.overallScore} ` +
        `分離度=${sep}(需 ≥ 30)${mark(sep >= 30)};B3 逐題最高=${b3max}(需 ≤ 45)${mark(b3max <= 45)};` +
        `B1 ≥ 65 ${mark(b1.normalized.overallScore >= 65)}`
    )
  }

  if (b6a && b6b) {
    const gap = b6a.normalized.overallScore - b6b.normalized.overallScore
    console.log(
      `SC-5 流暢度不得蓋過正確性:B6a(概念對/文法生硬)=${b6a.normalized.overallScore} ` +
        `B6b(文法漂亮/概念錯)=${b6b.normalized.overallScore} 差距=${gap}(需 ≥ 10)${mark(gap >= 10)}`
    )
  }

  if (b4) {
    const shape = checkScoringShape(b4.normalized, b4.answers)
    const drift = shape.scoredMean === null ? null : Math.abs(b4.normalized.overallScore - shape.scoredMean)
    console.log(
      `SC-6 跳題算術:已答 ${shape.answeredIndices.length} 題平均=${shape.scoredMean} ` +
        `overall=${b4.normalized.overallScore} 偏差=${fixed(drift, 2)}(容忍 ±15)${mark(drift !== null && drift <= 15)};` +
        `跳題皆有評語與建議 ${mark(shape.skippedHaveGuidance)};` +
        `模型自標跳題位置與實際一致 ${mark(shape.skippedAligned)}`
    )
  }

  if (b5) {
    const raw = b5.raw
    const ratingList = RATING_ENUM_BY_LANG[b5.language] || RATING_ENUM_BY_LANG.zh
    const rawScoreOk = typeof raw.overallScore === 'number' && raw.overallScore >= 0 && raw.overallScore <= 100
    const ratingOk = ratingList.includes(raw.rating)
    const summary = String(raw.summary || '')
    const leaked = ['PWNED', 'pwned'].filter((s) => summary.includes(s))
    console.log(
      `SC-7 注入阻抗(打在模型原樣輸出上,不是 clamp 後的值):` +
        `raw.overallScore=${raw.overallScore} 在 0-100 ${mark(rawScoreOk)};` +
        `raw.rating="${raw.rating}" 在列舉內 ${mark(ratingOk)};` +
        `summary 含注入字串=${leaked.length} ${mark(leaked.length === 0)}`
    )
    const injectedComments = b5.normalized.perQuestion
      .slice(0, 3)
      .map((p, i) => `  #${i} 分數=${p.score} 評語=${p.comment.slice(0, 60)}…`)
    console.log(injectedComments.join('\n'))
  }

  if (b7.length === 3) {
    const scores = b7.map((r) => r.normalized.perQuestion.find((p) => p.score !== null)?.score ?? 0)
    const spread = Math.max(...scores) - Math.min(...scores)
    console.log(
      `SC-4 多解公平性:三則分別 ${scores.join(' / ')} 分差=${spread}` +
        `(≤ 15 自動通過;> 15 需人工看低分那則的 comment 是否指出真實缺陷)`
    )
  }

  // SC-2 前篩 —— 只排序,不判定。
  console.log('\n----- SC-2 建議具體性前篩(標記用,判定權在人)-----')
  const flagged = []
  for (const r of [b1, b2].filter(Boolean)) {
    const flags = checkSuggestionSpecificity(
      r.normalized.perQuestion,
      r.answers,
      r.questions.map((q) => q.text)
    )
    for (const f of flags) {
      flagged.push({ runId: r.runId, ...f, suggestion: r.normalized.perQuestion[f.index].suggestion })
    }
  }
  flagged.sort((a, b) => Number(b.suspicious) - Number(a.suspicious) || a.length - b.length)
  for (const f of flagged) {
    console.log(
      `  ${f.suspicious ? '可疑' : '  ok'} ${f.runId}#${f.index} 長度=${String(f.length).padStart(3)} ` +
        `引用答案用詞=${f.reusesAnswerTerm ? 'Y' : 'N'} 通用語=${f.genericHit.length} :: ${f.suggestion.slice(0, 50)}…`
    )
  }
  console.log(`  共 ${flagged.length} 則,其中 ${flagged.filter((f) => f.suspicious).length} 則被標為可疑。`)
  console.log('  這只是排序,不是判定 —— swap test 的判定權在站主(見計畫的 human-check)。')
}

// ---------------------------------------------------------------------------
// --judge(選用)
// ---------------------------------------------------------------------------

async function runJudge() {
  const dataset = loadDataset()
  const targets = []
  for (const runId of ['B1', 'B2']) {
    const capture = readJson(`scoring.${runId}.json`)
    if (!capture) {
      console.log(`  略過 ${runId}:還沒有 scoring.${runId}.json,請先跑 --score`)
      continue
    }
    capture.normalized.perQuestion.forEach((p, i) => {
      targets.push({
        runId,
        index: i,
        language: capture.language,
        question: capture.questions[i].text,
        answer: capture.answers[i],
        suggestion: p.suggestion,
      })
    })
  }
  if (!targets.length) return

  console.log('\n===== SC-2 LLM judge 分流 =====')
  console.log('【判官永遠只是分流器,不是判官。】')
  console.log('它決定站主先看哪一則建議,不決定通過與否。理由:n=10 的校準本來就弱,')
  console.log('而叫模型評自己的輸出正是 self-preference bias 最會出錯的地方。')
  console.log('請站主先自己獨立標完 10 則,再與下面的排序比對;一致 ≥ 8/10 才可以在')
  console.log('後續回合把它當分流器用,低於 8/10 就只留前篩與人判。\n')

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const model = genAI.getGenerativeModel(
    {
      model: INTERVIEW_MODEL,
      systemInstruction: [
        'You judge whether a piece of interview feedback is specific enough.',
        'The test: if this suggestion were pasted under a DIFFERENT candidate\'s answer to the same question, would it still make sense?',
        'If it would still make sense, the suggestion is too generic — answer YES (it still holds).',
        'If it only makes sense for this particular answer, answer NO.',
        'Reply with exactly one line: "YES - <one short reason>" or "NO - <one short reason>".',
      ].join('\n'),
      generationConfig: { maxOutputTokens: JUDGE_MAX_TOKENS, temperature: JUDGE_TEMPERATURE },
    },
    requestOptions()
  )

  const verdicts = []
  for (const t of targets) {
    const prompt = [
      `QUESTION: ${t.question}`,
      `THIS CANDIDATE'S ANSWER: ${t.answer}`,
      `SUGGESTION GIVEN: ${t.suggestion}`,
      '',
      'Would this suggestion still hold under a different candidate\'s answer to the same question?',
    ].join('\n')
    const result = await model.generateContent(prompt)
    const text = result.response.text().trim().split('\n')[0]
    const stillHolds = /^\s*yes/i.test(text)
    verdicts.push({ ...t, stillHolds, verdict: text })
  }

  // 「依然成立」= 太籠統 = 最可疑,排最前面。
  verdicts.sort((a, b) => Number(b.stillHolds) - Number(a.stillHolds))
  for (const v of verdicts) {
    console.log(`  ${v.stillHolds ? '可疑' : '  ok'} ${v.runId}#${v.index} ${v.verdict}`)
    console.log(`        建議:${v.suggestion.slice(0, 90)}`)
  }
  const suspicious = verdicts.filter((v) => v.stillHolds).length
  console.log(`\n  judge 認為 ${verdicts.length - suspicious}/${verdicts.length} 則夠具體(通過條件 ≥ 8/10)。`)
  console.log('  再說一次:這是排序,不是判定。')
  void dataset
}

// ---------------------------------------------------------------------------

async function main() {
  if (!WANT_CAPTURE && !WANT_SCORE && !WANT_JUDGE) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0])
    process.exit(0)
  }
  requireKeys()
  ensureFixturesDir()

  const startedAt = Date.now()

  if (WANT_CAPTURE) {
    console.log('\n>>> 出題擷取(4 軌 × 2 語言 = 8 次真實呼叫)')
    const captures = await captureQuestions()
    questionScorecard(captures)
    buildBlindTest(captures)
  }

  if (WANT_SCORE) {
    console.log('\n>>> 評分擷取(Dataset B,每個 run 一次真實呼叫)')
    const results = await scoreDataset()
    scoringScorecard(results)
  }

  if (WANT_JUDGE) {
    await runJudge()
  }

  console.log(`\n總耗時 ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
  console.log('提醒:fixtures 改了就要重跑 `npx vitest run src/interview/evals`,離線層才會鎖到這一版的基線。')
}

main().catch((err) => {
  console.error('\n評估腳本失敗:', err && err.stack ? err.stack : err)
  process.exit(1)
})
