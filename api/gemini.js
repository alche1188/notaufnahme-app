const langNames = {
  de: 'German', en: 'English', tr: 'Turkish',
  ar: 'Arabic', ru: 'Russian', pl: 'Polish'
};

async function callGemini(apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  if (!resp.ok) throw new Error(await resp.text());
  const data = await resp.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  return raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  const { action } = req.body;

  try {
    if (action === 'translate') {
      const { texts, targetLang } = req.body;
      if (!Array.isArray(texts) || !targetLang) return res.status(400).json({ error: 'Missing texts or targetLang' });

      const prompt = `Translate the following JSON array of strings to ${targetLang}. Return ONLY a valid JSON array of the same length with translated strings, no other text:\n${JSON.stringify(texts)}`;
      const raw = await callGemini(apiKey, prompt);
      const translated = JSON.parse(raw);
      if (!Array.isArray(translated) || translated.length !== texts.length) throw new Error('Unexpected array length');
      return res.status(200).json({ translated });

    } else if (action === 'questions') {
      const { bodyPart, lang } = req.body;
      if (!bodyPart || !lang) return res.status(400).json({ error: 'Missing bodyPart or lang' });

      const langName = langNames[lang] || lang;
      const prompt = `You are an experienced emergency room doctor. Generate exactly 3 short key symptom questions for a patient with pain in: ${bodyPart}. The label values must be in ${langName}. Respond ONLY as a JSON array with exactly 3 objects: [{"emoji":"🔥","label":"burning"}]. No other text.`;
      const raw = await callGemini(apiKey, prompt);
      const questions = JSON.parse(raw);
      if (!Array.isArray(questions) || questions.length < 1) throw new Error('Unexpected response');
      return res.status(200).json({ questions: questions.slice(0, 3) });

    } else if (action === 'diagnose') {
      const { bodyPart, symptoms, lang } = req.body;
      if (!bodyPart || !Array.isArray(symptoms) || !lang) return res.status(400).json({ error: 'Missing bodyPart, symptoms, or lang' });

      const langName = langNames[lang] || lang;
      const prompt = `You are an experienced emergency room doctor. Based on: body part "${bodyPart}", symptoms: ${symptoms.join(', ')}. Generate exactly 3 possible diagnoses sorted by likelihood. The name and likelihood values must be in ${langName}. Respond ONLY as a JSON array: [{"name":"...","likelihood":"..."}]. No other text.`;
      const raw = await callGemini(apiKey, prompt);
      const diagnoses = JSON.parse(raw);
      if (!Array.isArray(diagnoses)) throw new Error('Unexpected response');
      return res.status(200).json({ diagnoses: diagnoses.slice(0, 3) });

    } else {
      return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err) {
    console.error('Gemini error:', err.message);
    return res.status(502).json({ error: err.message });
  }
}
