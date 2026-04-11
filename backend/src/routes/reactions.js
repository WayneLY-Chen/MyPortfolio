const express = require('express');
const router = express.Router();
const { getReactionsCount, toggleReaction } = require('../controllers/reactionsController');
const { optionalAuthenticate } = require('../middlewares/authenticate');

router.get('/', optionalAuthenticate, getReactionsCount);
router.post('/toggle', optionalAuthenticate, toggleReaction);

module.exports = router;
