import { useState, useRef, useEffect } from 'react'
import { API_URL } from '../config/api'

// ─── hex → "r, g, b" helper ───────────────────────────────────────────────────
function hexToRgb(hex) {
  const map = {
    '#0F0': '0, 255, 0',
    '#FF0000': '255, 0, 0',
    '#0088FF': '0, 136, 255',
    '#FFA500': '255, 165, 0',
    '#FF00FF': '255, 0, 255',
    '#FFFFFF': '255, 255, 255',
  }
  if (map[hex]) return map[hex]
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  if (m) return `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}`
  return '212, 240, 41'
}

// ─── WobotSVG ─────────────────────────────────────────────────────────────────
export const WobotSVG = ({
  color = "currentColor",
  size = 20,
  className = "",
  face = "normal",
  isTalking = false,
}) => {
  const faceAnimation =
    face === "happy" ? "wobot-bounce 0.5s infinite" : "none";
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      style={{
        transition: "stroke 0.2s ease, transform 0.2s",
        animation: faceAnimation,
        flexShrink: 0,
      }}
    >
      <style>{`@keyframes wobot-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } } @keyframes wobot-talk { 0% { transform: scaleY(1); } 100% { transform: scaleY(0.4); } }`}</style>
      <path
        d="M10,40 L25,10 L50,30 L75,10 L90,40 C90,80 75,95 50,95 C25,95 10,80 10,40 Z"
        fill="rgba(0,0,0,0.5)"
        stroke={color}
        strokeWidth="5"
        strokeLinejoin="round"
      />
      <g
        style={{
          transformOrigin: "50% 55px",
          animation: isTalking ? "wobot-talk 0.15s infinite alternate" : "none",
        }}
      >
        <path
          d="M25,45 L35,65 L50,50 L65,65 L75,45"
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <path
        d="M50,30 V5"
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="50" cy="5" r="4" fill={color} />
      <line
        x1="5"
        y1="60"
        x2="20"
        y2="65"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <line
        x1="5"
        y1="75"
        x2="20"
        y2="70"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <line
        x1="95"
        y1="60"
        x2="80"
        y2="65"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <line
        x1="95"
        y1="75"
        x2="80"
        y2="70"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
      {face === "normal" && (
        <>
          <circle cx="35" cy="40" r="4" fill={color} />
          <circle cx="65" cy="40" r="4" fill={color} />
        </>
      )}
      {face === "happy" && (
        <>
          <path
            d="M30,42 Q35,35 40,42"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M60,42 Q65,35 70,42"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
          />
        </>
      )}
      {face === "sad" && (
        <>
          <path
            d="M30,38 Q35,42 40,38"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M60,38 Q65,42 70,38"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
};

// ─── Mode icon components ──────────────────────────────────────────────────────
export const WobotNormalIcon = ({
  color = "currentColor",
  size = 16,
}) => (
  <svg viewBox="0 0 100 100" width={size} height={size}>
    <path
      d="M10,40 L25,10 L50,30 L75,10 L90,40 C90,80 75,95 50,95 C25,95 10,80 10,40 Z"
      fill="none"
      stroke={color}
      strokeWidth="6"
    />
    <circle cx="35" cy="45" r="5" fill={color} />
    <circle cx="65" cy="45" r="5" fill={color} />
    <path
      d="M35,65 L50,75 L65,65"
      fill="none"
      stroke={color}
      strokeWidth="6"
      strokeLinecap="round"
    />
  </svg>
);

export const WobotRoastIcon = ({
  color = "currentColor",
  size = 16,
}) => (
  <svg viewBox="0 0 100 100" width={size} height={size}>
    <path
      d="M10,40 L25,10 L50,30 L75,10 L90,40 C90,80 75,95 50,95 C25,95 10,80 10,40 Z"
      fill="none"
      stroke={color}
      strokeWidth="6"
    />
    <path d="M25,10 L20,0 L30,5 Z" fill={color} />
    <path d="M75,10 L80,0 L70,5 Z" fill={color} />
    <path
      d="M30,45 L40,45"
      stroke={color}
      strokeWidth="6"
      strokeLinecap="round"
    />
    <path
      d="M60,45 L70,45"
      stroke={color}
      strokeWidth="6"
      strokeLinecap="round"
    />
    <path
      d="M35,70 Q50,60 65,70"
      fill="none"
      stroke={color}
      strokeWidth="6"
      strokeLinecap="round"
    />
  </svg>
);

export const WobotPraiseIcon = ({
  color = "currentColor",
  size = 16,
}) => (
  <svg viewBox="0 0 100 100" width={size} height={size}>
    <ellipse
      cx="50"
      cy="5"
      rx="20"
      ry="5"
      fill="none"
      stroke={color}
      strokeWidth="4"
    />
    <path
      d="M10,40 L25,10 L50,30 L75,10 L90,40 C90,80 75,95 50,95 C25,95 10,80 10,40 Z"
      fill="none"
      stroke={color}
      strokeWidth="6"
    />
    <path d="M30,45 Q35,35 40,45 Q35,55 30,45 Z" fill={color} />
    <path d="M60,45 Q65,35 70,45 Q65,55 60,45 Z" fill={color} />
    <path
      d="M35,65 Q50,75 65,65"
      fill="none"
      stroke={color}
      strokeWidth="6"
      strokeLinecap="round"
    />
  </svg>
);

// ─── VolumeOn / VolumeOff ──────────────────────────────────────────────────────
function VolumeOnIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ display: 'block' }}>
      <polygon points="1,5 4,5 7,2 7,12 4,9 1,9" fill={color} />
      <path d="M9 4.5 Q11 7 9 9.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M10.5 2.5 Q13.5 7 10.5 11.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function VolumeOffIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" style={{ display: 'block' }}>
      <polygon points="1,5 4,5 7,2 7,12 4,9 1,9" fill={color} />
      <line x1="9" y1="4" x2="13" y2="10" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="13" y1="4" x2="9" y2="10" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

// ─── MicIcon ───────────────────────────────────────────────────────────────────
function MicIcon({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" style={{ display: 'block' }}>
      <rect x="5" y="1" width="6" height="9" rx="3" fill={color} />
      <path d="M2 8 Q2 13 8 13 Q14 13 14 8" stroke={color} strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <line x1="8" y1="13" x2="8" y2="15" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="5" y1="15" x2="11" y2="15" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

// ─── Simple markdown renderer ──────────────────────────────────────────────────
function SimpleMarkdown({ text, color }) {
  if (!text) return null
  return (
    <div>
      {text.split('\n').map((line, i) => {
        if (!line.trim()) return <br key={i} />
        // Bold: **text**
        const parts = line.split(/(\*\*[^*]+\*\*)/)
        return (
          <p key={i} style={{ margin: '0 0 6px 0' }}>
            {parts.map((part, j) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={j} style={{ fontWeight: 'bold', filter: 'brightness(1.4)' }}>{part.slice(2, -2)}</strong>
              }
              return part
            })}
          </p>
        )
      })}
    </div>
  )
}

// ─── Quick question buttons ────────────────────────────────────────────────────
const QUICK_QUESTIONS = [
  '這個網站技術與功能？',
  'Wayne 會什麼技術？',
  '我想看 Wayne 的自傳',
  '目前有什麼專利/專案？',
]

// ─── Main component ────────────────────────────────────────────────────────────
export default function AIAssistant() {
  const ACCENT = 'var(--accent, #d4f029)'
  const ACCENT_HEX = '#d4f029'

  const [isMinimized, setIsMinimized] = useState(true)
  const [inputText, setInputText] = useState('')
  const [wobotMode, setWobotMode] = useState('normal') // 'normal' | 'roast' | 'praise'
  const [isListeningSTT, setIsListeningSTT] = useState(false)
  const [autoRead, setAutoRead] = useState(true)
  const [wobotFace, setWobotFace] = useState('normal') // 'normal' | 'happy' | 'sad'
  const [isAiTyping, setIsAiTyping] = useState(false)
  const [chatHistory, setChatHistory] = useState([
    {
      role: 'ai',
      content: '喵～你好！我是 Wayne 的專屬助理 \n你可以點擊下方快捷鍵，或直接輸入問題問我！',
      showButtons: true,
    },
  ])

  const messagesEndRef = useRef(null)
  const modalRef = useRef(null)
  const dragRef = useRef({
    isDragging: false,
    wasDragged: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
  })
  const posRef = useRef({ x: 0, y: 0 })
  const recognitionRef = useRef(null)
  const silenceTimerRef = useRef(null)
  const originalInputRef = useRef('')
  const audioRef = useRef(null)

  // ── Drag ──────────────────────────────────────────────────────────────────────
  const handlePointerDown = (e) => {
    if (e.touches) {
      if (e.cancelable) e.preventDefault()
    }
    document.body.style.userSelect = 'none'
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    dragRef.current = {
      isDragging: true,
      wasDragged: false,
      startX: clientX,
      startY: clientY,
      lastX: posRef.current.x,
      lastY: posRef.current.y,
    }
  }

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!dragRef.current.isDragging) return
      dragRef.current.wasDragged = true
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      const dx = clientX - dragRef.current.startX
      const dy = clientY - dragRef.current.startY

      const winW = window.innerWidth
      const winH = window.innerHeight
      const modalWidth = isMinimized ? 60 : 320
      const modalHeight = isMinimized ? 60 : 450

      let newX = dragRef.current.lastX + dx
      let newY = dragRef.current.lastY + dy

      if (newX > 20) newX = 20
      if (newX < -(winW - modalWidth - 20)) newX = -(winW - modalWidth - 20)
      if (newY > 20) newY = 20
      if (newY < -(winH - modalHeight - 20)) newY = -(winH - modalHeight - 20)

      posRef.current = { x: newX, y: newY }
      if (e.cancelable) e.preventDefault()

      if (modalRef.current) {
        modalRef.current.style.translate = `${posRef.current.x}px ${posRef.current.y}px`
      }
    }

    const handleMouseUp = () => {
      if (dragRef.current.isDragging) {
        dragRef.current.isDragging = false
        document.body.style.userSelect = 'auto'
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('touchmove', handleMouseMove, { passive: false })
    document.addEventListener('touchend', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('touchmove', handleMouseMove)
      document.removeEventListener('touchend', handleMouseUp)
      document.body.style.userSelect = 'auto'
    }
  }, [isMinimized])

  // Auto-scroll logic
  // 記錄上一次對話紀錄長度，用來判斷是否滾動
  const prevHistoryLenRef = useRef(0)
  useEffect(() => {
    const chatBox = messagesEndRef.current?.parentNode
    if (!chatBox) return
    
    // 判斷是否為新訊息進入（長度變大）
    const isNewMessage = chatHistory.length > prevHistoryLenRef.current
    prevHistoryLenRef.current = chatHistory.length

    // 如果是新訊息進入（例如剛按發送），或是原本就在底部，則強制置底
    const isAtBottom = chatBox.scrollHeight - chatBox.scrollTop <= chatBox.clientHeight + 100
    
    if (isNewMessage || isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatHistory])

  // STT setup
  useEffect(() => {
    if (typeof window === 'undefined') return
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    const rec = new SpeechRecognition()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'zh-TW'

    const resetSilenceTimer = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => {
        rec.stop()
        setIsListeningSTT(false)
      }, 3000)
    }

    rec.onstart = () => resetSilenceTimer()

    rec.onresult = (event) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      setInputText(originalInputRef.current + transcript)
      resetSilenceTimer()
    }

    rec.onerror = () => {
      setIsListeningSTT(false)
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    }

    rec.onend = () => {
      setIsListeningSTT(false)
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    }

    recognitionRef.current = rec

    return () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    }
  }, [])

  // TTS Functionality
  const speakText = async (text) => {
    if (!autoRead || typeof window === 'undefined') return
    
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }

    let cleanText = text.replace(/\[img:.*?\]/g, '')
    if (cleanText.includes('你可以點擊下方快捷鍵')) cleanText = '你好！我是 Wayne 的專屬助理'

    return new Promise(async (resolve) => {
      try {
        const res = await fetch(`${API_URL}/ai/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: cleanText, voice: 'zh-CN-XiaoxiaoNeural' })
        })
        
        if (!res.ok) throw new Error('Edge TTS API error')
        
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio
        
        audio.onplay = () => resolve(audio.duration || 0)
        audio.onended = () => URL.revokeObjectURL(url)
        audio.onerror = () => resolve(0)

        audio.play().catch(e => {
          console.warn('Audio auto-play prevented:', e)
          resolve(0)
        })
      } catch (err) {
        console.error('Edge TTS streaming failed:', err)
        resolve(0)
      }
    })
  }

  // Speech-to-Text Toggle
  const toggleListeningSTT = () => {
    if (!recognitionRef.current) {
      alert('抱歉，您的瀏覽器不支援 Web Speech API 語音辨識功能。')
      return
    }
    if (isListeningSTT) {
      recognitionRef.current.stop()
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      setIsListeningSTT(false)
    } else {
      originalInputRef.current = inputText
      try {
        recognitionRef.current.start()
        setIsListeningSTT(true)
      } catch (e) {}
    }
  }

  // ── Send / Ask ────────────────────────────────────────────────────────────────
  const handleAsk = async (questionOverride) => {
    // Interrupt current actions
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    setIsAiTyping(false) // 停止舊的打字動畫節奏

    const q = typeof questionOverride === 'string' ? questionOverride : inputText.trim()
    if (!q) return

    setChatHistory((prev) => [
      ...prev.map((msg) => ({ ...msg, showButtons: false })),
      { role: 'user', content: q },
    ])
    setInputText('')

    if (isListeningSTT) {
      recognitionRef.current?.stop()
      setIsListeningSTT(false)
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    }

    // Placeholder while fetching
    setChatHistory((prev) => [
      ...prev,
      { role: 'ai', content: 'Wobot 正在思考...', showButtons: false },
    ])

    try {
      // History construction for AI
      const apiHistory = chatHistory
        .filter(m => m.content && !m.content.includes('Wobot 正在思考') && !m.content.includes('你可以點擊下方快捷鍵'))
        .slice(-6)
        .map(m => ({ role: m.role === 'ai' ? 'model' : 'user', parts: [{ text: m.content }] }))
      // Gemini requires history to start with a user turn
      while (apiHistory.length > 0 && apiHistory[0].role === 'model') apiHistory.shift()

      const res = await fetch(`${API_URL}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, mode: wobotMode, history: apiHistory }),
      })

      const data = await res.json()
      const fullText = data.reply || '大腦伺服器發呆中，請再試一次！'

      // Reset placeholder to empty, ready for typing animation
      setChatHistory((prev) => {
        const next = [...prev]
        next[next.length - 1] = { role: 'ai', content: '', showButtons: false }
        return next
      })

      // 打字動畫，intervalMs 由外部決定以便與音訊同步
      const startTyping = (intervalMs = 30) => {
        setIsAiTyping(true)
        let currentIndex = 0
        let currentText = ''
        const typingTimer = setInterval(() => {
          if (currentIndex < fullText.length) {
            const char = fullText.charAt(currentIndex)
            currentText += char
            setChatHistory((prev) => {
              const next = [...prev]
              next[next.length - 1] = { role: 'ai', content: currentText, showButtons: false }
              return next
            })
            if (['喵','！','~'].includes(char)) {
              setWobotFace('happy'); setTimeout(() => setWobotFace('normal'), 1200)
            }
            currentIndex++
          } else {
            clearInterval(typingTimer)
            setIsAiTyping(false)
            setChatHistory(prev => {
              const next = [...prev]; next[next.length-1].showButtons = res.ok; return next
            })
          }
        }, intervalMs)
      }

      // 🚀 執行同步啟動計畫：先播音成功 -> 立即打字 (加上 0.85x 超頻文字速度滿足快感)
      if (autoRead && data.audio) {
        const audio = new Audio("data:audio/mpeg;base64," + data.audio)
        audioRef.current = audio
        
        audio.play()
          .then(() => {
            // 計算間隔：利用 0.85 係數讓文字稍微領先語音一點點，達成「語速快」與「絕對起始同步」
            const durationMs = (audio.duration && audio.duration > 0) ? audio.duration * 1000 : fullText.length * 150
            const intervalMs = Math.min(200, Math.max(25, Math.floor((durationMs * 0.85) / (fullText.length || 1))))
            startTyping(intervalMs)
          })
          .catch(e => {
            console.warn('Audio play failed, fixed speed:', e)
            startTyping(35)
          })
      } else if (autoRead) {
        // 沒有隨包發送時，手動呼叫後端 TTS (找回曉曉)
        setIsAiTyping(true)
        speakText(fullText)
          .then((duration) => {
            const durationMs = (duration && duration > 0) ? duration * 1000 : fullText.length * 150
            const intervalMs = Math.min(200, Math.max(25, Math.floor((durationMs * 0.85) / (fullText.length || 1))))
            startTyping(intervalMs)
          })
          .catch(() => startTyping(35))
      } else {
        startTyping(35)
      }
    } catch (err) {
      console.error('API Error:', err)
      const errorMsg = '喵... 連線失敗，Wobot 暫時無法連接到大腦伺服器！'
      setWobotFace('sad')
      setTimeout(() => setWobotFace('normal'), 3000)
      // 用打字動畫顯示錯誤訊息
      setChatHistory((prev) => {
        const next = [...prev]
        next[next.length - 1] = { role: 'ai', content: '', showButtons: false }
        return next
      })
      let i = 0
      setIsAiTyping(true)
      const errTimer = setInterval(() => {
        if (i < errorMsg.length) {
          i++
          setChatHistory(prev => {
            const next = [...prev]
            next[next.length - 1] = { role: 'ai', content: errorMsg.slice(0, i), showButtons: false }
            return next
          })
        } else {
          clearInterval(errTimer)
          setIsAiTyping(false)
          setChatHistory(prev => { const n = [...prev]; n[n.length - 1].showButtons = true; return n })
          speakText(errorMsg)
        }
      }, 35)
    }
  }

  const handleOpen = () => {
    if (!dragRef.current.wasDragged) setIsMinimized(false)
  }

  // ── Mode button helper ────────────────────────────────────────────────────────
  const modeBtn = (mode, label, Icon, activeColor) => {
    const isActive = wobotMode === mode
    return (
      <button
        key={mode}
        onClick={(e) => { e.stopPropagation(); setWobotMode(mode) }}
        style={{
          flex: 1,
          background: isActive ? activeColor : 'rgba(0,0,0,0.8)',
          color: isActive ? '#000' : activeColor,
          border: `1px solid ${activeColor}`,
          padding: '7px 2px',
          fontSize: '11px',
          borderRadius: '4px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '4px',
          whiteSpace: 'nowrap',
          fontFamily: 'inherit',
          transition: 'background 0.2s, color 0.2s',
        }}
      >
        <Icon color={isActive ? '#000' : activeColor} />
        {label}
      </button>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes portal-breathe {
          0%   { opacity: 0.85; transform: scale(1); }
          100% { opacity: 1;    transform: scale(1.05); }
        }
        @keyframes wobotBlink {
          0%   { opacity: 1; r: 2.5; }
          100% { opacity: 0.2; r: 1.5; }
        }
        @keyframes wobotMouth {
          0%   { ry: 1; }
          100% { ry: 2.8; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes panelIn {
          from { opacity: 0; transform: translateY(10px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        .wobot-msgs::-webkit-scrollbar { width: 3px; }
        .wobot-msgs::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
        .wobot-mode-btn:hover { filter: brightness(1.15); }
        .wobot-quick-btn:hover { filter: brightness(1.2); }
      `}</style>

      <div
        ref={modalRef}
        style={{
          touchAction: isMinimized ? 'none' : 'auto',
          position: 'fixed',
          right: '20px',
          bottom: '20px',
          zIndex: 999999,
          width: isMinimized ? '60px' : '320px',
          height: isMinimized ? '60px' : '450px',
          maxWidth: isMinimized ? '60px' : 'calc(100vw - 40px)',
          maxHeight: isMinimized ? '60px' : 'calc(100dvh - 100px)',
          background: isMinimized ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.92)',
          border: `2px solid ${ACCENT_HEX}`,
          borderRadius: isMinimized ? '50%' : '10px',
          boxShadow: isMinimized
            ? `0 0 15px ${ACCENT_HEX}`
            : `0 0 20px rgba(0,0,0,0.8), 0 0 10px ${ACCENT_HEX}`,
          display: 'flex',
          flexDirection: 'column',
          backdropFilter: 'blur(5px)',
          cursor: isMinimized ? 'pointer' : 'default',
          animation: isMinimized ? 'portal-breathe 2s infinite alternate' : 'none',
          transition: 'width 0.3s ease, height 0.3s ease, border-radius 0.3s ease, background 0.3s ease',
          overflow: 'hidden',
        }}
        onMouseDown={isMinimized ? handlePointerDown : undefined}
        onTouchStart={isMinimized ? handlePointerDown : undefined}
        onClick={isMinimized ? handleOpen : undefined}
      >
        {isMinimized ? (
          /* ── Minimized FAB ── */
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <WobotSVG color={ACCENT_HEX} size={36} face={wobotFace} isTalking={isAiTyping} />
          </div>
        ) : (
          /* ── Expanded Panel ── */
          <>
            {/* Header */}
            <div
              onMouseDown={handlePointerDown}
              onTouchStart={handlePointerDown}
              style={{
                background: 'rgba(255,255,255,0.05)',
                borderBottom: `1px solid ${ACCENT_HEX}`,
                padding: '10px 12px',
                cursor: 'grab',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                userSelect: 'none',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <WobotSVG color={ACCENT_HEX} size={22} face={wobotFace} isTalking={isAiTyping} />
                <span style={{ color: ACCENT, fontWeight: 'bold', fontSize: '13px', letterSpacing: '0.05em' }}>
                  Wobot
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {/* Volume toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    const next = !autoRead
                    setAutoRead(next)
                    if (!next) {
                      if (typeof window !== 'undefined' && window.speechSynthesis) {
                        window.speechSynthesis.cancel()
                      }
                      if (audioRef.current) {
                        audioRef.current.pause()
                      }
                    }
                  }}
                  title={autoRead ? '關閉自動朗讀' : '開啟自動朗讀'}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: autoRead ? ACCENT_HEX : '#555',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    fontSize: '11px',
                    transition: '0.2s',
                    padding: '2px',
                  }}
                >
                  {autoRead
                    ? <VolumeOnIcon color={ACCENT_HEX} />
                    : <VolumeOffIcon color="#555" />}
                  <span>{autoRead ? 'ON' : 'OFF'}</span>
                </button>

                {/* Minimize */}
                <button
                  onClick={(e) => { e.stopPropagation(); setIsMinimized(true) }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: ACCENT,
                    cursor: 'pointer',
                    fontSize: '16px',
                    lineHeight: 1,
                    padding: '2px 4px',
                  }}
                >
                  ─
                </button>
              </div>
            </div>

            {/* Messages */}
            <div
              className="wobot-msgs"
              data-lenis-prevent
              style={{
                flex: 1,
                padding: '10px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              {chatHistory.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'flex-start',
                    maxWidth: '88%',
                  }}
                >
                  {/* AI avatar */}
                  {msg.role === 'ai' && (
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: 'rgba(0,0,0,0.5)',
                        border: `1px solid ${ACCENT_HEX}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: `0 0 8px ${ACCENT_HEX}44`,
                        flexShrink: 0,
                        marginTop: '2px',
                      }}
                    >
                      <WobotSVG color={ACCENT_HEX} size={18} face={wobotFace} isTalking={isAiTyping} />
                    </div>
                  )}

                  {/* Message bubble */}
                  <div
                    style={{
                      flex: 1,
                      background: msg.role === 'user' ? 'rgba(255,255,255,0.08)' : 'transparent',
                      border: `1px solid ${msg.role === 'user' ? '#555' : ACCENT_HEX}`,
                      color: msg.role === 'user' ? '#fff' : ACCENT,
                      padding: '9px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      lineHeight: '1.65',
                      wordBreak: 'break-word',
                    }}
                  >
                    <SimpleMarkdown text={msg.content} color={ACCENT} />

                    {/* Typing cursor */}
                    {msg.role === 'ai' && idx === chatHistory.length - 1 && isAiTyping && (
                      <span
                        style={{
                          display: 'inline-block',
                          width: '7px',
                          height: '12px',
                          background: ACCENT_HEX,
                          marginLeft: '4px',
                          verticalAlign: 'middle',
                          animation: 'blink 0.8s infinite',
                        }}
                      />
                    )}

                    {/* Quick question buttons */}
                    {msg.showButtons && (
                      <div
                        style={{
                          marginTop: '10px',
                          paddingTop: '10px',
                          borderTop: `1px dashed ${ACCENT_HEX}`,
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: '6px',
                        }}
                      >
                        {QUICK_QUESTIONS.map((q, i) => (
                          <button
                            key={i}
                            className="wobot-quick-btn"
                            onClick={(e) => { e.stopPropagation(); handleAsk(q) }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.background = ACCENT_HEX
                              e.currentTarget.style.color = '#000'
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.background = 'rgba(0,0,0,0.5)'
                              e.currentTarget.style.color = ACCENT_HEX
                            }}
                            style={{
                              background: 'rgba(0,0,0,0.5)',
                              border: `1px solid ${ACCENT_HEX}`,
                              color: ACCENT_HEX,
                              fontSize: '11px',
                              padding: '5px 10px',
                              borderRadius: '14px',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              fontFamily: 'inherit',
                            }}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Mode buttons */}
            <div
              style={{
                display: 'flex',
                gap: '5px',
                padding: '0 10px 8px 10px',
                flexShrink: 0,
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', paddingTop: '4px', scrollbarWidth: 'none' }}>
                {modeBtn('normal', '正常模式', WobotNormalIcon, ACCENT_HEX)}
                {modeBtn('roast', '毒舌模式', WobotRoastIcon, '#e024c5')}
                {modeBtn('praise', '吹捧模式', WobotPraiseIcon, '#ffbb00')}
              </div>
            </div>

            {/* Input area */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                padding: '8px 10px 10px 10px',
                borderTop: `1px solid ${ACCENT_HEX}`,
                background: 'rgba(0,0,0,0.5)',
                alignItems: 'center',
                flexShrink: 0,
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleAsk()}
                placeholder={isListeningSTT ? '請說話 (3秒靜音自動送出)...' : '輸入問題...'}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  outline: 'none',
                  fontSize: '12px',
                  fontFamily: 'inherit',
                }}
              />

              {/* Mic button */}
              <button
                onClick={(e) => { e.stopPropagation(); toggleListeningSTT() }}
                title={isListeningSTT ? '點擊停止' : '語音辨識'}
                onMouseOver={(e) => { if (!isListeningSTT) e.currentTarget.style.color = ACCENT_HEX }}
                onMouseOut={(e)  => { if (!isListeningSTT) e.currentTarget.style.color = '#555' }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: isListeningSTT ? ACCENT_HEX : '#555',
                  cursor: 'pointer',
                  padding: '0',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'color 0.2s',
                  animation: isListeningSTT ? 'portal-breathe 1s infinite alternate' : 'none',
                  flexShrink: 0,
                }}
              >
                <MicIcon color="currentColor" />
              </button>

              {/* Send button */}
              <button
                onClick={(e) => { e.stopPropagation(); handleAsk() }}
                disabled={isAiTyping || !inputText.trim()}
                style={{
                  background: ACCENT,
                  color: 'var(--bg, #000)',
                  border: 'none',
                  padding: '7px 14px',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '700',
                  fontFamily: 'inherit',
                  opacity: isAiTyping || !inputText.trim() ? 0.4 : 1,
                  transition: 'opacity 0.2s',
                  flexShrink: 0,
                }}
              >
                發送
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
