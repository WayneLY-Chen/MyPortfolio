// 結果頁 —— 總分 / 評等 / 總評 / 免責說明 / 逐題摺疊回饋 / 三個收尾動作(D-09、D-11、D-12、G-6)。
//
// ─────────────────────────────────────────────────────────────────────────────
// 【四條硬性邊界】
// ─────────────────────────────────────────────────────────────────────────────
//   1.(T-05-20)comment / suggestion / summary 全部是模型生成的不可控輸入,
//      一律以 JSX 文字節點渲染。不使用 React 的原始 HTML 注入屬性、不引入 markdown
//      渲染器 —— 為了讓幾個 ** 粗體記號好看一點而開一條 HTML 注入路徑,是很糟的交易。
//   2. 逐題資料一律**以陣列位置對齊**,不採信 payload 裡的任何題號欄位。後端
//      ai.js:703 已經因為採信模型自報的 questionIndex(實測是 1-based)而讓
//      第 1、2 題拿到同一則評語,整份回饋看起來格式完全正常,只有逐字讀才會發現錯位。
//   3.(D-11)`score` 對跳過的題是 `null`,不是 0。「0 分」與「未作答」必須是
//      畫面上兩件不同的事 —— 把未作答顯示成 0 分等於替使用者捏造了一個他沒得到的評價。
//   4.(D-12)列印靠 print CSS + window.print(),不引入任何 PDF 套件;
//      摺疊列表在列印時由 CSS 強制展開,所以 detail 一律渲染進 DOM、只用 display 切換,
//      **不可以**改成條件渲染(那樣印出來的紙上只會有題號和一行預覽)。
//
// 樣式全部在 InterviewTab.jsx 的 <style> 內,這裡不開第二份。

import { useState } from 'react'
import { useToast } from '../ui/Toast'
import { strings } from './interviewStrings'

// UI-SPEC §9:收合狀態的預覽取 comment 前 40 字。這是**預覽**的截斷,不是內容本身
// 被截斷 —— 展開後顯示的一律是完整字串。以 code point 切,免得切在代理對中間。
const PREVIEW_CHARS = 40

function typeLabel(t, type) {
  return type === 'behavioral' ? t.typeBehavioral : t.typeTechnical
}

// 跳過與否只認後端的 skipped 旗標與 score 是否為 null,不用 `!score` 之類的
// truthy 判斷 —— 那會把真的考 0 分的題一起吃掉,變成「未作答」。
function isSkipped(item) {
  return Boolean(item.skipped) || item.score === null || item.score === undefined
}

function badgeText(t, item) {
  return isSkipped(item) ? t.notAnswered : t.scoreBadge(item.score)
}

function previewText(comment) {
  const text = typeof comment === 'string' ? comment : ''
  const chars = Array.from(text)
  return chars.length > PREVIEW_CHARS ? `${chars.slice(0, PREVIEW_CHARS).join('')}……` : text
}

/**
 * 「複製回饋文字」的內容(D-12)。刻意是**純文字**:沒有 markdown 記號、沒有 HTML
 * 標籤。使用者會把它貼進記事本、履歷草稿或訊息視窗,那些地方不會替他渲染 markdown,
 * 一堆 ** 和 ## 只會變成雜訊(而且是二次注入面積)。
 */
export function buildFeedbackText({ result, questions, language }) {
  const t = strings(language)
  const lines = []
  lines.push(t.resultsTitle)
  lines.push(t.copyOverall(result.overallScore))
  lines.push(t.copyRating(result.rating))
  lines.push('')
  lines.push(result.summary)
  lines.push('')
  lines.push(t.qaHeading)

  const perQuestion = Array.isArray(result.perQuestion) ? result.perQuestion : []
  perQuestion.forEach((item, i) => {
    const question = questions && questions[i] ? questions[i] : null
    lines.push('')
    lines.push(`${t.questionOrdinal(i + 1)} · ${typeLabel(t, question && question.type)} · ${badgeText(t, item)}`)
    if (question) lines.push(`${t.copyQuestionLabel}${question.text}`)
    if (item.comment) lines.push(`${t.copyCommentLabel}${item.comment}`)
    if (item.suggestion) lines.push(`${t.copySuggestionLabel}${item.suggestion}`)
  })

  lines.push('')
  lines.push(t.disclaimer)
  return lines.join('\n')
}

/**
 * @param {{
 *   result: {
 *     overallScore: number, rating: string, summary: string,
 *     perQuestion: Array<{ index: number, skipped: boolean, score: number|null, comment: string, suggestion: string }>,
 *   },
 *   questions: Array<{ index: number, type: string, text: string }>,
 *   onRestart: () => void,
 * }} props
 */
export default function InterviewResults({ result, questions, language, onRestart }) {
  const t = strings(language)
  // 允許同時展開多列 —— 使用者常常要把兩題的建議並排比對,展開一列就收掉另一列
  // 會讓他一直來回點。預設全部收合(UI-SPEC §9)。
  const [openIndexes, setOpenIndexes] = useState(() => new Set())

  const { addToast } = useToast()

  const toggle = (i) => {
    setOpenIndexes((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildFeedbackText({ result, questions, language }))
      addToast({ title: t.copySuccess, variant: 'success', duration: 2000 })
    } catch {
      // 不得只寫 console 靜默失敗 —— 使用者要知道改用手動選取才拿得到內容。
      addToast({
        title: t.copyFailed,
        description: t.copyFailedHint,
        variant: 'error',
      })
    }
  }

  const perQuestion = Array.isArray(result.perQuestion) ? result.perQuestion : []

  return (
    <div className="iv-results">
      <h2 className="iv-results-title">{t.resultsTitle}</h2>

      {/* 總分是結果頁唯一的視覺焦點,也是 accent 白名單第 5 項。
          G-7:分數本身照後端給的原樣顯示,不做任何裁切 —— 後端已經夾過 0-100 並
          自己重算總分,前端再夾一次只會讓「注入成功導致異常分數」這件事在正式環境
          變得看不見(後端已為此記了一行可 grep 的 warn)。日後若加分數條,
          要 clamp 的是**條的寬度**(CSS 寬度不能吃 999%,那是渲染必然),不是數字。 */}
      <div className="iv-score-block">
        <p className="iv-score-line">
          <span className="iv-score-number">{result.overallScore}</span>
          <span className="iv-score-unit">{t.scoreUnit}</span>
        </p>
        {/* 評等文字逐字採用後端 schema 的 enum(優秀 / 良好 / 尚需加強;
            Excellent / Good / Needs work),不改寫。徽章一律中性外觀,
            **不依分數高低變色** —— 用顏色分好壞等於偷偷建立一套語意色系統(D-28)。 */}
        <span className="iv-rating-badge">{result.rating}</span>
      </div>

      <p className="iv-summary">{result.summary}</p>

      {/* G-6:免責說明固定顯示,而且不在 print CSS 的隱藏清單內 ——
          這是一份使用者可能真的印出來帶走的紙,免責語境在紙上更重要而非更不重要。 */}
      <p className="iv-disclaimer">{t.disclaimer}</p>

      <h3 className="iv-qa-heading">{t.qaHeading}</h3>
      <div className="iv-qa-list">
        {perQuestion.map((item, i) => {
          const question = questions && questions[i] ? questions[i] : null
          const open = openIndexes.has(i)
          const detailId = `iv-qa-detail-${i}`
          return (
            <div key={i} className={`iv-qa-item ${open ? 'iv-qa-item--open' : ''}`}>
              {/* 整列可點。用 <button> 而不是掛 onClick 的 div ——
                  鍵盤可聚焦、Enter/Space 可觸發、aria-expanded 會被輔助技術唸出來,
                  這三件事都是免費拿到的。 */}
              <button
                type="button"
                className="iv-qa-summary-row"
                aria-expanded={open}
                aria-controls={detailId}
                onClick={() => toggle(i)}
              >
                <span className="iv-qa-index">{t.questionOrdinal(i + 1)}</span>
                <span className="iv-qa-type-tag">{typeLabel(t, question && question.type)}</span>
                <span className="iv-qa-badge">{badgeText(t, item)}</span>
                <span className="iv-qa-preview">{previewText(item.comment)}</span>
              </button>

              {/* 一律渲染,只用 display 切換(見檔頭邊界 4)。 */}
              <div className="iv-qa-detail" id={detailId}>
                {question && <p className="iv-qa-question">{question.text}</p>}
                <p className="iv-qa-comment">{item.comment}</p>
                {/* D-11:跳過的題沒有分數,但仍要有「這題可以怎麼答」的方向。
                    suggestion 對跳過的題照樣顯示,不因未作答而藏起來。 */}
                <p className="iv-qa-suggestion-label">{t.suggestionLabel}</p>
                <p className="iv-qa-suggestion">{item.suggestion}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* 三個收尾動作視覺權重相同,沒有一顆是 accent 填色(UI-SPEC §11)——
          結果頁的主要動作已經完成,用 accent 只會製造虛假的急迫感。
          注意:「重新面試」只出現在這個畫面。它絕不能與「重試評分」同時在場,
          因為在評分失敗那個畫面上誤觸它,才是真正的資料遺失(UI-SPEC §8 反例三)。 */}
      <div className="iv-actions-row">
        <button type="button" className="iv-action-btn" onClick={onRestart}>
          {t.restart}
        </button>
        <button type="button" className="iv-action-btn" onClick={handleCopy}>
          {t.copyFeedback}
        </button>
        <button type="button" className="iv-action-btn" onClick={() => window.print()}>
          {t.printPdf}
        </button>
      </div>
    </div>
  )
}
