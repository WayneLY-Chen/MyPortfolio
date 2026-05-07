export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-goog-api-client');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // The request URL will be something like:
  // /api/google-proxy/v1beta/models/gemini-2.5-flash:generateContent?key=...
  // We need to extract the path after `/api/google-proxy/`
  
  const urlParts = req.url.split('/api/google-proxy/');
  if (urlParts.length < 2) {
    return res.status(400).json({ error: 'Invalid proxy URL' });
  }

  const targetPath = urlParts[1];
  const targetUrl = `https://generativelanguage.googleapis.com/${targetPath}`;

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        'x-goog-api-client': req.headers['x-goog-api-client'] || '',
      },
      // Important: don't pass body for GET/HEAD
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined
    });

    const data = await response.text();
    res.status(response.status).send(data);
  } catch (err) {
    console.error('Google Proxy Error:', err);
    res.status(500).json({ error: 'Proxy fetch failed', details: err.message });
  }
}
