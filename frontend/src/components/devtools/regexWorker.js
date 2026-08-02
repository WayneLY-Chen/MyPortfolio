// 正則比對的 Worker 進入點(D-19 / D-20)—— 這是本前端專案的第一個 Web Worker。
//
// 【為什麼比對非得跑在這裡】
// JavaScript 的 RegExp 比對是同步且不可搶佔的。`(a+)+b` 配上一長串 a 會讓引擎陷入
// 災難性回溯,而在主執行緒上,這期間任何計時器 callback 都排不進去 —— 分頁就是凍住,
// 沒有任何辦法從內部把它叫醒。搬到獨立執行緒之後,主執行緒才有辦法在外面按下
// worker.terminate(),那是作業系統層級的中斷,不需要被中斷的程式碼配合。
//
// 【這個檔案的位置不能亂搬】
// 必須留在 frontend/src/components/devtools/ 底下,且呼叫端必須寫成
// `new Worker(new URL('./regexWorker.js', import.meta.url), { type: 'module' })`。
// Vite 是在建置時期靜態分析出「這裡要打包一個 Worker」的,追不到執行期才拼出來的路徑;
// 語法寫錯的後果是 dev 正常、production 404(04-RESEARCH.md Common Pitfalls #5)。
//
// 零 React 依賴、零 DOM 依賴 —— Worker 執行緒裡沒有 window,也沒有 document。
import { runRegexMatch } from './regexMatcher.js'

self.onmessage = (e) => {
  const { pattern, flags, text } = e.data || {}
  try {
    // runRegexMatch 內部已經把非法 pattern 與比對階段的例外都轉成帶錯誤旗標的純資料,
    // 回傳值保證可以通過 postMessage 的結構化複製。
    self.postMessage(runRegexMatch(pattern, flags, text))
  } catch (err) {
    // 兜底:萬一連 runRegexMatch 自己都炸了,也要回傳一份形狀一致的結果,
    // 而不是讓例外變成 onerror —— 呼叫端在 onerror 路徑上拿不到任何有用資訊。
    self.postMessage({
      ok: false,
      truncated: false,
      matches: [],
      segments: [],
      error: { kind: 'worker-failed', raw: String(err && err.message ? err.message : err) },
    })
  }
}
