const express = require('express');
const router = express.Router();
const { getProfile } = require('../controllers/profileController');

// GET /api/profile
router.get('/', getProfile);

module.exports = router;
