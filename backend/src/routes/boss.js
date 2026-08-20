const express = require('express')
const router = express.Router()
const { query } = require('../db')
const gameState = require('../sockets/gameState')
const { bossState } = gameState
const { authenticate, requireAdmin } = require('../middlewares/authenticate')
const { bossLimiter } = require('../middlewares/rateLimiters')
const { normalizeDamage, normalizePlayerName, recordDamage } = require('../config/bossValidation')

// GET /api/boss/state
router.get('/state', async (req, res) => {
  // Always return the real-time in-memory state first
  res.json({ success: true, data: bossState })
})

// POST /api/boss/attack
// 驗證規則與 sockets/index.js 的 boss_attack 共用 config/bossValidation.js，
// 兩條路徑不得各自維護一份 —— 前端實際走的是 socket 那條，只擋 REST 等於沒擋。
router.post('/attack', bossLimiter, async (req, res) => {
  // 先驗證輸入再看 Boss 狀態：不合法的請求無論 Boss 死活都該以 400 回絕，
  // 而不是在 Boss 已倒下時靜默回 success。
  const damage = normalizeDamage(req.body?.damage)
  if (damage === null) {
    return res.status(400).json({ success: false, message: '傷害值不合法' })
  }
  const player_name = normalizePlayerName(req.body?.player_name)

  if (!bossState.is_alive) {
    return res.json({ success: true, data: bossState, message: 'Boss 已被擊倒' })
  }

  // Update In-memory HP
  bossState.hp = Math.max(0, bossState.hp - damage)
  const isKill = bossState.hp === 0

  if (isKill) {
    bossState.is_alive = false
    bossState.killed_by = player_name
  }

  // Record stats in memory (ranks)
  recordDamage(bossState, player_name, damage)

  // Non-blocking Database Logging (Best-effort persistent log)
  try {
    await query(
      `INSERT INTO boss_kill_log (player_name, damage, is_kill) VALUES ($1, $2, $3)`,
      [player_name, damage, isKill]
    )
  } catch (err) {
    console.error('[DB Log Error] Skipping persistent log:', err.message)
  }

  res.json({ success: true, data: bossState, isKill })
})

// POST /api/boss/reset
// 這是破壞性操作：清空全場 Boss 狀態與整份傷害排行。原本完全未設防，任何人
// 都能重置。改為僅限管理員，並改呼叫 gameState 的正規 resetBoss() —— 原本這裡
// 抄了一份 inline 版本，且漏掉 bossState.players 沒清，與 socket 端的重置行為
// 不一致。
router.post('/reset', authenticate, requireAdmin, (req, res) => {
  gameState.resetBoss()
  res.json({ success: true, data: bossState })
})

// GET /api/boss/kills — top recent kills
router.get('/kills', async (req, res) => {
  try {
    const result = await query(
      `SELECT player_name, SUM(damage) as total_damage, COUNT(*) as attacks
       FROM boss_kill_log GROUP BY player_name ORDER BY total_damage DESC LIMIT 10`
    )
    res.json({ success: true, data: result.rows })
  } catch (err) {
    // 資料庫錯誤訊息可能含結構或連線細節，只寫 log，不回給呼叫端。
    console.error('[Boss] 查詢擊殺排行失敗:', err)
    res.status(500).json({ success: false, message: '查詢失敗' })
  }
})

module.exports = router
