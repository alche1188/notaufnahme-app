export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { texts, targetLang } = req.body;

  if (!Array.isArray(texts) || texts.length === 0 || !targetLang) {
    return res.status(400).json({ error: 'Missing texts array or targetLang' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const prompt = `Translate the following JSON array of strings to ${targetLang}. Return ONLY a valid JSON array of the same length with translated strings, no other text:\n${JSON.stringify(texts)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    return res.status(502).json({ error: 'Gemini API error', details: err });
  }

  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  let translated;
  try {
    translated = JSON.parse(raw);
  } catch {
    return res.status(502).json({ error: 'Invalid JSON from Gemini', raw });
  }

  if (!Array.isArray(translated) || translated.length !== texts.length) {
    return res.status(502).json({ error: 'Unexpected response length', translated });
  }

  return res.status(200).json({ translated });
}
