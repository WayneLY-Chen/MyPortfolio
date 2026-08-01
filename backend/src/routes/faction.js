const express = require('express')
const router = express.Router()
const { query } = require('../db')

// 陣營大戰的所有互動皆走 Socket.io（見 backend/src/sockets/），此檔僅供戰績板
// 讀取歷史紀錄。原本這裡還有五條可直接改寫 Socket.io 共用遊戲狀態
// （../sockets/gameState 的 factionState）的 REST 路由，經確認前端與後端皆
// 無任何呼叫者後已於 Phase 2（D-03）移除，理由詳見
// .planning/phases/02-reliability-hardening/02-05-SUMMARY.md。

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
