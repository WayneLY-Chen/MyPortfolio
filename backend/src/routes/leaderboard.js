const express = require('express')
const router = express.Router()
const { query } = require('../db')
const {
  isValidGameType,
  isTypingGameType,
  isValidNickname,
  isScoreWithinCap,
  isAccuracyAcceptable,
  ACCURACY_THRESHOLD,
} = require('../config/leaderboardValidation')
const { buildLeaderboardSelect } = require('../config/leaderboardQuery')

// GET /api/leaderboard?game=snake&limit=10
// D-34:打字榜(typing_zh/typing_en)改為每位玩家只回傳個人最佳成績,SQL 形狀
// 由 buildLeaderboardSelect(game) 依 isTypingGameType() 分岔;其餘 game_type
// (snake/2048 等舊遊戲)取得的查詢字串與改動前逐字相同,不受影響。未知的
// game_type 沿用既有行為,經 isTypingGameType() 判為 false 後自然走舊路徑,
// 本 handler 不另加白名單驗證。
router.get('/', async (req, res) => {
  const game = req.query.game || 'snake'
  const limit = Math.min(parseInt(req.query.limit) || 10, 50)
  try {
    const result = await query(buildLeaderboardSelect(game), [game, limit])
    res.json({ success: true, data: result.rows })
  } catch (err) {
    console.error('[Leaderboard] 查詢失敗:', err.message)
    res.json({ success: true, data: [] })
  }
})

// POST /api/leaderboard
router.post('/', async (req, res) => {
  const { game_type, player_name, score, accuracy } = req.body
  if (!player_name || score === undefined) return res.status(400).json({ success: false, error: '缺少必要欄位' })

  // D-24:game_type 白名單檢查必須放在其他驗證之前——後續每一關的規則
  // (暱稱嚴格程度、分數上限、正確率門檻)都依 resolvedGameType 分岔。
  const resolvedGameType = game_type || 'snake'
  if (!isValidGameType(resolvedGameType)) {
    return res.status(400).json({ success: false, error: '不明的遊戲類型' })
  }

  const isTyping = isTypingGameType(resolvedGameType)

  // D-23 的嚴格暱稱規則僅套用在 typing_zh/typing_en；snake/2048 維持既有的
  // trim + 截斷 20 字寬鬆規則不變(D-24 明確不做的部分,不得外溢到舊遊戲)。
  let safeName
  if (isTyping) {
    const trimmedName = String(player_name).trim()
    if (!isValidNickname(trimmedName)) {
      return res.status(400).json({ success: false, error: '暱稱格式不符(1–12 字,限中文/英數字/底線)' })
    }
    safeName = trimmedName
  } else {
    safeName = String(player_name).trim().substring(0, 20)
  }

  const safeScore = parseInt(score)
  if (isNaN(safeScore) || safeScore < 0) return res.status(400).json({ success: false, error: '分數無效' })

  // D-22:分數上限僅套用在 typing_zh/typing_en；isScoreWithinCap 對非 typing
  // 類型一律回 true,舊遊戲維持無上限的既有行為不變。
  if (!isScoreWithinCap(resolvedGameType, safeScore)) {
    return res.status(400).json({ success: false, error: '分數超出合理範圍' })
  }

  // D-20/D-25:正確率門檻僅套用在 typing_zh/typing_en。舊遊戲不帶 accuracy
  // 欄位,isTyping 為 false 時完全略過這一關。
  if (isTyping && !isAccuracyAcceptable(accuracy)) {
    return res.status(400).json({ success: false, error: `正確率需達 ${ACCURACY_THRESHOLD}% 才能上榜` })
  }

  try {
    await query(
      `INSERT INTO leaderboard (game_type, player_name, score) VALUES ($1, $2, $3)`,
      [resolvedGameType, safeName, safeScore]
    )
    res.json({ success: true })
  } catch (err) {
    console.error('[Leaderboard] 寫入失敗:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

module.exports = router
