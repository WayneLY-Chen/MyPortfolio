const express = require('express')
const router = express.Router()
const { getComments, addComment, deleteComment } = require('../controllers/commentsController')
const { authenticate } = require('../middlewares/authenticate')
const { commentsLimiter } = require('../middlewares/rateLimiters')

router.get('/', getComments)
router.post('/', authenticate, commentsLimiter, addComment)
router.delete('/:id', authenticate, commentsLimiter, deleteComment)

module.exports = router
