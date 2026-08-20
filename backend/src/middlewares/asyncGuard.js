// backend/src/middlewares/asyncGuard.js
//
// 讓 async route handler 拋出的錯誤能走到 index.js 的全域錯誤中介層。
//
// 為什麼需要：Express 4 只接住「同步」拋出的例外。async handler 回傳的是
// Promise，它 reject 時 Express 不知情 —— 請求永遠不會收到回應，而 Node 會
// 收到一個 unhandledRejection。Node 15 起 unhandledRejection 的預設處置是
// 中止行程（本專案跑 Node 24，已實測 exit code 1）。
//
// 也就是說：任何一個 async handler 裡「沒被 try/catch 包住」的例外，都是一個
// 未驗證身分就能觸發的遠端 DoS。這一輪實測到的實例是 /api/ai/generate-image
// 送 {"prompt": 1}：prompt.split 不存在 → TypeError → 請求掛住 → 行程中止。
// 那一處已在上游修好輸入驗證，但同類位置在 32 個 async handler 裡不會只有一個，
// 而「每個 handler 都記得包 try/catch」不是能長期成立的假設。
//
// 這裡不引入 express-async-errors：它做的事跟這個檔一樣（覆寫 Layer.handle），
// 但那是一個會 monkey-patch Express 內部結構的第三方相依，為了 20 行程式碼
// 增加一個供應鏈面向不划算。
//
// 升級到 Express 5 之後這個檔就可以整個刪掉 —— Express 5 原生會接住 async
// handler 的 rejection 並交給錯誤中介層。

/**
 * 包住單一 handler，讓它回傳的 Promise reject 時走 next(err)。
 *
 * 同步拋出的例外也一併包起來：Express 本來就接得住，但經過這層之後若不接，
 * 行為就會退化，所以明確保留。
 *
 * @param {Function} fn
 * @returns {Function}
 */
const wrapAsync = (fn) =>
  function wrappedAsyncHandler(req, res, next) {
    try {
      const result = fn.call(this, req, res, next);
      // 只有真的回傳 thenable 才掛 catch —— 一般同步 handler 回傳 undefined。
      if (result && typeof result.then === 'function') {
        result.catch(next);
      }
      return result;
    } catch (err) {
      next(err);
      return undefined;
    }
  };

/**
 * 就地包住一個 express.Router 上所有已註冊的 handler。
 *
 * 必須在該 router 的所有路由都註冊完之後才呼叫（也就是在 index.js 的 app.use
 * 之前），因為它走訪的是註冊完成後的 layer stack。
 *
 * 刻意跳過的兩種 layer：
 *   - arity 為 4 的錯誤處理中介層。包過之後 arity 會變成 3，Express 就不再
 *     把它當錯誤中介層，等於把它從錯誤鏈上拿掉。
 *   - 巢狀 router（layer.handle.stack 存在）。改為遞迴進去處理，直接包住
 *     router 本身會讓它的 arity 判斷失效。
 *
 * 重複呼叫是安全的：包過的 handler 帶有標記，不會被包第二次。
 *
 * @param {import('express').Router} router
 * @returns {import('express').Router} 同一個 router（就地修改，方便串接）
 */
const guardRouter = (router) => {
  if (!router || !Array.isArray(router.stack)) return router;

  for (const layer of router.stack) {
    if (layer.route && Array.isArray(layer.route.stack)) {
      // 一般路由：layer.route.stack 裡是這條路由上的每一個 handler
      // （authenticate、limiter、實際的 handler ...），逐一包。
      for (const routeLayer of layer.route.stack) {
        routeLayer.handle = guardHandler(routeLayer.handle);
      }
      continue;
    }

    // router.use(...) 掛上來的中介層，或巢狀 router。
    if (layer.handle && Array.isArray(layer.handle.stack)) {
      guardRouter(layer.handle);
      continue;
    }
    layer.handle = guardHandler(layer.handle);
  }

  return router;
};

const guardHandler = (handle) => {
  if (typeof handle !== 'function') return handle;
  if (handle.__asyncGuarded) return handle;
  // arity 4 = 錯誤處理中介層，不能動（見上方說明）。
  if (handle.length >= 4) return handle;

  const wrapped = wrapAsync(handle);
  wrapped.__asyncGuarded = true;
  return wrapped;
};

module.exports = { wrapAsync, guardRouter };
