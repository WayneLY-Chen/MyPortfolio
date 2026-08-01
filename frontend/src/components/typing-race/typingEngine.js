// 打字競速計分引擎 —— 零 React 依賴的純函式模組,可用 node --test 直接驗證。
// Source: 03-RESEARCH.md「Code Examples」章節的公式定義(依 D-11/D-13/D-14/D-29 設計);
// D-31/D-32/D-33(2026-08-02 嚴格模式修訂)取代 D-13/D-14,細節見各函式上方註解。

// D-11: 用 Array.from 而非 split('')/直接索引,對本階段語料(CJK 基本區 + 全形標點
// + ASCII,全部落在 BMP)兩者結果完全相同;這裡選 Array.from 純粹是零成本保險,
// 詳見 03-RESEARCH.md「CJK / 全形標點的字元切割」小節的完整分析。
export function toChars(str) {
  return Array.from(str)
}

// D-14(已被 D-31 取代):全量重算模型維持不變——每次呼叫都用『目前完整 typed
// 字串』與 target 全量重新比對,只新增不刪除 index,不嘗試追蹤這次新增/刪除了
// 哪個字元。理由已從「改對不還清白」改為結構性事實:D-31 之後已上屏字元不可
// 修改,重算結果天然單調遞增,只增不刪本來就是唯一可能的結果,不再是規則的
// 刻意選擇。這個設計仍選擇全量重算而非增量 diff,理由見 03-RESEARCH.md Pattern 2。
export function markWrongIndices(typed, target, everWrongSet) {
  const typedChars = toChars(typed)
  const targetChars = toChars(target)
  const len = Math.min(typedChars.length, targetChars.length)
  for (let i = 0; i < len; i++) {
    if (typedChars[i] !== targetChars[i]) everWrongSet.add(i)
  }
  return everWrongSet
}

// D-32(取代 D-13 + Pitfall 5):完成條件改為「輸入字數達到題目字數」,不再要求
// 逐字完全相等——未修正的錯字不再擋住測驗結束。這是知情下反轉 03-RESEARCH.md
// Pitfall 5 建議的決定(該處為了避免「中間留著未修正錯字就結束」而選擇全字串
// 相等),理由是使用者裁決:D-31 讓已上屏字元不可修改之後,「留著錯字結束」不
// 再是缺陷而是規則本身,結果卡的作答回顧本來就會把紅標再列一次,語意一致。
// 用 toChars 取兩者長度而非 String.length,以 code point 而非 UTF-16 code unit
// 計算,避免未來語料含 surrogate pair 時的長度誤判(見 D-11)。題目長度為 0 時
// 視為異常情境,一律回傳 false,避免題庫異常時出現「零輸入即完成」的退化情境。
export function isComplete(typed, target) {
  const targetLen = toChars(target).length
  if (targetLen === 0) return false
  return toChars(typed).length >= targetLen
}

// D-31:前綴不變式——判斷一次輸入是否「刪除了已上屏的字」,準則與是否在組字中
// 完全無關:只要新值仍以已上屏字串(settled)為前綴,就不算刪除已上屏文字,不論
// 變長、變短或不變。這條規則刻意不去猜測目前是否在組字狀態,因為 IME 組字緩衝區
// 內的任何編輯(含刪除注音符號)都天然保留已上屏前綴,因此自動放行,不需要額外
// 的組字例外判斷,也因此不受 03-RESEARCH.md 警告的 input/compositionstart 事件
// 順序競態影響。用 String.prototype.startsWith 直接比較即可——settled 永遠是
// 完整字串,前綴比較不會切開 UTF-16 surrogate pair。
export function deletesCommitted(nextValue, settled) {
  return !nextValue.startsWith(settled)
}

// D-31:超出題目長度的輸入直接截斷,避免使用者打超過字數,也避免超打字元灌水
// 速度計算。用 toChars 而非 slice 依 code point 截斷。呼叫端注意:不得在組字
// 進行中呼叫這個函式,截斷會直接破壞尚未上屏的注音組字緩衝區內容。
export function clampToTarget(value, target) {
  const targetChars = toChars(target)
  const valueChars = toChars(value)
  if (valueChars.length <= targetChars.length) return value
  return valueChars.slice(0, targetChars.length).join('')
}

// D-14:正確率 = (target 長度 - 曾經打錯的字數) / target 長度,以百分比表示。
export function calcAccuracy(target, everWrongSet) {
  const total = toChars(target).length
  if (total === 0) return 100
  return ((total - everWrongSet.size) / total) * 100
}

// 英文 WPM:業界標準公式,字元數(含空格與標點,對應 D-11 的逐字比對)/ 5 / 分鐘數。
export function calcWpmEn(charCount, elapsedMs) {
  const minutes = elapsedMs / 60000
  if (minutes <= 0) return 0
  return (charCount / 5) / minutes
}

// D-29:中文速度採「字/分」原始值——原始字元數 / 分鐘數,明確地「不」除以 5。
// 顯示與儲存值皆用這個公式,理由見 03-RESEARCH.md「與鎖定決策的落差」章節。
export function calcCpmZh(charCount, elapsedMs) {
  const minutes = elapsedMs / 60000
  if (minutes <= 0) return 0
  return charCount / minutes
}

// D-08:只避免連續重複上一題,不做完整去重歷史。offset 從 1 開始保證這次選到
// 的 index 必定與 excludeIndex 不同,不需要重試迴圈。
export function pickNextSentence(list, excludeIndex) {
  if (list.length <= 1) return 0
  const offset = 1 + Math.floor(Math.random() * (list.length - 1))
  return (excludeIndex + offset) % list.length
}

// D-20/D-25:正確率未達此門檻不得上榜(後端最終把關,前端用於事前灰化上傳按鈕,
// 該灰化行為屬 03-04 範圍)。
// 注意:backend/src/config/leaderboardValidation.js(03-02 建立)有同名常數,
// 修改時兩處都要改(03-RESEARCH.md Pitfall 3)。
export const ACCURACY_THRESHOLD = 90

// D-22/D-29:「不可能的分數」硬上限,中文用字/分口徑、英文用 WPM 口徑。
// 注意:backend/src/config/leaderboardValidation.js(03-02 建立)有同名常數,
// 修改時兩處都要改(03-RESEARCH.md Pitfall 3)。
export const SPEED_CAP = { typing_zh: 150, typing_en: 250 }

// Pitfall 1:已用時間低於此門檻前,即時速度不顯示外推暴衝的數字(改顯示 '--')。
// 本計畫先匯出常數,實際用於即時統計列渲染是 03-03 的工作範圍。
export const MIN_ELAPSED_FOR_LIVE_SPEED_MS = 3000

// D-17:計算「排除暫停時間」後的實際經過毫秒數。純函式,刻意不讀取任何 ref、
// 不呼叫 Date.now()——所有時間值皆由呼叫端傳入,才能用 node --test 直接驗證
// 暫停扣除的算術(03-RESEARCH.md「Common Pitfalls - Pitfall 2」)。
// 目前正在暫停中時(pausedAt 有值),連同這段進行中的暫停也要即時扣除,
// 否則暫停時畫面上的秒數會繼續跳。結果永不為負。
export function calcElapsedMs({ now, startTime, totalPausedMs, pausedAt }) {
  if (startTime === null || startTime === undefined) return 0
  const ongoingPauseMs = pausedAt ? now - pausedAt : 0
  const elapsed = (now - startTime) - totalPausedMs - ongoingPauseMs
  return elapsed < 0 ? 0 : elapsed
}
