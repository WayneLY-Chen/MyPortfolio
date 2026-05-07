export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-goog-api-client');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
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
    console.error('Google Proxy Error:', err);
    res.status(500).json({ error: 'Proxy fetch failed', details: err.message });
  }
}
