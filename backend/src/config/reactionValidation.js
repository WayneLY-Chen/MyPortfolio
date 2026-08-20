// backend/src/config/reactionValidation.js
//
// 表情反應的共用驗證。沿用本專案既有慣例（leaderboardValidation.js、
// bossValidation.js）：驗證規則集中在 config/ 下的獨立模組，路由層只負責
// 接收與回應。
//
// 為什麼獨立成一個模組：本專案原本有兩套各自獨立的表情反應實作——
//   routes/reactions.js  + controllers/reactionsController.js → reactions 資料表
//   routes/blog.js 的 /:postId/reactions                      → post_reactions 資料表
// 兩者先前都沒有任何 emoji 驗證，因此規則集中在這裡，避免只修一邊。後來查明
// 第二套（blog.js 那對端點與 post_reactions 資料表）在版控可見的歷史裡從來
// 沒有被任何前端呼叫過，已整組移除，現在只剩第一套在用這個模組。

// 允許的表情，取前端兩份清單的聯集：
//   frontend/src/components/Reactions.jsx  → 👍 ❤️ 😂 🔥 🚀
//   frontend/src/pages/BlogPostPage.jsx    → 👍 ❤️ 🔥 🤔 😮（該頁的死程式碼，已移除）
// 聯集維持原樣，不因為死程式碼被移除就縮小既有的允許集合。
// 兩份清單本來就不一致，這裡取聯集是為了不讓任何一頁的既有行為壞掉。
//
// 為什麼需要白名單：emoji 欄位先前完全未驗證，任何字串都能寫進資料庫。
// 目前不構成 stored XSS——前端是從自己寫死的常數陣列渲染，資料庫裡的雜訊值
// 永遠不會被顯示——但那是靠呼叫端的實作細節擋下來的，不是這一層擋的。
// 一旦哪天改成「依資料庫實際有的表情動態渲染」，就會直接變成儲存型 XSS。
const ALLOWED_EMOJIS = ['👍', '❤️', '😂', '🔥', '🚀', '🤔', '😮'];

/**
 * @param {unknown} emoji
 * @returns {boolean}
 */
const isAllowedEmoji = (emoji) => typeof emoji === 'string' && ALLOWED_EMOJIS.includes(emoji);

// target_type 白名單。與 leaderboardValidation.js 的 GAME_TYPE_ALLOWLIST 同樣
// 的理由：留一個類型不擋等於沒擋。
const ALLOWED_TARGET_TYPES = ['comment', 'project', 'blog'];

/**
 * @param {unknown} targetType
 * @returns {boolean}
 */
const isAllowedTargetType = (targetType) =>
  typeof targetType === 'string' && ALLOWED_TARGET_TYPES.includes(targetType);

// target_id 欄位是 VARCHAR(255)，可能是 UUID 或 slug。這裡只做長度與型別的
// 基本收斂，不做格式限制——slug 的格式規則不歸這一層管。
const MAX_TARGET_ID_LEN = 255;

/**
 * @param {unknown} targetId
 * @returns {boolean}
 */
const isValidTargetId = (targetId) => {
  if (typeof targetId !== 'string' && typeof targetId !== 'number') return false;
  const s = String(targetId);
  return s.length > 0 && s.length <= MAX_TARGET_ID_LEN;
};

module.exports = {
  ALLOWED_EMOJIS,
  ALLOWED_TARGET_TYPES,
  MAX_TARGET_ID_LEN,
  isAllowedEmoji,
  isAllowedTargetType,
  isValidTargetId,
};
