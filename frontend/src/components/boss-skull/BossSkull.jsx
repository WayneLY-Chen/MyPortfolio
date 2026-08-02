import { useEffect, useRef, useState } from 'react'
import { Renderer, Program, Mesh, Triangle } from 'ogl'
import { cn } from '../../lib/utils'

// 全站唯一一處 from 'ogl' 的 import。
// 多一處靜態 import,ogl 就會被拉回主 chunk,FunPage 那邊的 lazy() 就白做了。

// ── 算力預算 ──
// 手機發熱與耗電是這個站的硬性約束,所以填充率必須被鎖死,
// 不能讓 4K 螢幕 x devicePixelRatio 3 去算一張 960x960 的 raymarch。
const MAX_BACKING = 640 // backing store 硬上限(px)
const MAX_CSS = 320     // CSS 盒上限(px);比原本 140px 的 emoji 明顯放大
const MAX_STEPS = 48    // raymarch 步數上限

const VERT = /* glsl */ `
  attribute vec2 uv;
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`

// GLSL ES 1.00。WebGL2 context 也吃這個版本,所以 webgl2 / webgl 兩條路共用同一份原始碼。
const FRAG = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec2 uResolution;
  varying vec2 vUv;

  // Task 3 會把這顆橢球雕成骷髏(下顎、眼窩、鼻腔、牙列、顴骨)。
  // 現在先留顱骨的雛形 —— 一顆略微前後壓扁的橢球。
  // 造型換掉的時候,底下的 normal / 打光 / raymarch 迴圈一行都不用動。
  float sdSkull(vec3 p) {
    vec3 q = p / vec3(1.0, 1.15, 0.90);
    return (length(q) - 1.0) * 0.90;
  }

  // 中央差分梯度求法線 —— 眼窩與鼻腔的深度感之後就是靠這個出來的。
  vec3 calcNormal(vec3 p) {
    vec2 e = vec2(0.0015, 0.0);
    return normalize(vec3(
      sdSkull(p + e.xyy) - sdSkull(p - e.xyy),
      sdSkull(p + e.yxy) - sdSkull(p - e.yxy),
      sdSkull(p + e.yyx) - sdSkull(p - e.yyx)
    ));
  }

  void main() {
    // uv 轉成 -1..1 的方形座標(canvas 本來就是 1:1,這裡仍除以短邊保平安)
    vec2 p = (vUv * 2.0 - 1.0) * (uResolution / min(uResolution.x, uResolution.y));

    // 相機固定在 z 軸 2.6 處看向原點,由 uTime 驅動 ±12 度的緩慢左右擺動,
    // 讓它讀得出來是立體的,而不是一張貼圖。
    float a = radians(12.0) * sin(uTime * 0.45);
    float ca = cos(a), sa = sin(a);
    mat3 yaw = mat3(ca, 0.0, -sa, 0.0, 1.0, 0.0, sa, 0.0, ca);

    vec3 ro = yaw * vec3(0.0, 0.0, 2.6);
    vec3 rd = normalize(yaw * vec3(p, -1.5));

    float t = 0.0;
    float hit = 0.0;
    int steps = 0;
    for (int i = 0; i < ${MAX_STEPS}; i++) {
      vec3 pos = ro + rd * t;
      float d = sdSkull(pos);
      if (d < 0.0015) { hit = 1.0; break; }
      t += d;
      steps = i;
      if (t > 6.0) break;
    }

    if (hit < 0.5) {
      // 背景保持全透明,讓卡片本身的漸層透出來
      gl_FragColor = vec4(0.0);
      return;
    }

    vec3 pos = ro + rd * t;
    vec3 n = calcNormal(pos);
    vec3 v = -rd;

    // 步進次數近似的環境遮蔽:凹處要走比較多步,自然就比較暗。
    float ao = 1.0 - float(steps) / float(${MAX_STEPS}) * 0.85;
    ao = clamp(ao, 0.35, 1.0);

    // 主光:暖金色方向光,與卡片既有的 #C8942A 主題一致
    vec3 keyDir = normalize(vec3(0.55, 0.75, 0.65));
    vec3 keyCol = vec3(0.784, 0.580, 0.165);
    float diff = max(dot(n, keyDir), 0.0);
    float spec = pow(max(dot(reflect(-keyDir, n), v), 0.0), 24.0);

    // 骨頭本體用偏暖的米白。整顆染成金色的話邊光讀不出來,造型會糊成一團。
    vec3 bone = vec3(0.90, 0.87, 0.80);

    // 冷色 fresnel 邊光,把輪廓從深色背景上提出來
    float fres = pow(1.0 - max(dot(n, v), 0.0), 2.5);
    vec3 rim = vec3(0.42, 0.55, 0.78) * fres * 0.9;

    vec3 col = bone * (0.16 + 0.95 * diff) * ao;
    col += keyCol * spec * 0.55;
    col += rim;

    gl_FragColor = vec4(col, 1.0);
  }
`

export default function BossSkull({ anim, children }) {
  const canvasRef = useRef(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (failed) return
    const canvas = canvasRef.current
    if (!canvas) return

    // ─────────────────────────────────────────────────────────────
    // WebGL 生命週期。這一整塊就是 PROJECT.md 幾條硬性約束的兌現處:
    //   1. reduced-motion 只算一幀        —— 無障礙,同時也是省電的正解
    //   2. 分頁隱藏 / 捲出視野就停 rAF     —— 手機發熱與耗電
    //   3. WebGL 拿不到就降級回 emoji      —— 絕不留一塊空白卡片
    //   4. 卸載時主動釋放 context          —— 瀏覽器對同時存活的 context 數量有上限,
    //                                        反覆進出遊戲會撞到
    // 刻意不抽成 hook:目前只有一個呼叫端,抽象化的時機還沒到。
    // Phase 6 的音樂視覺化會複用同一組規則,那時才有第二個呼叫端。
    // ─────────────────────────────────────────────────────────────

    // repo 既有慣用法:typeof window 護欄 + 一次性讀取,不訂閱變更。
    // 見 Footer.jsx:5、TypingRace.jsx:94-96、DevToolsTab.jsx:65。
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let renderer, gl, program, mesh
    try {
      renderer = new Renderer({
        canvas,
        alpha: true,
        antialias: false,
        depth: false,
        powerPreference: 'low-power',
      })
      gl = renderer.gl
      if (!gl) throw new Error('WebGL context 為 null')

      // ⚠ OGL 的 Renderer constructor 內部就會呼叫一次 setSize(width, height),
      // 預設值是 300x150,而 setSize 會把尺寸以 px 寫進 canvas 的 inline style。
      // 也就是說,建構完的當下 canvas 已經被蓋成
      //   `width: 300px; height: 150px`
      // —— 我們宣告的 width: 100% 被吃掉,而且多了一個明確的 height,
      // 讓 aspect-ratio: 1/1 完全失效(aspect-ratio 只在 height: auto 時才生效)。
      // 結果就是 300x300 的畫面被壓進 300x150 的盒子裡,骷髏被垂直壓扁一半。
      // 這裡把兩個值還原回我們自己的宣告;之後的尺寸一律由底下的 resize()
      // 直接操作 canvas.width/height 與 renderer.width/height,不再經過 setSize。
      canvas.style.width = '100%'
      canvas.style.height = 'auto'
      renderer.dpr = 1
      gl.clearColor(0, 0, 0, 0)

      program = new Program(gl, {
        vertex: VERT,
        fragment: FRAG,
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: [1, 1] },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
      })
      mesh = new Mesh(gl, { geometry: new Triangle(gl), program })
    } catch (err) {
      console.warn('[BossSkull] WebGL 初始化失敗,降級回 emoji:', err?.message || err)
      setFailed(true)
      return
    }

    let rafId = null
    let inView = true
    let observer = null
    const startedAt = performance.now()

    const resize = () => {
      const cssW = Math.max(1, Math.round(canvas.clientWidth || MAX_CSS))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const px = Math.max(1, Math.min(MAX_BACKING, Math.round(cssW * dpr)))
      if (canvas.width !== px || canvas.height !== px) {
        canvas.width = px
        canvas.height = px
      }
      renderer.width = px
      renderer.height = px
      program.uniforms.uResolution.value = [px, px]
    }

    const draw = (elapsedMs) => {
      program.uniforms.uTime.value = elapsedMs / 1000
      renderer.render({ scene: mesh })
    }

    const tick = (now) => {
      rafId = requestAnimationFrame(tick)
      draw(now - startedAt)
    }

    const shouldRun = () => !prefersReducedMotion && !document.hidden && inView

    const start = () => {
      if (rafId === null && shouldRun()) rafId = requestAnimationFrame(tick)
    }
    const stop = () => {
      // 停掉 rAF 之後畫面會保留最後一幀(合成器持有已呈現的畫格),
      // 所以停下來不會變成空白。
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
    }

    resize()
    if (prefersReducedMotion) {
      // 只算一幀就停:骷髏靜止但看得見。
      draw(0)
    } else {
      start()
    }

    // reduced-motion 只算一幀,之後就完全不再進 rAF。但 alpha/preserveDrawingBuffer
    // 為 false 的 drawing buffer 在分頁還原、尺寸變動這類時機可能已經被丟掉,
    // 沒有第二幀去補的話,骷髏會永久變成一塊空白 —— 那正是 FEAT-26 要擋的情況。
    // 所以「重新露出來」時補畫一幀。仍然是靜止的:它不會啟動任何迴圈。
    const redrawStill = () => draw(0)

    const onResize = () => {
      resize()
      if (!shouldRun()) redrawStill()
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else if (prefersReducedMotion) redrawStill()
      else start()
    }
    const onContextLost = (e) => {
      e.preventDefault()
      stop()
      console.warn('[BossSkull] WebGL context lost,降級回 emoji')
      setFailed(true)
    }

    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)
    canvas.addEventListener('webglcontextlost', onContextLost)

    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          inView = entries[entries.length - 1].isIntersecting
          if (!inView) stop()
          else if (prefersReducedMotion) redrawStill()
          else start()
        },
        { threshold: 0 }
      )
      observer.observe(canvas)
    }

    return () => {
      stop()
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      if (observer) observer.disconnect()
      const lose = gl.getExtension('WEBGL_lose_context')
      if (lose) lose.loseContext()
    }
  }, [failed])

  // WebGL 不可用 / context lost → 直接回傳降級內容(FunPage 傳進來的 emoji)。
  // 絕不留一塊空白卡片。
  if (failed) return children

  return (
    <div
      className={cn(`boss-${anim}`)}
      style={{
        marginBottom: '24px',
        // 沿用原本 emoji 的金色外光暈。三組既有 keyframes 裡的 filter
        // (被打的 brightness(3)、攻擊的綠色 drop-shadow)在動畫期間會蓋過這一行,
        // 這正是想要的行為 —— 那兩個狀態完全不用改任何程式碼就繼續生效。
        filter: 'drop-shadow(0 0 30px rgba(200, 148, 42, 0.3))',
      }}
    >
      <canvas
        ref={canvasRef}
        aria-label="骷髏王"
        role="img"
        style={{
          display: 'block',
          width: '100%',
          maxWidth: `${MAX_CSS}px`,
          aspectRatio: '1 / 1',
          margin: '0 auto',
        }}
      />
    </div>
  )
}
