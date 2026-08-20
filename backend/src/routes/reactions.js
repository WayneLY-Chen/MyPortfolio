const express = require('express');
const router = express.Router();
const { getReactionsCount, toggleReaction } = require('../controllers/reactionsController');
const { optionalAuthenticate, resolveGuestSession } = require('../middlewares/authenticate');
const { reactionsLimiter } = require('../middlewares/rateLimiters');

// resolveGuestSession 必須掛在 optionalAuthenticate 之後、controller 之前：
// controller 以 req.userId 優先、req.guestSessionId 為輔判斷身分，兩者都由
// 各自的 middleware 產生。兩個 middleware 都不會擋下請求，只是把可驗證的
// 身分放上 req；是否需要身分由 controller 決定（讀取不需要、寫入需要）。
router.get('/', optionalAuthenticate, resolveGuestSession, getReactionsCount);
router.post('/toggle', optionalAuthenticate, resolveGuestSession, reactionsLimiter, toggleReaction);

module.exports = router;
