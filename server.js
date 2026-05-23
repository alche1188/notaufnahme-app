require('dotenv').config();
const express = require('express');
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('.'));

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

app.post('/api/gemini', async (req, res) => {
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
      const { bodyPart, lang, gender, age } = req.body;
      if (!bodyPart || !lang) return res.status(400).json({ error: 'Missing bodyPart or lang' });

      const langName = langNames[lang] || lang;
      const isFemaleFertile = gender === 'Weiblich' && (age?.includes('Jugendlich') || age?.includes('Erwachsen'));
      const hasAbdomen = /Bauch|Unterbauch|Unterleib/i.test(bodyPart);
      const menstruationHint = isFemaleFertile && hasAbdomen
        ? ' Wichtig: Patientin ist weiblich im gebärfähigen Alter mit Unterbauchbeschwerden. Füge "Ausbleiben der Periode" als eine der Optionen ein.'
        : '';
      const prompt = `Du bist Teil einer visuellen Triage-App für Notaufnahmen. Die App hat bereits separate Screens für Schmerzstärke und Dauer. Du generierst NUR antippbare Symptom-Optionen - keine Fragen, keine Sätze, nur kurze Schlagworte mit maximal 3 Wörtern. Gute Beispiele: 'Taubheit', 'Schwellung', 'Kribbeln', 'Ausstrahlung', 'Plötzlich aufgetreten', 'Nach Essen schlimmer'. Schlechte Beispiele: 'Wie stark sind die Schmerzen?', 'Seit wann?', 'Beschreiben Sie'. Patient hat Beschwerden in: ${bodyPart}.${menstruationHint} Generiere bis zu 6 passende Symptom-Optionen auf ${langName}. Antworte nur als JSON Array: [{"emoji":"...","label":"..."}]. Kein weiterer Text.`;
      const raw = await callGemini(apiKey, prompt);
      const questions = JSON.parse(raw);
      if (!Array.isArray(questions) || questions.length < 1) throw new Error('Unexpected response');
      return res.status(200).json({ questions: questions.slice(0, 6) });

    } else if (action === 'diagnose') {
      const { bodyPart, symptoms, lang, gender, age, condition, pain, since } = req.body;
      if (!bodyPart || !Array.isArray(symptoms) || !lang) return res.status(400).json({ error: 'Missing bodyPart, symptoms, or lang' });

      const langName = langNames[lang] || lang;
      const prompt = `Du bist ein erfahrener Notaufnahmearzt. Analysiere folgende Patientendaten präzise. Wichtige Hinweise: Bei Brust + Arm Symptomen immer Herzinfarkt in Betracht ziehen unabhängig von links oder rechts, da Patienten Seiten verwechseln. Bei weiblichen Patienten im gebärfähigen Alter mit Unterbauchschmerzen immer Schwangerschaft und Eileiterschwangerschaft berücksichtigen. Körperstellen-Kombinationen sind wichtiger als einzelne Stellen. Säuglinge (0–1 Jahr) und hochbetagte Patienten (80+) sind besondere Risikogruppen: bei Säuglingen stets Sepsis, Intussuszeption und atypische Präsentationen berücksichtigen; bei Hochbetagten stets Sturz, Fraktur, atypischer Herzinfarkt, Sepsis und kognitive Veränderungen bedenken. Patientendaten: Geschlecht: ${gender || 'unbekannt'}, Alter: ${age || 'unbekannt'}, Beschwerden in: ${bodyPart}, Symptome: ${symptoms.join(', ') || 'keine'}, Zustand: ${condition || 'unbekannt'}, Schmerz: ${pain || 'unbekannt'}, Seit: ${since || 'unbekannt'}. Nenne exakt 3 wahrscheinlichste Diagnosen. name und likelihood auf ${langName}. Antworte nur als JSON Array: [{"name":"...","likelihood":"..."}]. Likelihood: Wahrscheinlich, Möglich, oder Unwahrscheinlich (übersetzt auf ${langName}). Kein weiterer Text.`;
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
});

app.listen(port, () => {
  console.log(`Server läuft auf http://localhost:${port}`);
});
