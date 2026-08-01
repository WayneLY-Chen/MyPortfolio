const express = require('express');
const router = express.Router();
const { getProjects, updateProject, syncProjects } = require('../controllers/projectsController');
const { authenticate, requireAdmin } = require('../middlewares/authenticate');
const { syncLimiter } = require('../middlewares/rateLimiters');

// GET /api/projects
router.get('/', getProjects);

// POST /api/projects/sync — 強制從 GitHub 同步最新資料（管理員限定，SEC-03/D-07/D-12）
router.post('/sync', authenticate, requireAdmin, syncLimiter, syncProjects);

// PUT /api/projects/:id — D-02: 原本完全無 middleware 的裸寫入端點，補上與
// POST /sync 相同的存取控制（不掛 limiter，D-02 只要求存取控制）。前端專案
// 編輯器（frontend/src/components/Projects.jsx:389-397）已經會攜帶
// Authorization 並處理 TOKEN_EXPIRED 重試，無須同步修改前端。
router.put('/:id', authenticate, requireAdmin, updateProject);

module.exports = router;
