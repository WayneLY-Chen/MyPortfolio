const express = require('express');
const router = express.Router();
const { getProjects, updateProject, syncProjects } = require('../controllers/projectsController');

// GET /api/projects
router.get('/', getProjects);

// POST /api/projects/sync — 強制從 GitHub 同步最新資料
router.post('/sync', syncProjects);

// PUT /api/projects/:id
router.put('/:id', updateProject);

module.exports = router;
