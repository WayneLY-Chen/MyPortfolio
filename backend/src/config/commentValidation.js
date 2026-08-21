// backend/src/config/commentValidation.js
//
// 留言的輸入驗證。沿用本專案既有慣例（reactionValidation.js /
// leaderboardValidation.js / bossValidation.js）：驗證規則集中在 config/ 下的
// 獨立模組，controller 只負責接收與回應。
//
// target_type 與 target_id 的規則直接沿用 reactionValidation 的那一份，不另抄
// 一份：留言與表情反應指向的是完全相同的三種目標（blog / project / comment），
// 規則沒有理由不同。本專案已經吃過六次「同樣的邏輯有兩份、只修一邊」的虧
// （Boss REST/Socket、兩套 reactions、兩份 markdown code 渲染、同檔案內的
// TTS_RATE_WHITELIST 與 modeInstructions、boss_attack 與 boss_join 的名字），
// 而 reactions 早就有白名單、comments 一直沒有，這正是第七次。
//
// 修補前 controller 的檢查只有 `if (!type || !id || !content?.trim())`：
//
//   - content 是數字或陣列時，content?.trim() 直接拋 TypeError。那一行在
//     try 區塊之外，而 Express 4 不接 async handler 的 rejection，因此在
//     middlewares/asyncGuard.js 補上防線之前，任何一個已登入的使用者送
//     {"content": 123} 就能讓後端行程中止（已實測：請求永遠不回應，
//     unhandledRejection 為 "content?.trim is not a function"）。
//
//   - type 與 id 完全沒有白名單，實測可以用任意字串當 target_type、
//     用 500 字的 target_id 寫進資料庫。沒有任何頁面讀得到那些留言，
//     它們只是永久佔著資料庫。

const { isAllowedTargetType, isValidTargetId, ALLOWED_TARGET_TYPES, MAX_TARGET_ID_LEN } =
  require('./reactionValidation');

// 內容長度上限。與修補前 controller 內寫死的 500 相同，維持既有行為。
const CONTENT_MAX_CHARS = 500;

// 顯示名稱長度上限。與修補前的 author_name.slice(0, 50) 相同。
const AUTHOR_NAME_MAX_LEN = 50;

// 找不到顯示名稱時的預設值，與修補前 controller 的預設參數一致。
const DEFAULT_AUTHOR_NAME = '訪客';

/**
 * 留言內容是否合法。
 *
 * 型別檢查是這裡最重要的一項：修補前只有 `content?.trim()`，非字串會直接
 * 拋錯（見檔頭）。長度改為檢查 trim 之後的字串 —— 修補前是先用未 trim 的
 * 長度比對 500、再寫入 trim 過的值，兩者不一致。
 *
 * @param {unknown} content
 * @returns {boolean}
 */
const isValidCommentContent = (content) => {
  if (typeof content !== 'string') return false;
  const trimmed = content.trim();
  return trimmed.length > 0 && trimmed.length <= CONTENT_MAX_CHARS;
};

/**
 * 把使用者資料裡的顯示名稱收斂成可寫入的值。
 *
 * 注意這個函式的輸入來源：它接的是資料庫裡該使用者的 display_name，
 * 不是請求 body 的 author_name。修補前 author_name 直接取自 body，因此任何
 * 已登入的使用者都能以任意名字發言（實測：一般帳號可以用「網站管理員 Wayne」
 * 的名義留言，前端就照著顯示）。留言區是公開的，這是冒名而不只是資料髒。
 *
 * @param {unknown} displayName
 * @returns {string}
 */
const normalizeAuthorName = (displayName) => {
  if (typeof displayName !== 'string') return DEFAULT_AUTHOR_NAME;
  const trimmed = displayName.trim();
  if (trimmed.length === 0) return DEFAULT_AUTHOR_NAME;
  return trimmed.slice(0, AUTHOR_NAME_MAX_LEN);
};

module.exports = {
  CONTENT_MAX_CHARS,
  AUTHOR_NAME_MAX_LEN,
  DEFAULT_AUTHOR_NAME,
  ALLOWED_TARGET_TYPES,
  MAX_TARGET_ID_LEN,
  isAllowedTargetType,
  isValidTargetId,
  isValidCommentContent,
  normalizeAuthorName,
};
