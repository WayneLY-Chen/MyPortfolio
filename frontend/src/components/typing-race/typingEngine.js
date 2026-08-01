// 打字競速計分引擎 —— 零 React 依賴的純函式模組,可用 node --test 直接驗證。
// Source: 03-RESEARCH.md「Code Examples」章節的公式定義(依 D-11/D-13/D-14/D-29 設計)。

// D-11: 用 Array.from 而非 split('')/直接索引,對本階段語料(CJK 基本區 + 全形標點
// + ASCII,全部落在 BMP)兩者結果完全相同;這裡選 Array.from 純粹是零成本保險,
// 詳見 03-RESEARCH.md「CJK / 全形標點的字元切割」小節的完整分析。
export function toChars(str) {
  return Array.from(str)
}

// D-14:「錯過一次就記一次,改對不還清白」——每次呼叫都用『目前完整 typed 字串』
// 與 target 全量重新比對,只新增不刪除 index,不嘗試追蹤這次新增/刪除了哪個字元。
// 這個設計刻意選擇全量重算而非增量 diff,理由見 03-RESEARCH.md Pattern 2。
export function markWrongIndices(typed, target, everWrongSet) {
  const typedChars = toChars(typed)
  const targetChars = toChars(target)
  const len = Math.min(typedChars.length, targetChars.length)
  for (let i = 0; i < len; i++) {
    if (typedChars[i] !== targetChars[i]) everWrongSet.add(i)
  }
  return everWrongSet
}

// D-13 + Pitfall 5:完成條件採「typed 與 target 完全相等」,而非僅檢查最後一個索引,
// 避免「中間留著未修正錯字,但最後一字打對就結束」的怪異情況。
export function isComplete(typed, target) {
  return typed === target
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
