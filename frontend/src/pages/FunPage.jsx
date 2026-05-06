import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { io } from 'socket.io-client'
import { API_URL, SOCKET_URL } from '../config/api'

import TopNav from '../components/TopNav'
import Footer from '../components/Footer'
import useLenis from '../hooks/useLenis'
import YorkieDog from '../components/YorkieDog'
import { useToast } from '../components/ui/Toast'
import { AnimatedNumber } from '../components/ui/AnimatedNumber'
import { Confetti } from '../components/ui/Confetti'
import { cn } from '../lib/utils'
import MoneyCalculator from '../components/MoneyCalculator'

// Snake Game
const CELL = 32
const COLS = 25
const ROWS = 25
const W = CELL * COLS
const H = CELL * ROWS

function randFood(snake) {
  let pos
  do {
    pos = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) }
  } while (snake.some(s => s.x === pos.x && s.y === pos.y))
  return pos
}

function SnakeGame({ onNewScore }) {
  const canvasRef = useRef(null)
  const stateRef = useRef({
    snake: [{ x: 10, y: 10 }],
    food: { x: 15, y: 15 },
    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    score: 0,
    running: false,
    over: false,
    intervalId: null
  })
  const { toast } = useToast()
  const [display, setDisplay] = useState({ score: 0, over: false, running: false })
  const [playerName, setPlayerName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const s = stateRef.current

    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, W, H)

    ctx.strokeStyle = '#111'
    ctx.lineWidth = 0.5
    for (let i = 0; i <= COLS; i++) { ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, H); ctx.stroke() }
    for (let j = 0; j <= ROWS; j++) { ctx.beginPath(); ctx.moveTo(0, j * CELL); ctx.lineTo(W, j * CELL); ctx.stroke() }

    ctx.fillStyle = '#ff4d00'
    ctx.beginPath()
    ctx.arc(s.food.x * CELL + CELL / 2, s.food.y * CELL + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2)
    ctx.fill()

    s.snake.forEach((seg, idx) => {
      const isHead = idx === 0
      ctx.fillStyle = isHead ? '#e8ff40' : '#d4f029'
      ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2)
    })
  }, [])

  const tick = useCallback(() => {
    const s = stateRef.current
    if (!s.running) return
    s.dir = s.nextDir
    const head = { x: s.snake[0].x + s.dir.x, y: s.snake[0].y + s.dir.y }

    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS ||
        s.snake.some(seg => seg.x === head.x && seg.y === head.y)) {
      s.running = false
      s.over = true
      clearInterval(s.intervalId)
      setDisplay({ score: s.score, over: true, running: false })
      return
    }

    s.snake.unshift(head)
    if (head.x === s.food.x && head.y === s.food.y) {
      s.score += 10
      s.food = randFood(s.snake)
    } else {
      s.snake.pop()
    }
    setDisplay(d => ({ ...d, score: s.score }))
    draw()
  }, [draw])

  const start = useCallback(() => {
    const s = stateRef.current
    clearInterval(s.intervalId)
    s.snake = [{ x: 10, y: 10 }]
    s.food = randFood(s.snake)
    s.dir = { x: 1, y: 0 }
    s.nextDir = { x: 1, y: 0 }
    s.score = 0
    s.running = true
    s.over = false
    setSaved(false)
    setDisplay({ score: 0, over: false, running: true })
    s.intervalId = setInterval(tick, 120)
    draw()
  }, [tick, draw])

  useEffect(() => {
    draw()
    const handleKey = (e) => {
      const s = stateRef.current
      if (!s.running) return
      const map = {
        ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
        w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 }
      }
      const newDir = map[e.key]
      if (newDir) {
        e.preventDefault()
        const cur = s.dir
        if (newDir.x !== -cur.x || newDir.y !== -cur.y) s.nextDir = newDir
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => { clearInterval(stateRef.current.intervalId); window.removeEventListener('keydown', handleKey) }
  }, [draw])

  const saveScore = async () => {
    if (!playerName.trim() || saving) return
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/leaderboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_type: 'snake', player_name: playerName.trim(), score: stateRef.current.score })
      })
      if (!res.ok) throw new Error('伺服器回應錯誤')
      setSaved(true)
      if (onNewScore) onNewScore()
    } catch (err) {
      toast.error(`連線伺服器失敗: ${err.message || '網路異常'}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDirectionClick = (newDir) => {
    const s = stateRef.current
    if (!s.running) return
    const cur = s.dir
    if (newDir.x !== -cur.x || newDir.y !== -cur.y) s.nextDir = newDir
  }

  return (
    <div className="snake-container">
      <div className="snake-header">
        <span className="snake-label">SNAKE</span>
        <span className="snake-score">分數：{display.score}</span>
      </div>
      <canvas ref={canvasRef} width={W} height={H} className="snake-canvas" />
      
      {/* Mobile touch controls */}
      {display.running && (
        <div className="snake-mobile-controls">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, maxWidth: 180, margin: '16px auto 0' }}>
            <div />
            <button className="dpad-btn" onClick={() => handleDirectionClick({ x: 0, y: -1 })}>▲</button>
            <div />
            <button className="dpad-btn" onClick={() => handleDirectionClick({ x: -1, y: 0 })}>◀</button>
            <button className="dpad-btn" onClick={() => handleDirectionClick({ x: 0, y: 1 })}>▼</button>
            <button className="dpad-btn" onClick={() => handleDirectionClick({ x: 1, y: 0 })}>▶</button>
          </div>
        </div>
      )}
      
      {!display.running && !display.over && (
        <div className="snake-overlay">
          <p className="snake-msg">使用方向鍵或 WASD 控制</p>
          <button className="snake-btn" onClick={start}>開始遊戲</button>
        </div>
      )}
      {display.over && (
        <div className="snake-overlay">
          <p className="snake-msg">遊戲結束</p>
          <p className="snake-final-score">得分：{display.score}</p>
          {!saved ? (
            <div className="snake-save-row">
              <input
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveScore()}
                placeholder="你的名字"
                className="snake-name-input"
                maxLength={20}
              />
              <button className="snake-btn" onClick={saveScore} disabled={saving || !playerName.trim()}>
                {saving ? '儲存中...' : '上傳排名'}
              </button>
            </div>
          ) : (
            <p className="snake-saved">已上傳！</p>
          )}
          <button className="snake-btn-ghost" onClick={start}>再玩一次</button>
        </div>
      )}
    </div>
  )
}

// Leaderboard Component
function Leaderboard({ refresh, gameType = 'snake', title = '排行榜 TOP 10' }) {
  const [scores, setScores] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`${API_URL}/leaderboard?game=${gameType}&limit=10`)
      .then(r => r.json())
      .then(d => {
        // 安全檢查：確保傳入的是陣列，或者從 .data 屬性讀取
        const list = Array.isArray(d) ? d : (d?.data && Array.isArray(d.data) ? d.data : [])
        setScores(list)
        setLoading(false)
      })
      .catch(err => {
        console.error('[Leaderboard Fetch Error]', err)
        setLoading(false)
      })
  }, [refresh, gameType])

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="leaderboard">
      <h3 className="lb-title">{title}</h3>
      {loading && <p className="lb-loading">載入中...</p>}
      {!loading && scores.length === 0 && <p className="lb-empty">還沒有紀錄，快去玩！</p>}
      <ol className="lb-list">
        {scores.map((s, i) => (
          <li key={i} className={`lb-item ${i < 3 ? 'lb-top' : ''}`}>
            <span className="lb-rank">{medals[i] || i + 1}</span>
            <span className="lb-name">{s.player_name}</span>
            <span className="lb-pts">{s.score}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

// Dino Game
function DinoGame() {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [score, setScore] = useState(0)
  const [active, setActive] = useState(false)
  const [isDead, setIsDead] = useState(false)
  const [canvasW, setCanvasW] = useState(900)
  const gameState = useRef({ dinoY: 250, velocity: 0, obstacles: [], frame: 0 })

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) setCanvasW(containerRef.current.offsetWidth || 800)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const startGame = useCallback(() => {
    gameState.current = { dinoY: 350, velocity: 0, obstacles: [], frame: 0 }
    setScore(0)
    setIsDead(false)
    setActive(true)
  }, [])

  const jump = useCallback(() => {
    if (gameState.current.dinoY >= 350) gameState.current.velocity = -16
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (isDead || !active) startGame()
        else jump()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [active, isDead, startGame, jump])

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let rafId

    const loop = () => {
      ctx.clearRect(0, 0, canvasW, 400)
      const state = gameState.current
      state.velocity += 0.8
      state.dinoY += state.velocity
      if (state.dinoY > 350) { state.dinoY = 350; state.velocity = 0 }

      // Ground line
      ctx.strokeStyle = '#e8ff40'
      ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, 375); ctx.lineTo(canvasW, 375); ctx.stroke()

      // Dino
      ctx.fillStyle = '#e8ff40'
      ctx.fillRect(50, state.dinoY, 35, 35)

      // Spawn obstacles
      if (state.frame > 0 && state.frame % 80 === 0) {
        state.obstacles.push({ x: canvasW + 50, w: 20 + Math.random() * 30 })
      }

      // Draw + check obstacles
      let dead = false
      state.obstacles.forEach(o => {
        o.x -= 6 + Math.floor(state.frame / 1000)
        ctx.fillStyle = '#ff4d00'
        ctx.fillRect(o.x, 350, o.w, 25)
        if (50 < o.x + o.w - 5 && 85 > o.x + 5 && state.dinoY + 35 > 355) dead = true
      })

      if (state.obstacles.length > 0 && state.obstacles[0].x < -100) state.obstacles.shift()

      state.frame++
      const newScore = Math.floor(state.frame / 10)
      setScore(newScore)

      if (dead) {
        setActive(false)
        setIsDead(true)
        return
      }
      rafId = requestAnimationFrame(loop)
    }

    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [active, canvasW])

  return (
    <div ref={containerRef} style={{ width: '100%', maxWidth: 800, margin: '0 auto' }}>
      <div className="game-header-row">
        <span className="game-label">DINO RUNNER</span>
        <span className="game-score-display">分數：{score}</span>
      </div>
      <div style={{ position: 'relative', width: '100%', height: 400 }}>
        <canvas
          ref={canvasRef}
          width={canvasW}
          height={400}
          onClick={() => active ? jump() : startGame()}
          style={{ background: '#0a0a0a', border: '1px solid #222', display: 'block', width: '100%', cursor: 'pointer' }}
        />
        {!active && (
          <div className="game-overlay-center">
            {isDead
              ? <p className="game-over-text">遊戲結束！得分：{score}</p>
              : <p className="game-hint-text">按 空白鍵 / ▲ / 點擊 開始</p>
            }
            <button className="snake-btn" onClick={startGame}>{isDead ? '再玩一次' : '開始遊戲'}</button>
          </div>
        )}
      </div>
      
      {/* Mobile jump button */}
      {active && (
        <div className="dino-mobile-controls">
          <button 
            className="dino-jump-btn" 
            onClick={jump}
            style={{
              width: '100%',
              maxWidth: 200,
              margin: '16px auto 0',
              padding: '16px 32px',
              background: 'linear-gradient(135deg, #e8ff40, #d4f029)',
              color: '#000',
              border: 'none',
              borderRadius: 8,
              fontSize: 18,
              fontWeight: 900,
              cursor: 'pointer',
              display: 'block',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              boxShadow: '0 4px 12px rgba(232, 255, 64, 0.3)',
              transition: 'transform 0.1s, box-shadow 0.1s'
            }}
            onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
            onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
            onTouchStart={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
            onTouchEnd={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            ▲ 跳躍
          </button>
        </div>
      )}
      
      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8, textAlign: 'center' }}>空白鍵 / ▲ 跳躍 · 點擊畫面也可以</p>
    </div>
  )
}

// 2048 Game
function Game2048() {
  const addRandomTile = (g) => {
    const empty = []
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++)
        if (g[r][c] === 0) empty.push({ r, c })
    if (!empty.length) return g
    const { r, c } = empty[Math.floor(Math.random() * empty.length)]
    const copy = g.map(row => [...row])
    copy[r][c] = Math.random() < 0.9 ? 2 : 4
    return copy
  }

  const makeEmpty = () => [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]

  const { toast } = useToast()
  const [grid, setGrid] = useState(() => addRandomTile(addRandomTile(makeEmpty())))
  const [score, setScore] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [won, setWon] = useState(false)
  const [playerName, setPlayerName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [lbRefresh, setLbRefresh] = useState(0)

  const initGame = useCallback(() => {
    setGrid(addRandomTile(addRandomTile(makeEmpty())))
    setScore(0)
    setGameOver(false)
    setWon(false)
    setSaved(false)
  }, [])

  const saveScore = async () => {
    if (!playerName.trim() || saving) return
    setSaving(true)
    try {
      await fetch(`${API_URL}/leaderboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_type: '2048', player_name: playerName.trim(), score })
      })
      setSaved(true)
      setLbRefresh(r => r + 1)
    } catch (err) {
      toast.error(`上傳失敗: ${err.message || '網路異常'}`)
    } finally {
      setSaving(false)
    }
  }

  const move = useCallback((dir) => {
    if (gameOver) return
    setGrid(prevGrid => {
      let g = prevGrid.map(row => [...row])
      let moved = false
      let gained = 0

      const rot90 = m => m[0].map((_, i) => m.map(row => row[i]).reverse())
      if (dir === 'up') { g = rot90(rot90(rot90(g))) }
      if (dir === 'down') { g = rot90(g) }
      if (dir === 'right') { g = g.map(r => [...r].reverse()) }

      for (let i = 0; i < 4; i++) {
        let row = g[i].filter(v => v !== 0)
        for (let j = 0; j < row.length - 1; j++) {
          if (row[j] === row[j + 1]) {
            row[j] *= 2; gained += row[j]; row.splice(j + 1, 1); moved = true
          }
        }
        while (row.length < 4) row.push(0)
        if (JSON.stringify(g[i]) !== JSON.stringify(row)) moved = true
        g[i] = row
      }

      if (dir === 'up') { g = rot90(g) }
      if (dir === 'down') { g = rot90(rot90(rot90(g))) }
      if (dir === 'right') { g = g.map(r => [...r].reverse()) }

      if (!moved) return prevGrid

      const final = addRandomTile(g)
      if (gained > 0) setScore(s => s + gained)

      // Check 2048 win
      if (final.flat().includes(2048)) setWon(true)

      // Check game over
      let canMove = false
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        if (final[r][c] === 0) { canMove = true; break }
        if (r < 3 && final[r][c] === final[r+1][c]) { canMove = true; break }
        if (c < 3 && final[r][c] === final[r][c+1]) { canMove = true; break }
      }
      if (!canMove) setGameOver(true)

      return final
    })
  }, [gameOver])

  useEffect(() => {
    const handleKey = (e) => {
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
      if (map[e.key]) { e.preventDefault(); move(map[e.key]) }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [move])

  const tileColor = (v) => {
    const colors = {
      2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563',
      32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61',
      512: '#edc850', 1024: '#edc53f', 2048: '#edc22e'
    }
    return colors[v] || '#ccc0b3'
  }

  const tileFg = (v) => v <= 4 ? '#776e65' : '#f9f6f2'

  return (
    <div className="game-2048-layout">
      <div>
        <div className="game-header-row">
          <span className="game-label">2048</span>
          <span className="game-score-display">分數：{score}</span>
        </div>
        <div style={{ position: 'relative', background: '#bbada0', borderRadius: 8, padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, aspectRatio: '1/1', width: '100%', height: 'auto' }}>
          {grid.flat().map((v, i) => (
            <div key={i} style={{
              background: v ? tileColor(v) : 'rgba(238,228,218,0.35)',
              color: v ? tileFg(v) : 'transparent',
              fontWeight: 900,
              fontSize: v >= 1000 ? '24px' : v >= 100 ? '32px' : '48px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 6, transition: 'background 0.1s',
              aspectRatio: '1/1'
            }}>
              {v || ''}
            </div>
          ))}
          {(gameOver || won) && (
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, gap: 12, padding: '20px'
            }}>
              <p style={{ color: won ? '#e8ff40' : '#ff4d00', fontSize: 28, fontWeight: 900, margin: 0 }}>
                {won ? '🎉 達成 2048！' : '遊戲結束'}
              </p>
              <p style={{ color: '#ccc', fontSize: 16, margin: 0 }}>最終得分：{score}</p>
              
              {!saved ? (
                <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: '240px', marginTop: 12 }}>
                  <input
                    value={playerName}
                    onChange={e => setPlayerName(e.target.value)}
                    placeholder="輸入姓名..."
                    style={{ flex: 1, padding: '8px 12px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: 6, fontSize: 14 }}
                  />
                  <button className="snake-btn" onClick={saveScore} disabled={saving || !playerName.trim()}>
                    {saving ? '...' : '上傳'}
                  </button>
                </div>
              ) : (
                <p style={{ color: '#4ade80', fontSize: 14, fontWeight: 700 }}>✅ 成績已上傳！</p>
              )}
              
              <button className="snake-btn" style={{ padding: '8px 24px' }} onClick={initGame}>再玩一次</button>
            </div>
          )}
        </div>
        {/* Arrow controls */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 16, maxWidth: 180, margin: '16px auto 0' }}>
          <div />
          <button className="dpad-btn" onClick={() => move('up')}>▲</button>
          <div />
          <button className="dpad-btn" onClick={() => move('left')}>◀</button>
          <button className="dpad-btn" onClick={() => move('down')}>▼</button>
          <button className="dpad-btn" onClick={() => move('right')}>▶</button>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8, textAlign: 'center' }}>方向鍵移動 · 相同數字合併</p>
      </div>

      <div style={{ alignSelf: 'start', marginTop: '54px' }}>
        <Leaderboard refresh={lbRefresh} gameType="2048" title="2048 排行榜" />
      </div>
    </div>
  )
}

// Boss Raid Game
const CARD_POOL = [
  { id: 'c1', name: '基礎斬擊', type: 'melee', cost: 0, power: 15, desc: '無消耗的輕盈一擊' },
  { id: 'c2', name: '重劍無鋒', type: 'melee', cost: 10, power: 35, desc: '沉重的物理打擊' },
  { id: 'c3', name: '刺客袖劍', type: 'melee', cost: 5, power: 25, desc: '精準的弱點攻擊' },
  { id: 'c4', name: '狂戰怒吼', type: 'melee', cost: 20, power: 55, desc: '捨身取義的重擊' },
  { id: 'c5', name: '旋風迴旋斬', type: 'melee', cost: 15, power: 45, desc: '華麗的劍技' },
  { id: 'c6', name: '破甲碎星擊', type: 'melee', cost: 25, power: 70, desc: '無視防禦的重擊' },
  { id: 'c7', name: '幻影連斬', type: 'melee', cost: 18, power: 50, desc: '看不見的連續斬擊' },
  { id: 'c8', name: '致命突刺', type: 'melee', cost: 12, power: 40, desc: '直擊要害' },
  { id: 'c9', name: '巨獸衝撞', type: 'melee', cost: 30, power: 85, desc: '用盡全力的衝擊' },
  { id: 'c10', name: '拔刀術·閃', type: 'melee', cost: 8, power: 30, desc: '快如閃電的居合' },
  { id: 'c11', name: '小火球', type: 'magic', cost: 5, power: 20, desc: '基礎魔法' },
  { id: 'c12', name: '冰霜之槍', type: 'magic', cost: 8, power: 30, desc: '刺穿敵人的寒冰' },
  { id: 'c13', name: '雷擊術', type: 'magic', cost: 12, power: 40, desc: '引導天雷劈下' },
  { id: 'c14', name: '奧術飛彈', type: 'magic', cost: 15, power: 45, desc: '純粹的魔力衝擊' },
  { id: 'c15', name: '炎爆火隕', type: 'magic', cost: 30, power: 90, desc: '召喚隕石毀滅一切' },
  { id: 'c21', name: '應急包紮', type: 'heal', cost: 0, power: 20, desc: '簡單的止血' },
  { id: 'c22', name: '微光治癒', type: 'heal', cost: 10, power: 40, desc: '輕微的魔法治療' },
  { id: 'c23', name: '聖光術', type: 'heal', cost: 20, power: 80, desc: '聖騎士的治癒' },
  { id: 'c27', name: '煉金靈藥', type: 'heal', cost: 15, power: 60, desc: '快速見效的藥水' },
  { id: 'c28', name: '自然之觸', type: 'heal', cost: 12, power: 50, desc: '德魯伊的祝福' },
]

const shuffleDeck = () => [...CARD_POOL].sort(() => Math.random() - 0.5)

function BossRaidGame() {
  const { addToast } = useToast()
  const BOSS_MAX = 1000
  const [playerName, setPlayerName] = useState('')
  const [entered, setEntered] = useState(false)
  const [bossState, setBossState] = useState({ hp: BOSS_MAX, max_hp: BOSS_MAX, is_alive: true, killed_by: null })
  const [victory, setVictory] = useState(false)
  
  const [sessionId] = useState(() => {
    let id = sessionStorage.getItem('boss_raid_session')
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem('boss_raid_session', id)
    }
    return id
  })

  const [playerHp, setPlayerHp] = useState(300)
  const [playerMp, setPlayerMp] = useState(100)
  const [hand, setHand] = useState([])
  const [deck, setDeck] = useState([])
  const [turn, setTurn] = useState('player')
  const [log, setLog] = useState([])
  const [bossAnim, setBossAnim] = useState('idle')
  const [kills, setKills] = useState([])
  const logRef = useRef(null)
  const pollRef = useRef(null)

  const addLog = (msg) => setLog(prev => [...prev.slice(-49), msg])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  const fetchBossState = async () => {
    try {
      const res = await fetch(`${API_URL}/boss/state`)
      const data = await res.json()
      if (data.success) setBossState(data.data)
    } catch {}
  }

  const fetchKills = async () => {
    try {
      const res = await fetch(`${API_URL}/boss/kills`)
      const data = await res.json()
      // 如果後端返回 success 且 data 是數組，則更新
      if (data.success && Array.isArray(data.data)) setKills(data.data)
    } catch {}
  }

  const socketRef = useRef(null);

  useEffect(() => {
    if (!entered) return;
    
    // Socket Initialization
    const socket = io(SOCKET_URL, {
      query: { sessionId, name: playerName }
    });
    socketRef.current = socket;

    socket.on('boss_init', (data) => {
      setBossState(data.bossState);
      if (data.bossState.kills) {
        setKills(data.bossState.kills);
      }
    });

    socket.on('boss_update', (data) => {
      setBossState(data.bossState);
      if (data.bossState.kills) {
        setKills(data.bossState.kills);
      }
      
      if (data.reset) {
        setVictory(false)
        addToast({ title: '骷髏王已重置', description: '死靈之氣再次凝聚！', variant: 'info' })
        initLocal();
      } else if (data.attacker) {
        setBossAnim('hit');
        setTimeout(() => setBossAnim('idle'), 400);
        const skillText = data.skillName ? `使用了 [${data.skillName}]` : '發起攻擊';
        addLog(`⚔️ ${data.attacker} ${skillText}！造成 ${data.damage} 點傷害。`);
        if (data.isKill) {
          setVictory(true)
          addToast({ title: '強者誕生！', description: `骷髏王已被 ${data.attacker} 擊倒！`, variant: 'success' })
          setTimeout(fetchKills, 1000);
        }
      }
    });

    socket.emit('boss_join', playerName);

    return () => {
      socket.disconnect();
    };
  }, [entered, playerName]);

  const initLocal = useCallback(() => {
    const d = shuffleDeck()
    setHand(d.slice(0, 3))
    setDeck(d.slice(3))
    setPlayerHp(300)
    setPlayerMp(100)
    setTurn('player')
    setLog([`戰鬥開始！你（${playerName}）面對骷髏王！`])
  }, [playerName])

  useEffect(() => { if (entered) initLocal() }, [entered, initLocal])

  const playCard = async (card) => {
    if (turn !== 'player' || !bossState.is_alive) return
    if (playerMp < card.cost) { 
      addToast({ title: '魔力不足', description: '等待回魔或使用低消耗技能', variant: 'error' })
      return 
    }
    setPlayerMp(mp => mp - card.cost)

    if (card.type === 'heal') {
      setPlayerHp(hp => Math.min(300, hp + card.power))
      addLog(`✨ 你使用了 [${card.name}]！恢復了 ${card.power} 點 HP。`)
    } else {
      socketRef.current?.emit('boss_attack', {
        name: playerName || '勇者',
        damage: card.power,
        skillName: card.name,
        skillType: card.type
      })
    }

    let d = [...deck]
    if (d.length === 0) d = shuffleDeck()
    const newCard = d[d.length - 1]
    setDeck(d.slice(0, d.length - 1))
    setHand(prev => prev.map(c => c.id === card.id ? newCard : c))
  }

  const endTurn = () => {
    if (turn !== 'player') return
    setTurn('boss')
    addLog('⏳ 回合結束。骷髏王發出了陰冷的笑聲...')
    setTimeout(() => {
      setBossAnim('attack')
      const dmg = Math.floor(Math.random() * 31) + 30
      addLog(`⚠️ 骷髏王使用了 [亡靈詛咒]！你受到了 ${dmg} 點傷害！`)
      setPlayerHp(hp => {
        const newHp = hp - dmg
        if (newHp <= 0) { setTurn('dead'); addLog('☠️ 你倒下了...'); setTimeout(() => setBossAnim('idle'), 400); return 0 }
        setPlayerMp(mp => Math.min(100, mp + 20))
        setTurn('player')
        setTimeout(() => setBossAnim('idle'), 400)
        return newHp
      })
    }, 800)
  }

  const resetBoss = () => {
    socketRef.current?.emit('boss_reset');
  }

  const cardColor = (type) => type === 'melee' ? '#f97316' : type === 'magic' ? '#a855f7' : '#22c55e'
  const bossHpPct = (bossState.hp / bossState.max_hp) * 100
  const playerHpPct = (playerHp / 300) * 100
  const playerMpPct = (playerMp / 100) * 100

  // Name entry screen
  if (!entered) {
    return (
      <div style={{ width: '100%', maxWidth: 500, margin: '60px auto', textAlign: 'center' }}>
        <div style={{ fontSize: 80, marginBottom: 20 }}>💀</div>
        <h3 style={{ color: '#d4bfff', fontSize: 28, fontWeight: 900, letterSpacing: 4, marginBottom: 8 }}>尾刀爭奪戰</h3>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 32 }}>多人共享骷髏王 HP · 誰給最後一刀誰獲勝</p>
        <input
          value={playerName}
          onChange={e => setPlayerName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && playerName.trim() && setEntered(true)}
          placeholder="輸入你的名稱..."
          maxLength={20}
          style={{ width: '100%', padding: '14px 18px', background: '#111', border: '1px solid #333', color: '#fff', borderRadius: 8, fontSize: 16, outline: 'none', marginBottom: 16, boxSizing: 'border-box' }}
        />
        <button
          onClick={() => playerName.trim() && setEntered(true)}
          disabled={!playerName.trim()}
          style={{ width: '100%', padding: '14px', background: playerName.trim() ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : '#222', color: '#fff', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 900, cursor: playerName.trim() ? 'pointer' : 'not-allowed', letterSpacing: 2 }}
        >
          進入戰場
        </button>
      </div>
    )
  }

  return (
    <div className="boss-raid-layout">
      <style>{`
        @keyframes bossFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes bossHit { 0%,100% { transform: translateX(0) scale(1); filter: brightness(1); } 25% { transform: translateX(-10px) scale(0.95); filter: brightness(3); } 75% { transform: translateX(10px) scale(1.05); } }
        @keyframes bossAtk { 0%,100% { transform: translateY(0) scale(1); } 30% { transform: translateY(-20px) scale(1.1); filter: drop-shadow(0 0 20px #00FF00); } 70% { transform: translateY(30px) scale(1.2); } }
        .boss-idle { animation: bossFloat 3s ease-in-out infinite; }
        .boss-hit  { animation: bossHit  0.4s ease-out; }
        .boss-attack { animation: bossAtk 0.6s ease-in-out; }
        .card-item:hover { transform: translateY(-6px) !important; }
        .boss-log-container::-webkit-scrollbar { width: 4px; }
        .boss-log-container::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); border-radius: 2px; }
        .boss-log-container::-webkit-scrollbar-thumb { background: rgba(168,85,247,0.3); border-radius: 2px; }
        .boss-log-container::-webkit-scrollbar-thumb:hover { background: rgba(168,85,247,0.5); }
        .pulsing-dot { width: 8px; height: 8px; background: #4ade80; border-radius: 50%; box-shadow: 0 0 8px #4ade80; animation: pulse 2s infinite; }
        @keyframes pulse { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.5); opacity: 0.5; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>

      {/* Left: Online Players List */}
      <div className="backdrop-blur-xl bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 h-fit sticky top-24">
        <div className="flex items-center gap-3 mb-6">
          <div className="pulsing-dot" />
          <h4 className="text-[#C8942A] text-xs font-bold uppercase tracking-[0.2em] m-0">在線勇者</h4>
        </div>
        <div className="flex flex-col gap-4">
          {bossState.players && Object.keys(bossState.players).length > 0 ? (
            Object.entries(bossState.players).map(([sid, name]) => (
              <div key={sid} className="flex items-center gap-3 text-zinc-400 text-sm group">
                <span className="opacity-40 group-hover:opacity-100 transition-opacity">👤</span>
                <span className="flex-1 truncate group-hover:text-white transition-colors">{name}</span>
                {sid === sessionId && (
                  <span className="text-[10px] bg-[#C8942A]/20 text-[#C8942A] px-2 py-0.5 rounded-md font-bold">YOU</span>
                )}
              </div>
            ))
          ) : (
            <p className="text-zinc-600 text-xs italic">正在集結中...</p>
          )}
        </div>
        <div className="mt-8 pt-4 border-t border-white/5 text-center">
          <p className="text-zinc-500 text-[10px] uppercase tracking-widest">當前共 {Object.keys(bossState.players || {}).length} 位勇者</p>
        </div>
      </div>

      {/* Center: main game */}
      <div className="relative">
        <Confetti active={victory} color="#C8942A" />
        
        {/* Boss area */}
        <div className="bg-gradient-to-b from-[#050508] to-[#150a21] border border-[#C8942A]/20 rounded-2xl p-8 mb-4 text-center shadow-2xl overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-1 bg-white/5 overflow-hidden">
             <motion.div 
               className="h-full bg-[#C8942A]" 
               initial={{ width: '0%' }} 
               animate={{ width: `${bossHpPct}%` }}
               transition={{ duration: 0.5 }}
             />
          </div>

          <h3 className="text-[#C8942A] text-2xl font-black mb-6 tracking-[0.4em] uppercase">骷髏王</h3>
          <div className={cn("text-[140px] leading-none mb-6 drop-shadow-[0_0_30px_rgba(200,148,42,0.3)]", `boss-${bossAnim}`)}>💀</div>
          
          <div className="relative h-10 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 blur-xl rounded-full" />
            <p className="relative z-10 text-white font-black text-3xl m-0 tracking-tighter">
              {bossState.is_alive ? (
                <>
                  <AnimatedNumber value={bossState.hp} /> 
                  <span className="text-zinc-500 text-lg ml-2">/ {bossState.max_hp}</span>
                </>
              ) : (
                <span className="text-[#C8942A] scale-110 inline-block animate-bounce">
                  💀 已被 {bossState.killed_by || '勇者'} 擊倒！
                </span>
              )}
            </p>
          </div>
        </div>

        {!bossState.is_alive ? (
          <div className="text-center p-10 bg-[#C8942A]/5 border border-[#C8942A]/30 rounded-2xl backdrop-blur-sm">
            <p className="text-[#C8942A] text-3xl font-black mb-4">🏆 {bossState.killed_by} 給了最後一刀！</p>
            <p className="text-zinc-500 text-sm mb-8 tracking-widest">骷髏王已倒下，召喚下一場戰鬥</p>
            <button className="snake-btn bg-[#C8942A] text-black hover:scale-105 transition-transform" onClick={resetBoss}>重置骷髏王</button>
          </div>
        ) : (
          <>
            <div ref={logRef} className="boss-log-container" style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid #1a1a2e', borderRadius: 8, padding: 12, height: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, textAlign: 'left', marginBottom: 12 }}>
              {log.map((l, i) => <div key={i} style={{ color: l.includes('骷髏王') && l.includes('使用') ? '#ff4444' : l.includes('你使用') ? '#e8ff40' : l.includes('恢復') ? '#22c55e' : '#e2e8f0' }}>{l}</div>)}
            </div>
            <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-5 mb-4">
              <div className="flex gap-6 mb-4 items-center">
                <div className="flex-1">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-[#4ade80] text-xs font-bold uppercase">Health</span>
                    <span className="text-white font-black text-lg"><AnimatedNumber value={playerHp} /> / 300</span>
                  </div>
                  <div className="h-2 bg-black/40 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-gradient-to-r from-[#22c55e] to-[#4ade80]" initial={{ width: 0 }} animate={{ width: `${playerHpPct}%` }} />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-[#60a5fa] text-xs font-bold uppercase">Mana</span>
                    <span className="text-white font-black text-lg"><AnimatedNumber value={playerMp} /> / 100</span>
                  </div>
                  <div className="h-2 bg-black/40 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-gradient-to-r from-[#3b82f6] to-[#60a5fa]" initial={{ width: 0 }} animate={{ width: `${playerMpPct}%` }} />
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {turn === 'player' ? (
                     <button onClick={endTurn} className="px-4 py-2 bg-red-500/10 border border-red-500/50 text-red-500 rounded-lg cursor-pointer font-bold text-xs hover:bg-red-500 hover:text-white transition-colors">結束回合</button>
                  ) : (
                    <span className="text-red-500 text-xs font-bold animate-pulse">敵方回合...</span>
                  )}
                </div>
              </div>
            </div>
            {turn === 'dead' && (
              <div style={{ textAlign: 'center', padding: 20, background: 'rgba(239,68,68,0.07)', border: '1px solid #ef4444', borderRadius: 10, marginBottom: 12 }}>
                <p style={{ color: '#ef4444', fontSize: 20, fontWeight: 900, margin: '0 0 12px' }}>☠️ 你已倒下</p>
                <button className="snake-btn" onClick={initLocal}>重新挑戰</button>
              </div>
            )}
            {(turn === 'player' || turn === 'boss') && (
              <div style={{ display: 'flex', gap: 14, opacity: turn === 'boss' ? 0.5 : 1, transition: 'opacity 0.3s' }}>
                {hand.map((card, idx) => {
                  const cc = cardColor(card.type)
                  const canCast = playerMp >= card.cost && turn === 'player' && bossState.is_alive
                  return (
                    <div key={idx} className="card-item" onClick={() => canCast && playCard(card)} style={{ flex: 1, minHeight: 180, background: `linear-gradient(180deg,rgba(0,0,0,0.6) 0%,${cc}18 100%)`, border: `1px solid ${canCast ? cc : '#333'}`, borderRadius: 12, padding: '20px 10px', cursor: canCast ? 'pointer' : 'not-allowed', color: canCast ? '#fff' : '#555', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transition: 'transform 0.2s', boxShadow: canCast ? `0 4px 15px ${cc}20` : 'none' }}>
                      <div style={{ fontSize: 44, marginBottom: 12 }}>{card.type === 'melee' ? '⚔️' : card.type === 'magic' ? '🔮' : '💖'}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>{card.name}</div>
                      <div style={{ fontSize: 12, color: '#60a5fa', marginBottom: 8 }}>耗魔: {card.cost}</div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: canCast ? cc : '#555' }}>{card.type === 'heal' ? `+${card.power} HP` : `${card.power} 傷`}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Right: damage leaderboard */}
      <div className="backdrop-blur-xl bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 h-fit sticky top-24">
        <h4 className="text-[#C8942A] text-xs font-bold uppercase tracking-[0.2em] mb-6">傷害排行</h4>
        {kills.length === 0 ? <p className="text-zinc-600 text-xs italic">尚無擊殺紀錄</p> : (
          <div className="flex flex-col gap-4">
            {kills.map((k, i) => (
              <div key={i} className="flex items-center gap-3 group">
                <span className={cn("text-sm w-6 font-bold", i === 0 ? "text-[#C8942A]" : "text-zinc-600")}>
                  {i === 0 ? '👑' : i + 1}
                </span>
                <span className="flex-1 text-zinc-300 text-sm truncate group-hover:text-white transition-colors">{k.player_name}</span>
                <span className="text-[#C8942A] font-black text-sm tabular-nums">
                  <AnimatedNumber value={k.total_damage} />
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="text-zinc-600 text-[10px] uppercase tracking-widest mt-8 text-center">Real-time Sync Active</p>
      </div>
    </div>
  )
}

// ── Portal War (Multiplayer Sync) ─────────────────────────────────────────────
function PortalWarGame({ onBack }) {
  const [phase, setPhase] = useState('lobby') // 'lobby' | 'playing' | 'finished'
  const [blueName, setBlueName] = useState('')
  const [orangeName, setOrangeName] = useState('')
  const [grid, setGrid] = useState(Array(100).fill(''))
  const [currentTeam, setCurrentTeam] = useState('blue')
  const [timeLeft, setTimeLeft] = useState(60)
  const [winner, setWinner] = useState(null)
  const [results, setResults] = useState([])
  const [loadingResults, setLoadingResults] = useState(false)
  const [toast, setToast] = useState(null)
  
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }
  
  // Multiplayer session & lobby state
  const [sessionId] = useState(() => {
    // 為了支援在同一台電腦、同一個瀏覽器的多個分頁進行對戰測試，必須使用 sessionStorage。
    // 這樣每個分頁都會產生一個獨立的 sessionId。
    let id = sessionStorage.getItem('portal_war_session')
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem('portal_war_session', id)
    }
    return id
  })
  
  const [lobby, setLobby] = useState({});
  const lobbyRef = useRef({});
  const socketRef = useRef(null);
  const [isDisconnected, setIsDisconnected] = useState(false);

  useEffect(() => {
    const socket = io('/', {
      query: { sessionId }
    });
    socketRef.current = socket;
    socket.on('lobby_update', (data) => {
      const players = data.players || {};
      setLobby(players);
      lobbyRef.current = players;
      
      const myP = players[sessionId];
      const serverPhase = data.phase || 'lobby';
      
      // 狀態機保護：如果正在遊戲中或結算中，除非伺服器明確重置，否則不隨意跳回 Lobby
      if (serverPhase === 'playing' || serverPhase === 'finished') {
        setPhase(serverPhase);
      } else if (serverPhase === 'lobby') {
        // 只有當伺服器真的在 Lobby 階段時，才允許切換
        setPhase('lobby');
      }

      const blue = Object.values(players).find(p => p.team === 'blue');
      const orange = Object.values(players).find(p => p.team === 'orange');
      const blueIsMe = blue?.sessionId === sessionId;
      const orangeIsMe = orange?.sessionId === sessionId;

      // 名稱同步邏輯
      // 1. 對手名稱永遠同步
      if (blue && !blueIsMe) setBlueName(blue.name);
      if (orange && !orangeIsMe) setOrangeName(orange.name);
      
      // 2. 本人名稱僅在比賽中（playing/finished）時同步顯示，以利認人；大廳時維持空白（使用者要求）
      if (serverPhase !== 'lobby') {
        if (blueIsMe && blue && !blueName) setBlueName(blue.name);
        if (orangeIsMe && orange && !orangeName) setOrangeName(orange.name);
      }
    });

    socket.on('faction_init', (data) => {
      if (data.grid) setGrid(data.grid);
      if (data.phase) setPhase(data.phase);
      if (data.timeLeft !== undefined) setTimeLeft(data.timeLeft);
    });

    socket.on('game_start', (data) => {
      const myP = lobbyRef.current[sessionId];
      if (myP?.team) {
        setGrid(data.grid);
        setPhase('playing');
        setWinner(null);
        setTimeLeft(60);
      }
    });

    socket.on('grid_update', (data) => {
      setGrid(prev => {
        const n = [...prev];
        n[data.index] = data.color;
        return n;
      });
    });

    socket.on('timer_tick', (t) => {
      setTimeLeft(t);
    });

    socket.on('game_finished', (data) => {
      setWinner(data.winner);
      setPhase('finished');
      fetchResults();
      if (data.forfeit) {
        addToast({ title: '分出勝負', description: `${data.leaver || '對手'} 已離開，由 ${data.winner === 'blue' ? '藍隊' : '橘隊'} 獲勝！`, variant: 'success' });
      } else {
        addToast({ title: '遊戲結束', description: `${data.winner === 'blue' ? '藍隊' : data.winner === 'orange' ? '橘隊' : '平局'} 獲得最終勝利！`, variant: 'info' });
      }
    });

    socket.on('player_disconnected_grace', () => {
      setIsDisconnected(true);
    });

    const handleUnload = () => {
      socket.emit('faction_forfeit');
    };
    window.addEventListener('beforeunload', handleUnload);

    // 只發送 join 訊號，不要帶入任何名稱覆蓋原本的資料
    socket.emit('join_faction', {});

    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      socket.disconnect();
    };
  }, [sessionId]);

  const fetchResults = async () => {
    setLoadingResults(true)
    try {
      const res = await fetch(`${API_URL}/faction/results`)
      const data = await res.json()
      // 如果後端返回成功且 data 為數組
      if (data.success && Array.isArray(data.data)) {
        setResults(data.data)
      }
    } catch (err) {
      console.error('[Faction] Failed to fetch results:', err);
    }
    setLoadingResults(false)
  }

  useEffect(() => { fetchResults() }, [])

  const handleReady = (team) => {
    const isReadyNow = team === 'blue' ? blueNameReady : orangeNameReady;
    const name = team === 'blue' ? blueName : orangeName;
    if (!isReadyNow && !name.trim()) return;
    
    const newReadyState = !isReadyNow;
    socketRef.current?.emit('join_faction', { name, team });
    socketRef.current?.emit('faction_ready', newReadyState);
  }

  // Removed local finishGame as the server now handles win/loss logic via socket game_finished

  // Remove the local interval-based timeLeft decrementor as we now use server startTime sync
  useEffect(() => {
    if (phase !== 'playing') return
  }, [phase])

  const handleCellClick = (i) => {
    const myP = lobby[sessionId];
    const team = myP?.team;
    if (phase !== 'playing' || !team) return
    socketRef.current?.emit('faction_move', i);
  }

  const startGame = () => {
    // 伺服器端會處理 start 邏輯
  }

  const winnerName = winner === 'blue' ? (blueName || '藍隊') : winner === 'orange' ? (orangeName || '橘隊') : null

  const blueCount = grid.filter(c => c === '#3b82f6').length
  const orangeCount = grid.filter(c => c === '#f97316').length

  const blueP = Object.values(lobby).find(p => p.team === 'blue');
  const orangeP = Object.values(lobby).find(p => p.team === 'orange');
  const blueNameReady = blueP?.isReady;
  const orangeNameReady = orangeP?.isReady;
  const blueIsMe = blueP?.sessionId === sessionId;
  const orangeIsMe = orangeP?.sessionId === sessionId;

  if (phase === 'lobby') {
    const isBlueOccupied = blueP && !blueIsMe;
    const isOrangeOccupied = orangeP && !orangeIsMe;
    const bothReady = blueNameReady && orangeNameReady;
    const canStart = bothReady;

    return (
      <div style={{ width: '100%', maxWidth: 500, margin: '40px auto' }}>
        <h3 style={{ textAlign: 'center', fontSize: 26, fontWeight: 900, marginBottom: 8 }}>陣營大戰</h3>
        <p style={{ textAlign: 'center', color: '#666', fontSize: 14, marginBottom: 32 }}>雙人同步對戰 · 強制不同瀏覽器連線</p>
        <div className="portal-war-lobby">
          {/* Blue Team */}
          <div style={{ padding: 16, background: blueNameReady ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.04)', border: `1px solid ${blueNameReady ? '#3b82f6' : 'rgba(59,130,246,0.2)'}`, borderRadius: 10, transition: 'all 0.3s', opacity: (isBlueOccupied) ? 0.6 : 1 }}>
            <label style={{ display: 'block', color: '#3b82f6', fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>
              {isBlueOccupied ? '對手已佔位' : '藍方玩家'}
            </label>
            <input value={blueName} onChange={e => setBlueName(e.target.value)} placeholder="輸入名稱" maxLength={20} disabled={blueNameReady || isBlueOccupied} style={{ width: '100%', padding: '10px 12px', background: 'transparent', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 6, color: '#3b82f6', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 10, opacity: (blueNameReady || isBlueOccupied) ? 0.6 : 1 }} />
            <button onClick={() => !isBlueOccupied && handleReady('blue')} disabled={isBlueOccupied && !blueIsMe} style={{ width: '100%', padding: '8px', background: blueNameReady ? '#3b82f6' : 'transparent', border: '1px solid #3b82f6', borderRadius: 6, color: blueNameReady ? '#fff' : '#3b82f6', fontSize: 13, fontWeight: 700, cursor: (blueName.trim() && (!isBlueOccupied || blueIsMe)) ? 'pointer' : 'not-allowed', opacity: blueName.trim() ? 1 : 0.4 }}>
              {blueIsMe ? (blueNameReady ? '取消準備' : '按下準備') : (isBlueOccupied ? '對手準備中' : '加入藍隊')}
            </button>
          </div>
          {/* Orange Team */}
          <div style={{ padding: 16, background: orangeNameReady ? 'rgba(249,115,22,0.12)' : 'rgba(249,115,22,0.04)', border: `1px solid ${orangeNameReady ? '#f97316' : 'rgba(249,115,22,0.2)'}`, borderRadius: 10, transition: 'all 0.3s', opacity: (isOrangeOccupied) ? 0.6 : 1 }}>
            <label style={{ display: 'block', color: '#f97316', fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 8 }}>
              {isOrangeOccupied ? '對手已佔位' : '橘方玩家'}
            </label>
            <input value={orangeName} onChange={e => setOrangeName(e.target.value)} placeholder="輸入名稱" maxLength={20} disabled={orangeNameReady || isOrangeOccupied} style={{ width: '100%', padding: '10px 12px', background: 'transparent', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 6, color: '#f97316', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 10, opacity: (orangeNameReady || isOrangeOccupied) ? 0.6 : 1 }} />
            <button onClick={() => !isOrangeOccupied && handleReady('orange')} disabled={isOrangeOccupied && !orangeIsMe} style={{ width: '100%', padding: '8px', background: orangeNameReady ? '#f97316' : 'transparent', border: '1px solid #f97316', borderRadius: 6, color: orangeNameReady ? '#fff' : '#f97316', fontSize: 13, fontWeight: 700, cursor: (orangeName.trim() && (!isOrangeOccupied || orangeIsMe)) ? 'pointer' : 'not-allowed', opacity: orangeName.trim() ? 1 : 0.4 }}>
              {orangeIsMe ? (orangeNameReady ? '取消準備' : '按下準備') : (isOrangeOccupied ? '對手準備中' : '加入橘隊')}
            </button>
          </div>
        </div>

        {!bothReady && <p style={{ textAlign: 'center', color: '#555', fontSize: 13, marginBottom: 16 }}>兩位玩家都必須按下準備才能開始</p>}
        {results.length > 0 && (
          <div>
            <h4 style={{ fontSize: 13, color: '#555', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 12 }}>近期戰績</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {results.slice(0, 8).map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, fontSize: 13 }}>
                  <span style={{ color: '#3b82f6', fontWeight: 700 }}>{r.blue_player}</span>
                  <span style={{ color: '#444', fontSize: 11 }}>{r.blue_score}</span>
                  <span style={{ flex: 1, textAlign: 'center', color: '#555' }}>vs</span>
                  <span style={{ color: '#444', fontSize: 11 }}>{r.orange_score}</span>
                  <span style={{ color: '#f97316', fontWeight: 700 }}>{r.orange_player}</span>
                  <span style={{ color: r?.winner === 'blue' ? '#3b82f6' : r?.winner === 'orange' ? '#f97316' : '#888', fontWeight: 700, fontSize: 10 }}>
                    {r?.winner === 'blue' ? '藍隊' : r?.winner === 'orange' ? '橘隊' : '平局'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 20, fontWeight: 700, fontSize: 14 }}>
          <span style={{ color: '#3b82f6', textShadow: '0 0 8px rgba(59,130,246,0.5)' }}>藍隊 {blueName || '未加入'}: {blueCount}</span>
          <span style={{ color: '#f97316', textShadow: '0 0 8px rgba(249,115,22,0.5)' }}>橘隊 {orangeName || '未加入'}: {orangeCount}</span>
        </div>
        <div style={{ color: timeLeft <= 10 ? '#ff4d00' : 'var(--muted)', fontWeight: 700, fontSize: 16, border: '1px solid #333', borderRadius: 20, padding: '4px 18px' }}>{timeLeft} 秒</div>
      </div>
      {phase === 'playing' && (
        <div style={{ textAlign: 'center', marginBottom: 10, fontSize: 13, color: blueIsMe ? '#3b82f6' : orangeIsMe ? '#f97316' : '#888', fontWeight: 700, letterSpacing: '0.1em' }}>
          {blueIsMe ? `您是藍隊 — 點擊佔領格子` : orangeIsMe ? `您是橘隊 — 點擊佔領格子` : `觀戰模式 — 比賽進行中`}
        </div>
      )}
      <div className="portal-war-grid">
        {grid.map((c, i) => (
          <div key={i} onClick={() => handleCellClick(i)} style={{ aspectRatio: '1/1', background: c || '#0a0a0a', cursor: phase === 'playing' && !c ? 'pointer' : 'default', borderRadius: 3, transition: 'background 0.15s', boxShadow: c ? `0 0 6px ${c}80` : 'none' }} />
        ))}
        {phase === 'finished' && winner && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: 6, gap: 14 }}>
            <p style={{ color: winner === 'blue' ? '#3b82f6' : winner === 'orange' ? '#f97316' : '#fff', fontSize: 32, fontWeight: 900, margin: 0, textShadow: `0 0 16px ${winner === 'blue' ? '#3b82f6' : '#f97316'}` }}>
              {winner === 'draw' ? '平局！' : `${winner === 'blue' ? '藍隊' : '橘隊'} ${winnerName} 獲勝！`}
            </p>
            <p style={{ color: '#aaa', fontSize: 14, margin: 0 }}>藍：{blueCount} 格　橘：{orangeCount} 格</p>
            <button className="snake-btn" onClick={() => {
                socketRef.current?.emit('faction_forfeit');
                socketRef.current?.disconnect();
                if (onBack) onBack();
              }}>返回選單</button>
          </div>
        )}
      </div>

      {/* Modern Custom Toast Container */}
      <div style={{ position: 'fixed', top: 30, left: '50%', transform: 'translateX(-50%)', zIndex: 10000, pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{
              padding: '12px 24px',
              background: 'rgba(20, 20, 20, 0.9)',
              backdropFilter: 'blur(20px)',
              pointerEvents: 'auto',
              border: `1px solid ${toast.type === 'success' ? 'rgba(59, 130, 246, 0.5)' : 'rgba(212, 240, 41, 0.3)'}`,
              borderRadius: '12px',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 600,
              boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 15px ${toast.type === 'success' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(212, 240, 41, 0.1)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              minWidth: 280,
              justifyContent: 'center',
              textAlign: 'center'
            }}
          >
            <span style={{ fontSize: 13, letterSpacing: '0.15em', opacity: 0.8, color: toast.type === 'success' ? '#3b82f6' : '#d4f029' }}>{toast.type === 'success' ? '成功' : '通知'}</span>
            {toast.message}
          </motion.div>
        )}
      </div>
    </div>
  )
}

// AI Image Generation
const ASPECT_RATIOS = [
  { label: '1:1',  value: '1:1',  width: 1024, height: 1024 },
  { label: '16:9', value: '16:9', width: 1344, height: 768  },
  { label: '9:16', value: '9:16', width: 768,  height: 1344 },
]
const QUALITY_SUFFIX = ', cinematic lighting, masterpiece, 8k, highly detailed, Unreal Engine 5, photorealistic'

function AiImageTab() {
  const [prompt, setPrompt] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [aspect, setAspect] = useState('1:1')
  const [highQuality, setHighQuality] = useState(false)

  const generate = async () => {
    if (!prompt.trim() || loading) return
    setLoading(true); setError(''); setNote(''); setImageUrl('')
    const { width, height } = ASPECT_RATIOS.find(a => a.value === aspect)
    const finalPrompt = highQuality ? prompt + QUALITY_SUFFIX : prompt
    try {
      const res = await fetch(`${API_URL}/ai/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: finalPrompt, width, height })
      })
      const data = await res.json()
      if (data.success) { setImageUrl(data.imageUrl); setNote(data.note || '') }
      else setError(data.error || '生成失敗')
    } catch { setError('連線失敗，請確認後端已啟動') }
    setLoading(false)
  }

  const download = async () => {
    if (!imageUrl) return
    try {
      const a = document.createElement('a')
      a.href = imageUrl
      a.download = `wayne-ai-${Date.now()}.png`
      a.click()
    } catch { window.open(imageUrl, '_blank') }
  }

  return (
    <div className="ai-tab">
      <div className="ai-input-section">
        <h2 className="ai-heading">AI 圖片生成</h2>
        <p className="ai-sub">輸入描述，讓 AI 為你生成圖片</p>

        {/* Aspect ratio + quality controls */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginRight: 4 }}>比例</span>
          {ASPECT_RATIOS.map(r => (
            <button
              key={r.value}
              onClick={() => setAspect(r.value)}
              style={{
                padding: '5px 16px', borderRadius: 20,
                border: `1px solid ${aspect === r.value ? 'var(--accent)' : 'var(--border)'}`,
                background: aspect === r.value ? 'var(--accent)' : 'transparent',
                color: aspect === r.value ? '#000' : 'var(--muted)',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
              }}
            >{r.label}</button>
          ))}
          <button
            onClick={() => setHighQuality(q => !q)}
            style={{
              marginLeft: 8, padding: '5px 16px', borderRadius: 20,
              border: `1px solid ${highQuality ? '#a78bfa' : 'var(--border)'}`,
              background: highQuality ? 'rgba(167,139,250,0.15)' : 'transparent',
              color: highQuality ? '#a78bfa' : 'var(--muted)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s'
            }}
          >✦ 高品質模式</button>
        </div>

        <div className="ai-input-row">
          <input
            className="ai-input"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && generate()}
            placeholder="例如：一隻戴墨鏡的太空貓..."
          />
          <button className="ai-gen-btn" onClick={generate} disabled={loading || !prompt.trim()}>
            {loading ? '生成中...' : '生成'}
          </button>
        </div>
        {error && <p className="ai-error">{error}</p>}
        {note && <p className="ai-note">{note}</p>}
      </div>
      <div className="ai-preview">
        {loading && (
          <div className="ai-loading">
            <div className="ai-spinner" />
            <p>AI 正在創作中...</p>
          </div>
        )}
        {!loading && !imageUrl && (
          <div className="ai-placeholder">
            <p>圖片將顯示在這裡</p>
          </div>
        )}
        {!loading && imageUrl && (
          <>
            <img
              src={imageUrl} alt="AI generated" className="ai-result-img"
              style={{ aspectRatio: aspect === '16:9' ? '16/9' : aspect === '9:16' ? '9/16' : '1/1' }}
            />
            {/* 獨立出的下載按鈕區域 */}
            <div className="ai-download-wrapper">
              <button className="ai-dl-btn-v2" onClick={download}>
                儲存圖片
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Game Configurations
const GAMES = [
  { id: 'snake',   emoji: '🐍', name: '貪食蛇',    desc: '方向鍵控制蛇吃食物，別撞牆！', color: '#d4f029' },
  { id: 'dino',    emoji: '🦖', name: '恐龍避障',   desc: '空白鍵跳躍，躲開所有障礙物！', color: '#f97316' },
  { id: '2048',    emoji: '🟩', name: '2048',       desc: '方向鍵滑動合併數字磚塊。',     color: '#edc22e' },
  { id: 'boss',    emoji: '⚔️', name: '尾刀爭奪戰', desc: '打出卡牌消滅骷髏王！',         color: '#a855f7' },
  { id: 'portal',  emoji: '🔵', name: '陣營大戰',   desc: '雙人同台搶佔格子領土。',       color: '#00a2ff' },
]

// FunPage Component
export default function FunPage() {
  useLenis()
  const [activeTab, setActiveTab] = useState('games')
  const [selectedGame, setSelectedGame] = useState(null) // null = show menu
  const [lbRefresh, setLbRefresh] = useState(0)

  return (
    <>
      <style>{`
        .fun-page { padding-top: 80px; min-height: 100vh; }
        .fun-header { padding: 80px 6vw 60px; border-bottom: 1px solid var(--border); }
        .fun-title {
          font-family: var(--font-sans);
          font-size: clamp(60px, 12vw, 160px);
          font-weight: 900; text-transform: uppercase; line-height: 0.9;
          letter-spacing: -0.02em; margin: 16px 0 20px;
        }
        .fun-subtitle { font-size: 14px; color: var(--muted); letter-spacing: 0.2em; text-transform: uppercase; }
        .tab-nav {
          display: flex; gap: 0; border-bottom: 1px solid var(--border);
          padding: 0 6vw;
        }
        .tab-btn {
          padding: 16px 24px; background: none; border: none; cursor: pointer;
          font-family: var(--font-sans); font-size: 13px; letter-spacing: 0.15em;
          text-transform: uppercase; color: var(--muted);
          border-bottom: 2px solid transparent; margin-bottom: -1px;
          transition: color 0.3s, border-color 0.3s;
        }
        .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
        .tab-btn:hover { color: var(--fg); }
        .tab-content { padding: 60px 6vw; display: flex; flex-direction: column; align-items: center; }

        /* Game selection menu */
        .game-select-title {
          font-family: var(--font-sans); font-size: 13px; letter-spacing: 0.25em;
          text-transform: uppercase; color: var(--muted); margin-bottom: 32px;
        }
        .game-cards-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(200px, 280px));
          justify-content: center;
          max-width: 960px;
          margin: 0 auto;
          gap: 20px;
        }
        @media (max-width: 700px) {
          .game-cards-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 460px) {
          .game-cards-grid { grid-template-columns: 1fr; }
        }
        .game-card {
          background: var(--surface, #111);
          border: 1px solid var(--border, #222);
          border-radius: 12px;
          padding: 28px 20px 24px;
          cursor: pointer;
          transition: border-color 0.25s, transform 0.2s, box-shadow 0.25s;
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          text-align: center;
        }
        .game-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        }
        .game-card-emoji { font-size: 48px; line-height: 1; }
        .game-card-name {
          font-family: var(--font-sans); font-size: 18px; font-weight: 800;
          letter-spacing: 0.04em;
        }
        .game-card-desc { font-size: 12px; color: var(--muted); line-height: 1.5; }
        .game-card-play {
          margin-top: 4px; font-size: 11px; letter-spacing: 0.18em;
          text-transform: uppercase; font-family: var(--font-sans); font-weight: 700;
          opacity: 0.7; transition: opacity 0.2s;
        }
        .game-card:hover .game-card-play { opacity: 1; }

        /* Back button */
        .back-btn {
          display: inline-flex; align-items: center; gap: 8px;
          background: none; border: 1px solid #333; color: var(--muted);
          padding: 8px 18px; border-radius: 6px; cursor: pointer;
          font-family: var(--font-sans); font-size: 12px; letter-spacing: 0.15em;
          text-transform: uppercase; margin-bottom: 36px;
          transition: border-color 0.3s, color 0.3s;
        }
        .back-btn:hover { border-color: var(--fg); color: var(--fg); }

        /* Active game area */
        .game-centered { max-width: fit-content; margin: 0 auto; }
        .game-area-title {
          font-family: var(--font-sans); font-size: 13px; letter-spacing: 0.25em;
          text-transform: uppercase; color: var(--muted); margin-bottom: 32px;
          display: flex; align-items: center; gap: 10px;
        }
        .game-area-title span { font-size: 20px; }

        /* Snake layout */
        .games-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; align-items: start; width: 100%; max-width: 1200px; margin: 0 auto; }
        @media (max-width: 900px) { .games-layout { grid-template-columns: 1fr; } }
        
        /* Mobile responsive game layouts */
        .snake-game-layout { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 32px; max-width: 1100px; margin: 0 auto; }
        @media (max-width: 768px) {
          .snake-game-layout { grid-template-columns: 1fr; gap: 24px; }
          .snake-canvas { width: 100% !important; height: auto !important; aspect-ratio: 1/1; }
        }
        
        .game-2048-layout { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 32px; width: 100%; max-width: 700px; margin: 0 auto; }
        @media (max-width: 768px) {
          .game-2048-layout { grid-template-columns: 1fr; gap: 24px; }
        }
        
        .boss-raid-layout { display: grid; grid-template-columns: 240px 1fr 300px; gap: 30px; width: 100%; max-width: 1200px; margin: 0 auto; }
        @media (max-width: 1024px) {
          .boss-raid-layout { grid-template-columns: 1fr 300px; gap: 20px; }
          .boss-raid-layout > div:first-child { display: none; }
        }
        @media (max-width: 768px) {
          .boss-raid-layout { grid-template-columns: 1fr; gap: 20px; }
        }
        
        .portal-war-lobby { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
        @media (max-width: 600px) {
          .portal-war-lobby { grid-template-columns: 1fr; gap: 12px; }
        }
        
        .portal-war-grid { display: grid; grid-template-columns: repeat(10, 1fr); gap: 8px; background: #1a1a1a; border: 2px solid #333; padding: 12px; border-radius: 12px; position: relative; }
        @media (max-width: 768px) {
          .portal-war-grid { gap: 4px; padding: 8px; }
        }
        @media (max-width: 480px) {
          .portal-war-grid { gap: 2px; padding: 6px; }
        }
        
        /* Mobile responsive adjustments */
        @media (max-width: 768px) {
          .fun-header { padding: 60px 4vw 40px; }
          .fun-title { font-size: clamp(48px, 10vw, 120px); }
          .tab-content { padding: 40px 4vw; }
          .tab-nav { padding: 0 4vw; }
          .tab-btn { padding: 12px 16px; font-size: 12px; }
          
          .snake-header { flex-wrap: wrap; gap: 8px; }
          .snake-label, .game-label { font-size: 10px; }
          .snake-score, .game-score-display { font-size: 16px; }
          .snake-overlay { inset: 0; }
          .snake-msg, .game-hint-text { font-size: 13px; }
          .snake-final-score, .game-over-text { font-size: 32px; }
          .snake-btn { padding: 10px 24px; font-size: 12px; }
          .snake-save-row { flex-direction: column; width: 100%; max-width: 240px; }
          .snake-name-input { width: 100%; }
          
          .leaderboard { padding: 16px; }
          .lb-title { font-size: 12px; }
          .lb-item { gap: 10px; padding: 10px 0; }
          .lb-rank { width: 24px; font-size: 16px; }
          .lb-name { font-size: 13px; }
          .lb-pts { font-size: 14px; }
          
          .game-header-row { flex-wrap: wrap; gap: 8px; }
          .game-area-title { font-size: 12px; margin-bottom: 24px; }
          .game-area-title span { font-size: 18px; }
          
          .dpad-btn { padding: 8px; font-size: 14px; }
          
          .ai-heading { font-size: 24px; }
          .ai-sub { font-size: 13px; margin-bottom: 24px; }
          .ai-input-row { flex-direction: column; gap: 10px; }
          .ai-input { padding: 12px 16px; font-size: 14px; }
          .ai-gen-btn { padding: 12px 24px; width: 100%; }
          .ai-preview { min-height: 320px; padding: 12px; }
          .ai-download-wrapper { margin-top: 20px; }
          .ai-dl-btn-v2 { padding: 12px 32px; font-size: 14px; }
        }
        
        @media (max-width: 480px) {
          .fun-header { padding: 40px 4vw 30px; }
          .tab-btn { padding: 10px 12px; font-size: 11px; }
          .game-cards-grid { gap: 12px; }
          .game-card { padding: 20px 16px; }
          .game-card-emoji { font-size: 40px; }
          .game-card-name { font-size: 16px; }
          .back-btn { font-size: 11px; padding: 6px 14px; }
          
          .snake-game-layout { gap: 20px; }
          .snake-header { font-size: 10px; }
          .snake-score { font-size: 14px; }
          .snake-canvas { max-width: 100%; }
          .snake-btn { padding: 8px 20px; font-size: 11px; }
          .snake-msg { font-size: 12px; }
          .snake-final-score { font-size: 28px; }
          
          .leaderboard { padding: 14px; }
          .lb-title { font-size: 11px; }
          .lb-item { gap: 8px; padding: 8px 0; }
          .lb-rank { width: 20px; font-size: 14px; }
          .lb-name { font-size: 12px; }
          .lb-pts { font-size: 13px; }
          
          .dpad-btn { padding: 6px; font-size: 12px; }
          .dino-jump-btn { max-width: 160px !important; padding: 12px 24px !important; font-size: 16px !important; }
          
          .game-2048-layout { gap: 20px; }
          .boss-raid-layout { gap: 16px; }
          .portal-war-lobby { gap: 10px; }
          .portal-war-grid { gap: 2px; padding: 6px; }
          
          .ai-heading { font-size: 20px; }
          .ai-sub { font-size: 12px; }
          .ai-input { padding: 10px 14px; font-size: 13px; }
          .ai-gen-btn { padding: 10px 20px; font-size: 12px; }
          .ai-preview { min-height: 280px; }
        }
        .snake-container { position: relative; }
        .snake-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .snake-label { font-family: var(--font-sans); font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase; color: var(--muted); }
        .snake-score { font-family: var(--font-sans); font-size: 18px; font-weight: 800; color: var(--accent); }
        .snake-canvas { display: block; border: 1px solid #222; }
        .snake-overlay {
          position: absolute; inset: 36px 0 0; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 16px;
          background: rgba(8,8,8,0.88); backdrop-filter: blur(4px);
        }
        .snake-msg { font-family: var(--font-sans); font-size: 14px; color: var(--muted); letter-spacing: 0.1em; }
        .snake-final-score { font-family: var(--font-sans); font-size: 40px; font-weight: 900; color: var(--accent); }
        .snake-btn {
          padding: 12px 32px; background: var(--accent); color: var(--bg);
          border: none; cursor: pointer; font-family: var(--font-sans);
          font-size: 13px; font-weight: 800; letter-spacing: 0.15em; text-transform: uppercase;
          border-radius: 4px; transition: opacity 0.3s;
        }
        .snake-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .snake-btn-ghost {
          padding: 10px 24px; background: none; border: 1px solid #333;
          color: var(--muted); cursor: pointer; font-family: var(--font-sans);
          font-size: 12px; letter-spacing: 0.15em; text-transform: uppercase;
          border-radius: 4px; transition: border-color 0.3s, color 0.3s;
        }
        .snake-btn-ghost:hover { border-color: var(--fg); color: var(--fg); }
        .snake-save-row { display: flex; gap: 8px; }
        .snake-name-input {
          padding: 10px 14px; background: #111; border: 1px solid #333;
          color: var(--fg); font-family: var(--font-body); font-size: 14px; border-radius: 4px; outline: none;
        }
        .snake-name-input:focus { border-color: var(--accent); }
        .snake-saved { color: var(--accent); font-family: var(--font-sans); font-size: 14px; }

        /* Leaderboard */
        .leaderboard { padding: 24px; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; }
        .lb-title { font-family: var(--font-sans); font-size: 14px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--muted); margin-bottom: 20px; }
        .lb-list { list-style: none; display: flex; flex-direction: column; gap: 12px; }
        .lb-item { display: flex; align-items: center; gap: 16px; padding: 12px 0; border-bottom: 1px solid var(--border); }
        .lb-item:last-child { border-bottom: none; }
        .lb-rank { width: 28px; font-size: 18px; text-align: center; }
        .lb-name { flex: 1; font-family: var(--font-sans); font-size: 14px; font-weight: 600; }
        .lb-pts { font-family: var(--font-sans); font-size: 16px; font-weight: 800; color: var(--accent); }
        .lb-top .lb-name { color: var(--fg); }
        .lb-loading, .lb-empty { color: var(--muted); font-size: 13px; padding: 20px 0; }

        /* Generic game UI helpers */
        .game-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .game-label { font-family: var(--font-sans); font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase; color: var(--muted); }
        .game-score-display { font-family: var(--font-sans); font-size: 18px; font-weight: 800; color: var(--accent); }
        .game-overlay-center {
          position: absolute; inset: 0; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 12px;
          background: rgba(8,8,8,0.88); backdrop-filter: blur(4px);
        }
        .game-over-text { font-family: var(--font-sans); font-size: 20px; font-weight: 800; color: var(--accent); margin: 0; }
        .game-hint-text { font-family: var(--font-sans); font-size: 14px; color: var(--muted); margin: 0; }
        .dpad-btn {
          padding: 10px; background: #111; border: 1px solid #333; color: var(--fg);
          border-radius: 6px; cursor: pointer; font-size: 16px;
          transition: background 0.2s, border-color 0.2s;
        }
        .dpad-btn:hover { background: #1a1a1a; border-color: var(--accent); color: var(--accent); }

        /* AI Tab */
        .ai-tab { width: 100%; max-width: 1200px; margin: 0 auto; }
        .ai-input-section { margin-bottom: 0; }
        .ai-heading { font-family: var(--font-sans); font-size: 32px; font-weight: 800; text-transform: uppercase; margin-bottom: 8px; }
        .ai-sub { font-size: 14px; color: var(--muted); margin-bottom: 32px; }
        .ai-input-row { display: flex; gap: 12px; margin-bottom: 12px; }
        .ai-input {
          flex: 1; padding: 14px 18px; background: #111; border: 1px solid #333;
          color: var(--fg); font-family: var(--font-body); font-size: 15px; border-radius: 4px; outline: none;
        }
        .ai-input:focus { border-color: var(--accent); }
        .ai-gen-btn {
          padding: 14px 28px; background: var(--accent); color: var(--bg);
          border: none; cursor: pointer; font-family: var(--font-sans);
          font-size: 13px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;
          border-radius: 4px; white-space: nowrap; transition: opacity 0.3s;
        }
        .ai-gen-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .ai-error { color: #ff4d00; font-size: 13px; margin-bottom: 16px; }
        .ai-note { color: var(--muted); font-size: 12px; margin-bottom: 16px; }
        .ai-preview {
          margin-top: 24px; width: 100%; min-height: 480px;
          background: #0a0a0a; border: 1px solid #222; border-radius: 8px;
          display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: visible;
          position: relative; padding: 20px;
        }
        .ai-loading { display: flex; flex-direction: column; align-items: center; gap: 16px; color: var(--muted); font-size: 13px; }
        .ai-spinner {
          width: 36px; height: 36px; border: 3px solid #222;
          border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .ai-placeholder { display: flex; align-items: center; justify-content: center; height: 100%; color: #555; font-size: 14px; }
        .ai-result-img { width: 100%; height: auto; max-height: 75vh; object-fit: contain; border-radius: 12px; display: block; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
        
        .ai-download-wrapper {
          width: 100%; display: flex; justify-content: center; margin-top: 32px; padding-bottom: 20px;
        }
        .ai-dl-btn-v2 {
          display: flex; align-items: center; gap: 12px;
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #fff; padding: 16px 40px; border-radius: 99px;
          font-family: var(--font-sans); font-size: 15px; font-weight: 700;
          cursor: pointer; transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        .ai-dl-btn-v2:hover {
          background: var(--accent); color: #000; transform: scale(1.05) translateY(-2px);
          box-shadow: 0 15px 40px rgba(212, 240, 41, 0.3); border-color: var(--accent);
        }
        .ai-dl-icon { font-size: 18px; }
      `}</style>

      <TopNav />
      <main className="fun-page">
        <header className="fun-header">
          <p className="section-tag">PLAYGROUND</p>
          <div style={{ marginBottom: -32, position: 'relative', zIndex: 2 }}>
            <YorkieDog variant="fun" size={120} />
          </div>
          <h1 className="fun-title" style={{ position: 'relative', zIndex: 1 }}>玩樂空間</h1>
          <p className="fun-subtitle">遊戲 · 功能 · AI 工具  </p>
        </header>

        <div className="tab-nav">
          <button className={`tab-btn ${activeTab === 'games' ? 'active' : ''}`} onClick={() => { setActiveTab('games'); setSelectedGame(null) }}>
            遊戲區
          </button>
          <button className={`tab-btn ${activeTab === 'calc' ? 'active' : ''}`} onClick={() => setActiveTab('calc')}>
            計算區
          </button>
          <button className={`tab-btn ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')}>
            AI 圖片生成
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'games' && (
            <>
              {/* Game selection menu */}
              {!selectedGame && (
                <>
                  <p className="game-select-title">選擇遊戲</p>
                  <div className="game-cards-grid">
                    {GAMES.map(game => (
                      <div
                        key={game.id}
                        className="game-card"
                        style={{ '--card-color': game.color }}
                        onClick={() => setSelectedGame(game.id)}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = game.color
                          e.currentTarget.style.boxShadow = `0 8px 32px ${game.color}22`
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = ''
                          e.currentTarget.style.boxShadow = ''
                        }}
                      >
                        <div className="game-card-emoji">{game.emoji}</div>
                        <div className="game-card-name" style={{ color: game.color }}>{game.name}</div>
                        <div className="game-card-desc">{game.desc}</div>
                        <div className="game-card-play" style={{ color: game.color }}>點擊開始 →</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Active game view */}
              {selectedGame && (
                <>
                  <button className="back-btn" onClick={() => setSelectedGame(null)}>
                    ← 返回選單
                  </button>

                  {/* Snake */}
                  {selectedGame === 'snake' && (
                    <div className="snake-game-layout">
                      <div style={{ width: '100%' }}>
                        <SnakeGame onNewScore={() => setLbRefresh(r => r + 1)} />
                      </div>
                      <div style={{ alignSelf: 'start', marginTop: '54px' }}>
                        <Leaderboard refresh={lbRefresh} gameType="snake" title="貪吃蛇排行榜" />
                      </div>
                    </div>
                  )}

                  {/* Dino */}
                  {selectedGame === 'dino' && (
                    <div className="game-centered">
                      <p className="game-area-title"><span>🦖</span> 恐龍避障</p>
                      <DinoGame />
                    </div>
                  )}

                  {/* 2048 */}
                  {selectedGame === '2048' && <Game2048 />}

                  {/* Boss Raid */}
                  {selectedGame === 'boss' && (
                    <div className="game-centered">
                      <p className="game-area-title"><span>⚔️</span> 尾刀爭奪戰</p>
                      <BossRaidGame />
                    </div>
                  )}

                  {/* Portal War */}
                  {selectedGame === 'portal' && (
                    <div className="game-centered">
                      <p className="game-area-title">陣營大戰</p>
                      <PortalWarGame onBack={() => setSelectedGame(null)} />
                    </div>
                  )}
                </>
              )}
            </>
          )}
          {activeTab === 'ai' && <AiImageTab />}
          {activeTab === 'calc' && (
            <div style={{ marginTop: '20px' }}>
              <MoneyCalculator />
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}
