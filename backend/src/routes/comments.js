const express = require('express')
const router = express.Router()
const { getComments, addComment, deleteComment } = require('../controllers/commentsController')
const { authenticate } = require('../middlewares/authenticate')

router.get('/', getComments)
router.post('/', authenticate, addComment)
router.delete('/:id', authenticate, deleteComment)

module.exports = router
