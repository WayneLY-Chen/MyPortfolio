const express = require('express')
const router = express.Router()
const { query } = require('../db')
const { factionState } = require('../sockets/gameState')

// All states are now centralized in ../sockets/gameState

// GET /api/faction/lobby
router.get('/lobby', (req, res) => {
  // Map factionState to the expected JSON format
  const players = Object.values(factionState.players);
  const lobby = {
    blue: players.find(p => p.team === 'blue') || { ready: false, sessionId: null, playerName: '' },
    orange: players.find(p => p.team === 'orange') || { ready: false, sessionId: null, playerName: '' }
  };
  const gameState = {
    active: factionState.phase === 'playing',
    grid: factionState.grid,
    timeLeft: factionState.timeLeft
  };
  res.json({ success: true, lobby, gameState })
})

// POST /api/faction/ready
router.post('/ready', (req, res) => {
  const { team, ready, sessionId, playerName } = req.body
  if (!['blue', 'orange'].includes(team)) return res.status(400).json({ success: false, message: '無效的陣營' })

  // Update centralized state
  factionState.players[sessionId] = {
    ...factionState.players[sessionId],
    name: playerName || (team === 'blue' ? '藍隊' : '橘隊'),
    team,
    isReady: ready
  };

  const players = Object.values(factionState.players);
  const lobby = {
    blue: players.find(p => p.team === 'blue') || { ready: false, sessionId: null, playerName: '' },
    orange: players.find(p => p.team === 'orange') || { ready: false, sessionId: null, playerName: '' }
  };
  res.json({ success: true, lobby })
})

// POST /api/faction/start
router.post('/start', (req, res) => {
  if (!lobby.blue.ready || !lobby.orange.ready) {
    return res.status(400).json({ success: false, message: '雙方都必須準備就緒才能開戰！' })
  }
  gameState = {
    active: true,
    grid: Array(100).fill(''),
    timeLeft: 60,
    startTime: Date.now()
  }
  startServerTimer()
  res.json({ success: true, gameState })
})

// POST /api/faction/move
router.post('/move', (req, res) => {
  const { index, team, sessionId } = req.body
  if (factionState.phase !== 'playing') return res.status(400).json({ success: false, message: '遊戲尚未開始' })
  
  if (!factionState.players[sessionId] || factionState.players[sessionId].team !== team) {
    return res.status(403).json({ success: false, message: '身分驗證失敗' })
  }

  const myColor = (team === 'blue' ? '#3b82f6' : '#f97316')
  factionState.grid[index] = myColor
  res.json({ success: true, grid: factionState.grid })
})

const resetAll = () => {
  if (timerInterval) clearInterval(timerInterval)
  lobby = {
    blue: { ready: false, sessionId: null, playerName: '' },
    orange: { ready: false, sessionId: null, playerName: '' }
  }
  gameState = { active: false, grid: Array(100).fill(''), timeLeft: 60, startTime: null }
}

// POST /api/faction/result
router.post('/result', async (req, res) => {
  const { blue_player, orange_player, winner, blue_score, orange_score } = req.body
  try {
    await query(
      `INSERT INTO faction_results (blue_player, orange_player, winner, blue_score, orange_score)
       VALUES ($1, $2, $3, $4, $5)`,
      [blue_player || '藍隊', orange_player || '橘隊', winner, blue_score || 0, orange_score || 0]
    )
    // Clear state via referenced reset if needed, or rely on socket orchestration
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

// GET /api/faction/results
router.get('/results', async (req, res) => {
  try {
    const result = await query(
      `SELECT blue_player, orange_player, winner, blue_score, orange_score, created_at
       FROM faction_results ORDER BY created_at DESC LIMIT 20`
    )
    res.json({ success: true, data: result.rows || [] })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message })
  }
})

module.exports = router
