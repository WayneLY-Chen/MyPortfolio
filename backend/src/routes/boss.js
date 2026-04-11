const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { bossState } = require('../sockets/gameState')

// GET /api/boss/state
router.get('/state', async (req, res) => {
  // Always return the real-time in-memory state first
  res.json({ success: true, data: bossState })
})

// POST /api/boss/attack
router.post('/attack', async (req, res) => {
  const { player_name = '勇者', damage = 0 } = req.body
  
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
  let p = bossState.kills.find(k => k.player_name === player_name)
  if (p) p.total_damage += damage
  else bossState.kills.push({ player_name, total_damage: damage })
  bossState.kills.sort((a, b) => b.total_damage - a.total_damage)

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
router.post('/reset', async (req, res) => {
  // Sync with gameState.js resetter
  bossState.hp = 10000;
  bossState.max_hp = 10000;
  bossState.is_alive = true;
  bossState.killed_by = null;
  bossState.kills = [];

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
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
