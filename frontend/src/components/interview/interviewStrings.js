// 面試介面的中英文案表。零 React 依賴的純 ESM 模組。
//
// 【為什麼會有這個檔案】
// 05-UI-SPEC.md 的文案表只定義了中文,只有評等徽章附了英文版 —— 也就是說原本的
// 「English」按鈕只切換**面試內容**的語言(題目與 AI 回饋),介面本身仍是中文。
// 但一顆寫著 English 的按鈕,使用者理所當然預期整個畫面跟著換;停在半套反而像壞掉。
// 這份表把介面文案補齊,zh 那一欄逐字沿用 UI-SPEC 原文,一個字都沒有改寫。
//
// 語言只有 zh / en 兩種(D-02),所以刻意不引入 i18n 套件 —— 為了兩種語言、
// 幾十個字串拉一個框架進來,對一個作品集網站是不划算的交易(PROJECT.md 的
// bundle size 約束)。查表用 Object.prototype.hasOwnProperty 而非直接索引,
// 避免 'constructor' / 'toString' 這類鍵查到原型上的東西。

export const UI_STRINGS = {
  zh: {
    // ── 開場畫面 ──
    setupTitle: '模擬面試官',
    setupSubtitle: '選一個方向,五題結束後給你具體的改進建議。',
    trackGroupLabel: '選擇面試方向',
    languageGroupLabel: '面試語言',
    startButton: '開始面試',
    tracks: {
      frontend: { title: '前端工程師', description: '版面、效能與瀏覽器行為的臨場判斷' },
      backend: { title: '後端工程師', description: 'API 設計、併發與快取的取捨' },
      fullstack: { title: '全端工程師', description: '前後端邊界的整合判斷' },
      fresher: { title: '新鮮人軟體工程師', description: '基礎觀念與除錯思路' },
    },

    // ── 作答畫面 ──
    progress: (n, total) => `第 ${n} / ${total} 題`,
    typeTechnical: '技術',
    typeBehavioral: '行為',
    replay: '重聽這題',
    stopPlayback: '停止播放',
    mute: '靜音',
    unmute: '取消靜音',
    speedGroupLabel: '朗讀語速',
    speaking: '面試官朗讀中',
    speechStopped: '已停止朗讀',
    answerLabel: '你的回答',
    answerPlaceholder: '在這裡輸入你的回答……',
    nextQuestion: '下一題',
    submitForScoring: '送出並評分',
    skipQuestion: '跳過這題',
    endEarly: '提前結束面試',

    // ── 載入狀態 ──
    loadingQuestions: '面試官正在出題……',
    loadingScore: '正在評分……',

    // ── 結果頁 ──
    resultsTitle: '面試結果',
    scoreUnit: '/ 100',
    disclaimer: '此為練習用 AI 評分,非正式面試評估工具。',
    qaHeading: '逐題回饋',
    questionOrdinal: (n) => `第 ${n} 題`,
    notAnswered: '未作答',
    scoreBadge: (score) => `${score} 分`,
    suggestionLabel: '改進建議',
    restart: '重新面試',
    copyFeedback: '複製回饋文字',
    printPdf: '列印 / 匯出 PDF',
    copySuccess: '已複製',
    copyFailed: '複製失敗',
    copyFailedHint: '請手動選取文字複製',

    // ── 複製出去的純文字 ──
    copyOverall: (score) => `總分 ${score} / 100`,
    copyRating: (rating) => `評等 ${rating}`,
    copyQuestionLabel: '題目:',
    copyCommentLabel: '評語:',
    copySuggestionLabel: '改進建議:',

    // ── 作答保留區(D-20)──
    preservedHeading: '你剛剛的作答都還在',
    preservedSkipped: '（這題你選擇跳過）',
    preservedQuestion: (n, text) => `第 ${n} 題 · ${text}`,
  },

  en: {
    setupTitle: 'AI Mock Interviewer',
    setupSubtitle: 'Pick a track. After five questions you get a score and specific things to fix.',
    trackGroupLabel: 'Choose an interview track',
    languageGroupLabel: 'Interview language',
    startButton: 'Start interview',
    tracks: {
      frontend: { title: 'Frontend Engineer', description: 'Layout, performance and browser behaviour under pressure' },
      backend: { title: 'Backend Engineer', description: 'API design, concurrency and caching trade-offs' },
      fullstack: { title: 'Full-stack Engineer', description: 'Judgement at the boundary between front and back' },
      fresher: { title: 'Entry-level Engineer', description: 'Fundamentals and how you approach debugging' },
    },

    progress: (n, total) => `Question ${n} of ${total}`,
    typeTechnical: 'Technical',
    typeBehavioral: 'Behavioural',
    replay: 'Replay question',
    stopPlayback: 'Stop playback',
    mute: 'Mute',
    unmute: 'Unmute',
    speedGroupLabel: 'Speech rate',
    speaking: 'The interviewer is speaking',
    speechStopped: 'Playback stopped',
    answerLabel: 'Your answer',
    answerPlaceholder: 'Type your answer here…',
    nextQuestion: 'Next question',
    submitForScoring: 'Submit for scoring',
    skipQuestion: 'Skip this question',
    endEarly: 'End interview early',

    loadingQuestions: 'The interviewer is writing your questions…',
    loadingScore: 'Scoring your answers…',

    resultsTitle: 'Interview results',
    scoreUnit: '/ 100',
    disclaimer: 'This is AI-generated practice feedback, not a formal interview assessment.',
    qaHeading: 'Question-by-question feedback',
    questionOrdinal: (n) => `Question ${n}`,
    notAnswered: 'Not answered',
    scoreBadge: (score) => `${score} pts`,
    suggestionLabel: 'How to improve',
    restart: 'New interview',
    copyFeedback: 'Copy feedback',
    printPdf: 'Print / Save as PDF',
    copySuccess: 'Copied',
    copyFailed: 'Copy failed',
    copyFailedHint: 'Please select the text and copy it manually',

    copyOverall: (score) => `Overall ${score} / 100`,
    copyRating: (rating) => `Rating ${rating}`,
    copyQuestionLabel: 'Question: ',
    copyCommentLabel: 'Comment: ',
    copySuggestionLabel: 'How to improve: ',

    preservedHeading: 'Your answers are still here',
    preservedSkipped: '(You skipped this question)',
    preservedQuestion: (n, text) => `Question ${n} · ${text}`,
  },
}

export const DEFAULT_UI_LANGUAGE = 'zh'

/**
 * 取得某個語言的文案表。未知語言退回中文 —— 語言值來自 reducer 的白名單,
 * 理論上不會有第三種值,但這裡是渲染路徑,寧可退回也不要整頁炸掉。
 * @param {string} language
 */
export function strings(language) {
  return Object.prototype.hasOwnProperty.call(UI_STRINGS, language)
    ? UI_STRINGS[language]
    : UI_STRINGS[DEFAULT_UI_LANGUAGE]
}
