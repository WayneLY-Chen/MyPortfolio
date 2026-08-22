// 允許跨網域呼叫的來源白名單（逗號分隔）。這支 proxy 目前只由後端 ai.js 與
// evals 腳本以 server-to-server 方式呼叫 —— 那類請求不帶 Origin、也不受 CORS
// 規範約束，因此預設不發任何 CORS 標頭。之所以留這個環境變數而非直接刪掉整段：
// 日後若真的需要讓瀏覽器直接呼叫，補設環境變數即可，不必再改回萬用字元。
import crypto from 'node:crypto';

const allowedOrigins = (process.env.PROXY_ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * 以固定時間比對共享密鑰。
 *
 * 先說清楚定位：這是防禦深度，不是在修一個可被利用的漏洞。原本的 `!==`
 * 字串比對在遇到不同長度時會立即返回、相同長度則逐位元組短路，理論上洩漏
 * 時間訊號 —— 但要靠它還原密鑰，需要奈秒等級的穩定量測，而這裡隔著網際網路
 * 與 Vercel 的 serverless 冷啟動抖動，實務上做不到。
 *
 * 之所以還是改：成本是十行程式碼，而「比對密鑰用固定時間演算法」是不需要
 * 每次重新論證的預設做法。把論證留給真正需要取捨的地方。
 *
 * 先各自 SHA-256 再比對，而不是直接對原始值呼叫 timingSafeEqual：
 *   1. timingSafeEqual 對長度不同的 Buffer 會直接拋錯，得先比長度 —— 那本身
 *      就洩漏了長度。摘要永遠是 32 位元組，沒有這個問題。
 *   2. 呼叫端沒帶標頭時值是 undefined，統一轉成字串處理即可，不必另開分支。
 *
 * @param {unknown} provided 請求端送來的值
 * @param {string} expected 伺服器端的密鑰
 * @returns {boolean}
 */
function matchesProxyKey(provided, expected) {
  const digest = (v) => crypto.createHash('sha256').update(String(v ?? '')).digest();
  return crypto.timingSafeEqual(digest(provided), digest(expected));
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-goog-api-client, x-internal-proxy-key');
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 共享密鑰閘門（D-04/D-05）：fail-closed。這段必須在任何碰到
  // process.env.GEMINI_API_KEY 的程式碼之前執行，否則閘門形同虛設。
  //
  // 密鑰未設定時一律拒絕服務，不再以「寬限模式」放行：放行代表任何人都能
  // 用本站的 GEMINI_API_KEY 呼叫 Gemini（帳單由站方支付），而失敗是靜默的
  // —— Vercel 的 preview 環境若沒繼承這個變數，就會在無人察覺的情況下變成
  // 一個對全網開放的免費 Gemini 代理。寧可整個功能壞掉讓人立刻發現。
  const internalProxyKey = process.env.INTERNAL_PROXY_KEY;
  if (!internalProxyKey) {
    console.error('Google Proxy: INTERNAL_PROXY_KEY 未設定，拒絕服務。');
    return res.status(503).json({ error: 'Proxy not configured' });
  }
  if (!matchesProxyKey(req.headers['x-internal-proxy-key'], internalProxyKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const urlParts = req.url.split('/api/google-proxy/');
  if (urlParts.length < 2) {
    return res.status(400).json({ error: 'Invalid proxy URL' });
  }

  const targetPath = urlParts[1];
  const targetUrlObj = new URL(`https://generativelanguage.googleapis.com/${targetPath}`);

  // Inject API key if not already present
  if (!targetUrlObj.searchParams.get('key')) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set on proxy' });
    targetUrlObj.searchParams.set('key', apiKey);
  }

  try {
    const response = await fetch(targetUrlObj.toString(), {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        'x-goog-api-client': req.headers['x-goog-api-client'] || '',
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
    });

    const data = await response.text();
    res.status(response.status).send(data);
  } catch (err) {
    // 內部錯誤細節（上游主機名、網路堆疊訊息）只寫 log，不回給呼叫端。
    console.error('Google Proxy Error:', err);
    res.status(500).json({ error: 'Proxy fetch failed' });
  }
}
