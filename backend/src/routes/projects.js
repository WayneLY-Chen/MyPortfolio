const express = require('express');
const router = express.Router();
const { getProjects, updateProject, syncProjects } = require('../controllers/projectsController');
const { authenticate, requireAdmin } = require('../middlewares/authenticate');

// GET /api/projects
router.get('/', getProjects);

// POST /api/projects/sync — 強制從 GitHub 同步最新資料（管理員限定，SEC-03/D-07/D-12）
router.post('/sync', authenticate, requireAdmin, syncProjects);

// PUT /api/projects/:id
router.put('/:id', updateProject);

module.exports = router;
