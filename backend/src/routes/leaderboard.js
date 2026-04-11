const express = require('express')
const router = express.Router()
const { query } = require('../db')

// GET /api/leaderboard?game=snake&limit=10
router.get('/', async (req, res) => {
  const game = req.query.game || 'snake'
  const limit = Math.min(parseInt(req.query.limit) || 10, 50)
  try {
    const result = await query(
      `SELECT player_name, score, created_at FROM leaderboard WHERE game_type = $1 ORDER BY score DESC LIMIT $2`,
      [game, limit]
    )
    res.json({ success: true, data: result.rows })
  } catch (err) {
    console.error('[Leaderboard] 查詢失敗:', err.message)
    res.json({ success: true, data: [] })
  }
})

// POST /api/leaderboard
router.post('/', async (req, res) => {
  const { game_type, player_name, score } = req.body
  if (!player_name || score === undefined) return res.status(400).json({ success: false, error: '缺少必要欄位' })
  const safeName = String(player_name).trim().substring(0, 20)
  const safeScore = parseInt(score)
  if (isNaN(safeScore) || safeScore < 0) return res.status(400).json({ success: false, error: '分數無效' })
  try {
    await query(
      `INSERT INTO leaderboard (game_type, player_name, score) VALUES ($1, $2, $3)`,
      [game_type || 'snake', safeName, safeScore]
    )
    res.json({ success: true })
  } catch (err) {
    console.error('[Leaderboard] 寫入失敗:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

module.exports = router
