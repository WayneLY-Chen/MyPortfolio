// 工具箱共用便利互動元件(D-10 / D-11 / D-12)—— 複製 / 貼上 / 清空 / 載入範例。
// 七個工具一律複用這裡的具名 export,不得各自再寫一份(04-PATTERNS.md Anti-Pattern #2:
// Projects.jsx 與 Blog.jsx 的 CopyButton 就是各存一份的重複實作)。
//
// 【刻意偏離既有慣例,請勿「修回去」】
// 本 repo 既有的兩處複製(Projects.jsx:31、Blog.jsx:30)只做本地 icon 切換、從不通知使用者,
// 失敗時也只寫 console。D-10 明文要求複用 Toast,因此這裡的 CopyButton 同時做兩件事:
// icon 切換(即時、就地)+ Toast(跨視窗確認,手機上輸出區可能已捲出畫面)。失敗一律跳 Toast,
// 不得靜默。
//
// 【貼上按鈕的規則與複製相反,兩者不可混淆】
// D-12 要求「靜默降級」:偵測不到剪貼簿讀取能力時整顆不渲染,失敗時也絕不跳錯誤 Toast。
//
// 樣式定義在 DevToolsTab.jsx 的 scoped <style> 內(全工具箱共用一份樣式表)。
import { useEffect, useRef, useState } from 'react'
import { Check, Clipboard, Copy, Eraser, Sparkles } from 'lucide-react'
import { useToast } from '../ui/Toast'

// 圖示切換還原時間。刻意短於 Toast 的 4000ms 預設 —— icon 已經給了即時回饋,
// 複製這種動作不需要長駐提示(對應 Toast duration 2000)。
const ICON_REVERT_MS = 1200

/**
 * D-10:一鍵複製。
 * compact 為 true 時渲染 icon-only 變體(供 UUID 列、雜湊列這類重複列使用),
 * 此時 label 必須說明「複製的是什麼」,不得是裸的「複製」,否則螢幕閱讀器只會念到
 * 一串一模一樣的無名按鈕。
 */
export function CopyButton({ text, label = '複製', compact = false }) {
  const { addToast } = useToast()
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), ICON_REVERT_MS)
      addToast({ title: '已複製', variant: 'success', duration: 2000 })
    } catch {
      // D-10:不得只寫 console 靜默失敗 —— 使用者必須知道要改用手動選取。
      addToast({
        title: '複製失敗',
        description: '請手動選取文字複製',
        variant: 'error',
      })
    }
  }

  return (
    <button
      type="button"
      className={`dt-btn dt-copy-btn ${compact ? 'dt-btn--icon' : ''}`}
      onClick={handleCopy}
      aria-label={label}
      title={label}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {!compact && <span>{label}</span>}
    </button>
  )
}

/**
 * D-10 / D-12:從剪貼簿貼上。
 * 二元存在,不是 disabled 狀態 —— 讀不到剪貼簿能力就整顆不出現在 DOM 裡,
 * 不灰化、不加 tooltip 解釋原因。不用 Permissions API 預查權限(Firefox / Safari
 * 支援不可靠),直接嘗試 + try/catch。
 * Ctrl+V 是 textarea 的原生行為,不需要任何自訂綁定。
 */
export function PasteButton({ onPaste }) {
  const [unavailable, setUnavailable] = useState(false)

  const supported =
    typeof navigator !== 'undefined' &&
    typeof window !== 'undefined' &&
    window.isSecureContext === true &&
    !!navigator.clipboard &&
    typeof navigator.clipboard.readText === 'function'

  if (!supported || unavailable) return null

  const handlePaste = async () => {
    try {
      const value = await navigator.clipboard.readText()
      onPaste(value)
    } catch {
      // D-12:權限被拒或任何例外都靜默處理 —— 不跳 Toast、不寫錯誤訊息,
      // 直接讓這顆按鈕從畫面上消失(與 CopyButton 的失敗處理刻意相反)。
      setUnavailable(true)
    }
  }

  return (
    <button type="button" className="dt-btn dt-paste-btn" onClick={handlePaste}>
      <Clipboard size={14} />
      <span>貼上</span>
    </button>
  )
}

/**
 * D-10:清空輸入。
 * 刻意不做破壞性樣式、不加確認對話框 —— 輸入本來就不落地(D-07),重打即可還原,
 * 加確認步驟會與 D-06 的無摩擦即時運算抵觸。
 */
export function ClearButton({ onClear }) {
  return (
    <button type="button" className="dt-btn dt-clear-btn" onClick={onClear}>
      <Eraser size={14} />
      <span>清空</span>
    </button>
  )
}

/**
 * D-10 / D-11:載入範例。
 * 本階段唯一一顆 primary CTA 樣式的控制項(idle 狀態即吃 accent,其餘三顆只在 hover 才吃)。
 * 在每個工具的按鈕列中排最左 —— 它最可能促成訪客實際動手操作。
 * 點下即填入範例並立即觸發即時運算,無確認步驟。
 */
export function ExampleButton({ onLoad }) {
  return (
    <button type="button" className="dt-btn dt-example-btn" onClick={onLoad}>
      <Sparkles size={14} />
      <span>載入範例</span>
    </button>
  )
}

/** 便利按鈕列容器。載入範例排最左,其餘依工具需要排列。 */
export function ToolActions({ children }) {
  return <div className="dt-actions">{children}</div>
}
