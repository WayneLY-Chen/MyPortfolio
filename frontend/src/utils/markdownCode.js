// frontend/src/utils/markdownCode.js
//
// 判斷 react-markdown 傳進 code 元件的節點是「圍籬程式碼區塊」還是「行內
// 程式碼」。零 React 依賴的純函式，才測得動：
//
//   cd frontend && node --test src/utils/markdownCode.test.js
//
// 為什麼需要這個：react-markdown v9 起移除了傳給 code 元件的 inline prop
// （本專案為 v10）。Projects.jsx 與 Blog.jsx 兩處都還在寫
//
//   code: ({inline, ...}) => !inline ? <區塊> : <行內>
//
// 而 inline 恆為 undefined，因此 !inline 恆為 true —— 每一個行內程式碼都被
// 畫成帶標題列的整塊區塊，把句子從中間撕成兩半。這正是專案卡片開啟後
// README 排版錯亂的原因（`msedge-tts`、`ai.js`、`questionIndex` 這些原本
// 在句子中間的詞，全都變成獨立區塊）。
//
// 兩處先前各自維護一份相同的判斷邏輯，這裡收攏成一份，避免日後只修一邊。

/**
 * @param {string|undefined|null} className react-markdown 傳入的 className
 * @param {string} content 已去除尾端換行的程式碼內容
 * @returns {boolean} true 表示應以區塊呈現
 */
export function isBlockCode(className, content) {
  // 帶語言的圍籬區塊會有 language-xxx class，這是最可靠的判準。
  if (/language-(\w+)/.test(className || '')) return true;

  // 沒指定語言的圍籬區塊沒有 class，改看內容是否跨行 —— markdown 的行內
  // 程式碼在語法上不可能包含換行，因此含換行必為區塊。
  //
  // 已知的取捨：「沒指定語言且只有一行」的圍籬區塊會被判為行內。本專案
  // README 目前 7 個區塊全部都有指定語言（text / bash），不受影響；即使
  // 日後出現，退化結果也只是少一個標題列，不會撕裂句子。
  return typeof content === 'string' && content.includes('\n');
}

export default isBlockCode;
