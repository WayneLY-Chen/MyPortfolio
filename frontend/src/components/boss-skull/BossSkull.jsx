import { useEffect, useRef, useState } from 'react'
import { Renderer, Program, Mesh, Triangle } from 'ogl'
import { cn } from '../../lib/utils'

// 全站唯一一處 from 'ogl' 的 import。
// 多一處靜態 import,ogl 就會被拉回主 chunk,FunPage 那邊的 lazy() 就白做了。

// ── 算力預算 ──
// 手機發熱與耗電是這個站的硬性約束,所以填充率必須被鎖死,
// 不能讓 4K 螢幕 x devicePixelRatio 3 去算一張 960x960 的 raymarch。
const MAX_BACKING = 640      // backing store 硬上限(px)
const MAX_CSS_MOBILE = 320   // < 768px 的 CSS 盒上限
const MAX_CSS_DESKTOP = 480  // >= 768px 的 CSS 盒上限
const MAX_STEPS = 48         // raymarch 步數上限

// 為什麼上限要分兩段(而不是一律 480):
// 會發熱、會掉電的是手機,桌機有市電也有真正的散熱。所以填充率的預算只在
// 行動裝置上緊縮,桌機放寬到 480px 讓骷髏在放大後的中央欄裡不會顯得空蕩。
//
// 實際成本(MAX_BACKING 640 仍然是所有情況的硬天花板):
//   手機(< 768px)          320 CSS,完全不變
//   桌機 dpr 1              320 → 480 backing,像素數 +125%
//   桌機 dpr 1.5            480 → 640(觸頂),+78%
//   桌機 dpr 2(Retina)     640 → 640,完全不變(先前就已經在觸頂)
// 也就是說最壞情況的絕對值沒有變高 —— 640x640 本來就到得了,
// 只是非 Retina 桌機從遠低於天花板往天花板靠近。

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
  uniform float uHit;   // 受擊衝量 1→0
  uniform float uAtk;   // 出手衝量 1→0
  uniform vec2 uResolution;
  varying vec2 vUv;

  // ── SDF 基本件 ──
  float sdEllipsoid(vec3 p, vec3 r) {
    float k0 = length(p / r);
    float k1 = length(p / (r * r));
    return k0 * (k0 - 1.0) / k1;
  }
  float sdRoundBox(vec3 p, vec3 b, float r) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
  }
  // 平滑聯集 / 平滑差集。骷髏的各部件不能是硬邊拼起來的,
  // 顱骨接顴骨、顴骨接上顎都要有骨頭該有的圓弧過渡。
  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }
  float smax(float a, float b, float k) {
    float h = clamp(0.5 - 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) + k * h * (1.0 - h);
  }
  // 膠囊(線段 + 半徑)。用來做眉骨脊、顴骨弓與下顎枝這類「沿著一條線長出來」
  // 的隆起 —— 用橢球去湊角度很難瞄準,線段直接給端點就好。
  float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
    vec3 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r;
  }
  // 倒三角柱(頂點朝上、底邊較寬),用來挖鼻腔 —— 梨狀孔就是這個形狀。
  float sdTriPrism(vec3 p, float w, float h, float d) {
    vec2 q = vec2(abs(p.x), p.y);
    vec2 n = normalize(vec2(h, w));
    float tri = max(-q.y, dot(q - vec2(w, 0.0), n));
    vec2 dd = vec2(tri, abs(p.z) - d);
    return min(max(dd.x, dd.y), 0.0) + length(max(dd, 0.0));
  }

  // 兩個眼窩(x 取絕對值 → 左右鏡射)。
  // 單獨拉成一個函式,因為打光時還要用它判斷「這個點在不在眼窩裡」來加餘燼。
  float eyeHole(vec3 p) {
    vec3 q = vec3(abs(p.x), p.y, p.z);
    // 眼窩再挖大挖深一點,並把中心往下移 —— 上緣讓給眉骨去壓,
    // 洞越深、越被眉骨遮住,裡面就越黑。「兇」有一半是靠這兩個洞夠黑。
    return sdEllipsoid(q - vec3(0.30, 0.265, 0.44), vec3(0.228, 0.213, 0.36));
  }

  // ── 骷髏本體 ──
  // 顱骨(圓角方塊,不是橢球)→ 收窄太陽穴 → 眉骨脊 → 顴骨弓 → 上顎
  // → 下顎枝 + 下顎體(連續的 U 形)→ 挖嘴部凹槽 → 填回牙列
  // → 挖眼窩 → 挖鼻腔。
  float sdSkull(vec3 p) {
    // 顱骨:圓角方塊,但用「很小的方塊 + 很大的圓角」。
    // 半徑 0.48 相對於半徑向量 (0.20, 0.24, 0.16) 佔絕大部分,所以整體仍是圓的,
    // 只在顱頂與兩側留下一點點平面感 —— 這樣才不是一顆蛋,也不會變成骰子。
    // (試過 b(0.45,0.47,0.43) r0.24,那個比例會做出一顆真正的方塊,太over。)
    // 收窄 + 拉高:原本 (0.19,0.17,0.13)+0.51 的總半徑是 (0.70,0.68,0.64),
    // 幾乎等寬等高 —— 那個比例讀起來是敦厚,不是壓迫。
    // 改成窄一點、高一點,輪廓才有「顱骨」的縱向感。
    float d = sdRoundBox(p - vec3(0.0, 0.31, 0.0), vec3(0.15, 0.21, 0.13), 0.51);

    vec3 c = vec3(abs(p.x), p.y, p.z);

    // 收窄太陽穴:從兩側斜挖進去,顱骨才不會從頭寬到腳。
    d = smax(d, -sdEllipsoid(c - vec3(0.74, 0.40, 0.00), vec3(0.15, 0.22, 0.32)), 0.14);

    // 眉骨脊:橫過眼窩上緣的隆起。
    // 注意 z 必須貼在顱骨「表面」上(該高度的前緣約 0.60),
    // 一開始放在 z=0.46 的結果是整條脊埋在顱骨裡面、完全看不到。
    // k 取小值,讓它保持是一道「脊」而不是被抹平。
    // 這道脊加上底下的顴骨弓,正是骷髏讀起來是骷髏、而不是光滑卵形的關鍵。
    // 【怒眉】原本內側(靠鼻梁)y=0.50 比外側 y=0.455 高,那是往外下垂的走向,
    // 讀起來是無辜或困惑。真正讓一張臉顯得兇的是相反的走向:眉頭低、眉尾高。
    // 所以把兩端對調,內側壓到 0.435、外側抬到 0.505,並加粗讓它往前罩住眼窩上緣。
    float brow = sdCapsule(c, vec3(0.03, 0.435, 0.60), vec3(0.44, 0.505, 0.44), 0.086);
    d = smin(d, brow, 0.04);

    // 顴骨弓:從鼻腔旁往後上方拉的一道細脊(同樣要貼在表面上)
    float arch = sdCapsule(c, vec3(0.18, 0.00, 0.50), vec3(0.56, 0.13, 0.02), 0.078);
    d = smin(d, arch, 0.042);

    // 顴骨本體:給顴骨弓一塊可以坐上去的量體
    float cheek = sdEllipsoid(c - vec3(0.40, 0.02, 0.20), vec3(0.15, 0.12, 0.24));
    d = smin(d, cheek, 0.16);

    // 上顎
    float maxilla = sdRoundBox(p - vec3(0.0, -0.22, 0.12), vec3(0.29, 0.16, 0.31), 0.09);
    d = smin(d, maxilla, 0.18);

    // 下顎改用兩段膠囊組成的連續 U 形:
    //   下顎枝(ramus)從顴骨後方往下,再由下顎體收到正中的下巴。
    // 先前是一顆獨立的橢球加一顆下巴橢球,兩者跟顱骨之間沒有真正的連接構造,
    // 中間又被嘴部凹槽切過,結果看起來像骷髏嘴裡叼著一顆球。
    // 有了 ramus,silhouette 才會從太陽穴 → 顴骨 → 下顎線 → 下巴一路連續。
    // 半徑要夠粗:第一版 ramus 0.105 / body 0.125 太細,下半臉變成一片薄楔子。
    float ramus = sdCapsule(c, vec3(0.44, 0.04, -0.02), vec3(0.32, -0.36, 0.10), 0.135);
    d = smin(d, ramus, 0.18);
    float jawBody = sdCapsule(c, vec3(0.32, -0.36, 0.10), vec3(0.0, -0.50, 0.26), 0.165);
    d = smin(d, jawBody, 0.18);

    // 嘴部凹槽:先挖一條帶狀凹陷,牙齒等一下填回去,牙縫才讀得出來
    float mouth = sdRoundBox(p - vec3(0.0, -0.44, 0.40), vec3(0.26, 0.075, 0.14), 0.02);
    d = smax(d, -mouth, 0.03);

    // 牙列:沿 x 軸做定義域重複,但每顆牙的寬度與前後位置隨齒序改變 ——
    // 等寬等距會做出一排鋼琴鍵。門牙窄、臼齒寬,並且沿著下顎的弧線往後退。
    float sp = 0.078;
    float xi = floor((p.x + 0.5 * sp) / sp);   // 齒序,0 是正中
    float ai = min(abs(xi), 3.0);
    vec3 t = p;
    t.x = p.x - xi * sp;                        // 保留齒序,才能逐顆調參數
    // 圓角是這裡最要緊的一個數字。sdRoundBox 的半徑若遠小於半徑向尺寸,
    // 每顆牙就是一個**立方體** —— 平面加上高光會把稜角照得清清楚楚,整排讀起來
    // 是棋盤格或玉米,不是牙。真牙的正面是外凸的圓弧,所以這裡把圓角吃掉大半個
    // 牙身:b 縮小、r 放大,總尺寸維持不變(sdRoundBox 的實際半尺寸是 b + r)。
    float tr = 0.014;                           // 圓角半徑,原本 0.008
    float tw = 0.014 + 0.0027 * ai;             // 加上 tr 後總半寬 0.028 → 0.036
    float tz = 0.375 - 0.012 * ai * ai;         // 沿弧線後退
    // 總半寬 0.028 對上 0.078 的齒距 → 牙縫約 0.022,細到讀得出分界又不會變格子
    float tooth = sdRoundBox(t - vec3(0.0, -0.44, tz), vec3(tw, 0.061, 0.051), tr);
    float band = sdRoundBox(p - vec3(0.0, -0.44, 0.35), vec3(0.255, 0.080, 0.115), 0.0);
    float teeth = max(tooth, band);
    // 【不切上下兩排】原本這裡有一條咬合縫把牙列劈成上下兩排。在這個顯示尺寸下
    // 整排牙只有約 90px 寬、每顆約 10px,再橫切一刀就變成 2xN 的棋盤格 ——
    // 實際看起來像玉米或磁磚,不像牙。emoji 💀 之所以讀得出來,也是只畫一排。
    // 所以這裡保留單排齒列,只靠垂直牙縫分顆,不做上下咬合線。
    d = min(d, teeth);

    // 眼窩:挖得夠深,內部才進得了陰影 —— 這是「看起來像骷髏」的關鍵
    d = smax(d, -eyeHole(p), 0.045);

    // 鼻腔
    float nose = sdTriPrism(p - vec3(0.0, -0.11, 0.40), 0.10, 0.25, 0.30);
    d = smax(d, -nose, 0.03);

    return d;
  }

  // 沿法線方向取樣的環境遮蔽。原本用步進次數近似太粗糙,眼窩會亮得像眼球 ——
  // 而骷髏之所以讀得出來是骷髏,關鍵就在眼窩與鼻腔必須是暗的。
  // 5 個取樣點,相對於 48 步的 raymarch 只是很小的加項。
  float calcAO(vec3 p, vec3 n) {
    float occ = 0.0;
    float sca = 1.0;
    for (int i = 0; i < 5; i++) {
      float h = 0.02 + 0.13 * float(i) / 4.0;
      float d = sdSkull(p + n * h);
      occ += (h - d) * sca;
      sca *= 0.82;
    }
    return clamp(1.0 - 1.9 * occ, 0.0, 1.0);
  }

  // 中央差分梯度求法線 —— 眼窩與鼻腔的深度感就是靠這個出來的。
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

    // 【受擊:真的把頭打歪】外層的 CSS 只能把整張畫布平移,那讀起來是
    // 「圖被搖了一下」。這裡讓相機繞著骷髏多轉一個角度,等效於頭被打得偏過去,
    // 而且因為是 3D,偏過去的同時受光面、眼窩的陰影都會跟著變 —— 那才是逼真的來源。
    // 用 sin 的衰減振盪(而不是單調回正)做出被打中之後晃兩下的餘韻。
    float hitOsc = uHit * uHit * sin(uHit * 22.0);
    a += radians(17.0) * hitOsc;

    // 出手時往前壓(縮小 yaw 擺幅),像是把頭低下來衝過來
    a *= 1.0 - 0.5 * uAtk;

    float ca = cos(a), sa = sin(a);
    mat3 yaw = mat3(ca, 0.0, -sa, 0.0, 1.0, 0.0, sa, 0.0, ca);

    // 受擊時同時給一點仰角變化,單純左右歪會顯得像節拍器
    float pitch = radians(9.0) * uHit * uHit * cos(uHit * 18.0);
    float cp = cos(pitch), sp2 = sin(pitch);
    mat3 pit = mat3(1.0, 0.0, 0.0, 0.0, cp, sp2, 0.0, -sp2, cp);
    yaw = yaw * pit;

    // 相機瞄準 y = 0.13 而不是原點:骷髏的垂直中心在那裡
    // (顱頂約 +1.05、下巴約 −0.79),瞄原點會讓它整顆偏上,
    // 畫布下緣空出一大塊透明區域。焦距從 1.5 拉到 1.8 讓它把畫面填得更滿。
    vec3 ro = yaw * vec3(0.0, 0.0, 2.6) + vec3(0.0, 0.13, 0.0);
    vec3 rd = normalize(yaw * vec3(p, -1.8));

    float t = 0.0;
    float hit = 0.0;
    int steps = 0;
    for (int i = 0; i < ${MAX_STEPS}; i++) {
      vec3 pos = ro + rd * t;
      float d = sdSkull(pos);
      // 命中門檻隨距離放寬。用固定的極小值時,掠射角的邊緣光線會在步數用完前
      // 一直「差一點點」,導致輪廓出現一圈斷斷續續的雜點。
      if (d < 0.0012 * t) { hit = 1.0; break; }
      // 0.85 的步進係數:smin / smax 會讓 SDF 略微高估真實距離,
      // 直接走滿會穿過薄的地方(牙縫、眼窩邊緣)造成破洞。
      t += d * 0.85;
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

    float ao = calcAO(pos, n);

    // 眼窩 / 鼻腔的額外壓暗。單靠 AO 還不夠 —— 這兩個孔洞必須明確地暗下去,
    // 否則在 320px 上會讀成「兩顆亮眼珠」而不是「兩個深洞」。
    float cavity = min(eyeHole(pos), sdTriPrism(pos - vec3(0.0, -0.11, 0.40), 0.10, 0.25, 0.30));
    float inCavity = smoothstep(0.10, -0.05, cavity);

    // 主光:暖金色方向光,與卡片既有的 #C8942A 主題一致
    vec3 keyDir = normalize(vec3(0.55, 0.75, 0.65));
    vec3 keyCol = vec3(0.784, 0.580, 0.165);
    float diff = max(dot(n, keyDir), 0.0);
    float spec = pow(max(dot(reflect(-keyDir, n), v), 0.0), 24.0);

    // 骨頭本體用偏暖的米白。整顆染成金色的話邊光讀不出來,造型會糊成一團。
    vec3 bone = vec3(0.90, 0.87, 0.80);

    // 冷色 fresnel 邊光,把輪廓從深色背景上提出來
    float fres = pow(1.0 - max(dot(n, v), 0.0), 2.5);
    vec3 rim = vec3(0.42, 0.55, 0.78) * fres * 1.15;

    // 主光的顏色必須真的乘進漫反射,不能只拿去做高光 ——
    // 只餵高光的話,整顆骷髏會是沒有色溫的灰白,跟卡片的金色主題對不起來。
    // 這裡把白光與金色調和成暖奶油色:骨頭仍是骨頭,但明確被金光打亮。
    // 環境光壓低、主光提高 —— 對比是「兇」的另一半。
    // 環境光高的時候陰影會被填亮,眼窩再深也是灰的,整顆就顯得溫吞。
    vec3 keyLight = mix(vec3(1.0), keyCol, 0.55) * 1.78;
    vec3 ambient = vec3(0.085, 0.080, 0.105);

    float shade = mix(1.0, 0.10, inCavity);
    vec3 col = bone * (ambient + diff * keyLight) * ao * shade;
    col += keyCol * spec * 0.5 * (1.0 - inCavity);
    col += rim * (1.0 - 0.7 * inCavity);

    // 眼窩深處的金色餘燼。刻意壓得很弱:一開始給到 0.85,結果整個眼窩被填成
    // 發光的金色圓盤,看起來像眼球而不是空洞。餘燼要像洞裡剩下的一點火光,
    // 只在最深處透出來,不能把洞照亮。
    float ember = smoothstep(0.0, -0.18, eyeHole(pos));
    col += vec3(0.95, 0.66, 0.20) * ember * 0.42;

    // ── 受擊 / 出手的發光 ──────────────────────────────────────────────
    // 這裡是在「材質內部」加光,不是像外層 CSS 那樣對整張畫布做 brightness()。
    // 差別在於:CSS 的亮度是均勻乘上去的,會把眼窩的暗部一起洗白,立體感當場消失;
    // 在這裡加,則是沿著邊緣與受光面透出來,暗部仍然是暗的 —— 骨頭看起來像
    // 「從裡面燒起來」而不是「被打了一盞白燈」。
    //
    // 受擊:紅色,沿 fresnel 邊緣最強(像衝擊波從輪廓炸開)
    col += vec3(1.0, 0.22, 0.18) * uHit * (0.35 + fres * 1.5);
    // 眼窩在受擊時燒得更旺,那兩個洞是整顆最有表情的地方
    col += vec3(1.0, 0.35, 0.10) * ember * uHit * 1.6;
    // 出手:橙紅,偏向整體受光面,像蓄力發熱
    col += vec3(1.0, 0.42, 0.12) * uAtk * (0.22 + diff * 0.55);
    col += vec3(1.0, 0.55, 0.15) * ember * uAtk * 1.9;

    gl_FragColor = vec4(col, 1.0);
  }
`

export default function BossSkull({ anim, children }) {
  const canvasRef = useRef(null)
  const [failed, setFailed] = useState(false)
  // 受擊 / 出手的衝量。1 = 剛發生,隨時間衰減回 0。
  // 用 ref 而不是 state:它每一幀都在變,進 state 會讓整個元件每幀重繪。
  const impulseRef = useRef({ hit: 0, atk: 0 })
  const uniformsRef = useRef(null)

  // anim 從 idle 變成 hit/attack 的那一刻打一次衝量進去。
  // 這是「特效逼真」的關鍵:先前 anim 只被拿去加一個 CSS class,shader 完全
  // 不知道骷髏被打中了 —— 所以特效再怎麼調都只是把一張平面圖搖一搖。
  // 現在衝量會進到 shader,骷髏是真的在 3D 空間裡被打歪、從骨頭內部透出紅光。
  useEffect(() => {
    if (anim === 'hit') impulseRef.current.hit = 1
    else if (anim === 'attack') impulseRef.current.atk = 1
  }, [anim])

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
          uHit: { value: 0 },
          uAtk: { value: 0 },
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
      // clientWidth 已經由 CSS 的 media query 決定是 320 還是 480,
      // 這裡不需要再讀一次視窗寬度。fallback 取保守的行動裝置值。
      const cssW = Math.max(1, Math.round(canvas.clientWidth || MAX_CSS_MOBILE))
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

    uniformsRef.current = program.uniforms

    // 衝量的衰減率。受擊要脆(快進快出),出手要有蓄力與收勢(慢一點)。
    // 用「每秒衰減多少」而不是每幀固定值,才不會在 144Hz 螢幕上快一倍。
    const HIT_DECAY = 2.6
    const ATK_DECAY = 1.5
    let lastMs = 0

    const draw = (elapsedMs) => {
      const dt = Math.min(0.05, Math.max(0, (elapsedMs - lastMs) / 1000))
      lastMs = elapsedMs
      const imp = impulseRef.current
      imp.hit = Math.max(0, imp.hit - dt * HIT_DECAY)
      imp.atk = Math.max(0, imp.atk - dt * ATK_DECAY)
      program.uniforms.uTime.value = elapsedMs / 1000
      program.uniforms.uHit.value = imp.hit
      program.uniforms.uAtk.value = imp.atk
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
      {/* 尺寸上限走 CSS media query,不走 JS:
          不需要監聽視窗寬度、不需要為了換上限重新 render,
          瀏覽器換完 clientWidth 之後,既有的 resize 監聽自然會重算 backing store。 */}
      <style>{`
        .boss-skull-canvas {
          display: block;
          width: 100%;
          max-width: ${MAX_CSS_MOBILE}px;
          aspect-ratio: 1 / 1;
          margin: 0 auto;
        }
        @media (min-width: 768px) {
          .boss-skull-canvas { max-width: ${MAX_CSS_DESKTOP}px; }
        }
      `}</style>
      <canvas
        ref={canvasRef}
        className="boss-skull-canvas"
        aria-label="骷髏王"
        role="img"
      />
    </div>
  )
}
