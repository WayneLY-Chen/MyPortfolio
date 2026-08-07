// 面試三個後端呼叫的客戶端。零 React 依賴,但因為 import 了 config/api
// (內含 import.meta.env),它只能在 Vite 環境載入,不進 node --test。
//
// 契約以 backend/src/routes/ai.js 的實際實作為準(2026-08-07 實測):
//
//   POST /api/ai/interview/questions
//     body { track, language }
//     200  { success:true, questions:[{ index, type, text }] }   ← 固定 5 題,index 由後端給
//
//   POST /api/ai/interview/score
//     body { track, language, items:[{ type, text, skipped, answer }] }   ← 恰 5 筆
//     200  { success:true, overallScore, rating, summary, answeredCount,
//            perQuestion:[{ index, skipped, score, comment, suggestion }] }
//            ↑ score 對跳過的題是 null,不是 0 —— 畫面必須把「0 分」與「未作答」分開
//
//   失敗一律 { success:false, error, code },code 見 interviewErrors.js 的對照表。
//   例外:限流 middleware 的 429 沒有 code(rateLimiters.js:11),所以呼叫端要靠
//   status 判斷 —— resolveInterviewError 已經處理。
//
// 三個函式都不送 Authorization header:Phase 2 已確認前端 AI 呼叫本來就不送,
// 面試不得因此變成登入牆。限流實務上走 IP。
// 前端也不做任何自動重試(D-19)—— 重試永遠是使用者按的。

import { API_URL } from '../../config/api'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

// 共用的 POST + 回應正規化。任何失敗都回一致的形狀,呼叫端不必分辨
// 「是 fetch 拋了還是後端回了非 2xx」。
async function postJson(path, body, signal) {
  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    // 中止是呼叫端自己要求的(切題 / 卸載),不是錯誤 —— 分開回,免得畫面
    // 為了一個自己取消的請求跳出錯誤卡。
    if (err && err.name === 'AbortError') {
      return { ok: false, status: 0, code: 'ABORTED', aborted: true }
    }
    return { ok: false, status: 0, code: 'NETWORK' }
  }

  let data = null
  try {
    data = await res.json()
  } catch (err) {
    data = null
  }

  if (!res.ok || !data || data.success !== true) {
    return {
      ok: false,
      status: res.status,
      code: (data && data.code) || (res.status === 429 ? 'RATE_LIMITED' : null),
    }
  }

  return { ok: true, data }
}

export function fetchQuestions({ track, language, signal } = {}) {
  return postJson('/ai/interview/questions', { track, language }, signal)
}

// payload 直接來自 interviewReducer 的 buildScoringPayload(),原樣送出。
// 重試時呼叫端會用同一份 state 再組一次,內容逐字相同(D-20)。
export function postScore(payload, { signal } = {}) {
  return postJson('/ai/interview/score', payload, signal)
}

// D-21 靜默降級:失敗一律回 null,不 throw、不回錯誤碼。語音是加分項,
// 題目照常顯示、面試繼續 —— 呼叫端不得因為這裡回 null 就進入錯誤狀態。
// 回傳的是 object URL,呼叫端負責在停止 / 換題 / 卸載時 revoke。
export async function fetchQuestionAudio({ text, voice, rate, signal } = {}) {
  try {
    const res = await fetch(`${API_URL}/ai/tts`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ text, voice, rate }),
      signal,
    })
    if (!res.ok) return null
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  } catch (err) {
    return null
  }
}
