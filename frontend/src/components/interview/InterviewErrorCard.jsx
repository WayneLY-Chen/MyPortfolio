// 面試的錯誤畫面 —— 兩個階段共用同一張卡,以及評分階段專屬的「作答保留區」。
//
// ─────────────────────────────────────────────────────────────────────────────
// 【這個檔案存在的唯一理由:D-20】
// ─────────────────────────────────────────────────────────────────────────────
// 出題失敗時使用者還沒投入任何東西,損失只有等待時間,所以錯誤卡是整個畫面唯一
// 的內容就夠了。評分失敗完全是另一回事:使用者剛剛打完五段字,此刻他最怕的不是
// 「AI 壞了」,而是「我打的字沒了」。所以評分失敗的畫面必須在**同一次渲染**裡
// 同時回答兩件事:出了什麼問題(錯誤卡),以及你的字都還在(作答保留區)。
//
// 文案的唯一來源是 resolveInterviewError()(05-02,已用 deepStrictEqual 釘死)。
// 這個元件裡**不得**再寫第二份錯誤文案表 —— 兩份文案表遲早會漂移,而錯誤畫面
// 恰好是最不會被日常操作走到、因此最不會被發現漂移的地方。
//
// 樣式全部在 InterviewTab.jsx 的 <style> 內,這裡不開第二份。

import { resolveInterviewError } from './interviewErrors'
import { strings } from './interviewStrings'

/**
 * @param {{
 *   stage: 'questions' | 'scoring',
 *   status?: number | null,
 *   code?: string | null,
 *   onRetry: () => void,
 * }} props
 */
export default function InterviewErrorCard({ stage, status, code, language, onRetry }) {
  // eyebrow / title / body / buttonLabel 四個字串全部來自對照表。
  // 評分階段的標題固定是「評分暫時失敗,你的作答都還在」,不隨 code 變化 ——
  // 這句話本身就是設計的一部分(UI-SPEC §8),對照表已經處理好這條規則。
  const { eyebrow, title, body, buttonLabel } = resolveInterviewError({ stage, status, code, language })
  const scoring = stage === 'scoring'

  return (
    <div className="iv-error-card">
      <p className="iv-error-eyebrow">{eyebrow}</p>
      <h2 className="iv-error-title">{title}</h2>
      <p className="iv-error-body">{body}</p>
      {/* 評分失敗時這顆鈕寬度貼齊卡片(UI-SPEC §8)—— 它要是畫面上視覺最突出的
          互動元素,因為使用者接下來唯一該做的事就是按它。出題失敗時不需要這麼重,
          維持一般寬度即可。 */}
      <button
        type="button"
        className={`iv-error-retry-btn ${scoring ? 'iv-error-retry-btn--block' : ''}`}
        onClick={onRetry}
      >
        {buttonLabel}
      </button>
    </div>
  )
}

/**
 * 評分失敗時的作答保留區(D-20)。錯誤卡下方、同一次渲染,不需要多按一次才看得到。
 *
 * 【為什麼全文攤開而不摺疊 —— 這是刻意的,不是偷懶】
 * 結果頁的 AI 回饋用摺疊列表降噪,但這裡不能用同一招:使用者此刻在意的是
 * 「我剛打的字真的還在嗎」,把字摺起來反而製造「是不是被吃掉了只是沒顯示」的疑慮。
 * 摺疊要多按一次才能確認,而這個畫面的全部價值就在於「不必再確認」。
 * 量級上也撐得住:5 題 × 每題上限 500 字 = 最多 2500 字,不是不可讀的長度。
 *
 * @param {{
 *   questions: Array<{ index: number, type: string, text: string }>,
 *   answers: Array<{ index: number, text: string | null }>,
 * }} props
 */
export function PreservedAnswers({ questions, answers, language }) {
  if (!questions || questions.length === 0) return null
  const t = strings(language)

  return (
    <div className="iv-preserved-answers">
      <p className="iv-preserved-heading">{t.preservedHeading}</p>
      {questions.map((question, i) => {
        // 一律以陣列位置對齊,不採信任何 payload 裡的題號 —— 後端 ai.js:703 已經
        // 因為採信模型自報的 questionIndex 而錯位過一次。
        const answer = answers && answers[i] ? answers[i].text : null
        const skipped = !(typeof answer === 'string' && answer.trim().length > 0)
        return (
          <div
            key={i}
            className={`iv-preserved-item ${skipped ? 'iv-preserved-item--skipped' : ''}`}
          >
            <p className="iv-preserved-q">{t.preservedQuestion(i + 1, question.text)}</p>
            {/* 使用者自己打的字,一律以 JSX 文字節點渲染 + white-space: pre-wrap
                保留換行。跳過的題用中性的斜體 muted 說明,不是紅字也不是警告色
                (D-28)—— 跳過是使用者自己的選擇,不是錯誤。 */}
            <p className="iv-preserved-a">{skipped ? t.preservedSkipped : answer}</p>
          </div>
        )
      })}
    </div>
  )
}
