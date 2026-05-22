export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, targetLang } = req.body;

  if (!text || !targetLang) {
    return res.status(400).json({ error: 'Missing text or targetLang' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `Translate the following text to ${targetLang}. Return only the translated text, nothing else: ${text}`
        }]
      }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    return res.status(502).json({ error: 'Gemini API error', details: err });
  }

  const data = await response.json();
  const translated = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!translated) {
    return res.status(502).json({ error: 'No translation returned' });
  }

  return res.status(200).json({ translated });
}
