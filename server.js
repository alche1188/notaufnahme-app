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

    } else if (action === 'questions_round1') {
      const { zones, lang, gender, age, condition, pain, since, conditions } = req.body;
      if (!zones || !lang) return res.status(400).json({ error: 'Missing zones or lang' });

      const langName = langNames[lang] || lang;
      const prompt = `Du bist Teil einer Notaufnahme Voranmeldungs-App.
Die App hat bereits separate Screens für Schmerzstärke, Dauer, Zustand und Körperstelle – diese Informationen nicht wiederholen.
Du präzisierst jetzt den Ort der Beschwerden.

Generiere 6 Optionen die den Ort der Beschwerden eingrenzen.
Kurze Schlagworte, maximal 3 Wörter, keine Sätze, keine Fragen.
Die 6 Optionen müssen den gesamten genannten Bereich abdecken – von oben nach unten, von innen nach außen. Nicht nur den offensichtlichsten Teilbereich. Bei Bauch/Unterleib z.B. auch Oberbauch und rechts oben einschließen.
Gute Beispiele: 'Rechts oben', 'Unterbauch', 'Kniegelenk', 'Schulterblatt'
Schlechte Beispiele: 'Wo genau tut es weh?', 'Starke Schmerzen', 'Seit heute'

Patientenkontext:
- Geschlecht: ${gender || ''}
- Alter: ${age || ''}
- Beschwerden grob in: ${zones}
- Zustand: ${condition || ''}
- Schmerz: ${pain || ''}
- Seit: ${since || ''}
- Vorerkrankungen: ${conditions || ''}

Hinweis: Säuglinge (0-1 Jahre) und Hochbetagte (80+) haben atypische Symptomatik – Optionen entsprechend anpassen.
Fehlende oder leere Felder ignorieren und nicht interpretieren.

Antworte auf ${langName}. Antworte nur als JSON Array mit exakt 6 Objekten: [{"emoji":"...","label":"..."}]. Kein weiterer Text.`;
      const raw = await callGemini(apiKey, prompt);
      const questions = JSON.parse(raw);
      if (!Array.isArray(questions) || questions.length < 1) throw new Error('Unexpected response');
      return res.status(200).json({ questions: questions.slice(0, 6) });

    } else if (action === 'questions_round2') {
      const { zones, lang, gender, age, condition, pain, painQuality, radiation, painPattern, since, conditions, round1Answers } = req.body;
      if (!zones || !lang) return res.status(400).json({ error: 'Missing zones or lang' });

      const langName = langNames[lang] || lang;
      const prompt = `Du bist Teil einer Notaufnahme Voranmeldungs-App.
Die App hat bereits separate Screens für Schmerzstärke, Dauer, Zustand und Körperstelle – diese Informationen nicht wiederholen.
Du kennst bereits den genauen Ort der Beschwerden aus Runde 1 – diese Optionen nicht wiederholen.
Jetzt präzisierst du die Symptome selbst.

Generiere 6 Symptom-Optionen die tiefer in die Beschwerden gehen.
Kurze Schlagworte, maximal 3 Wörter, keine Sätze, keine Fragen.
Nicht wiederholen: Schmerzstärke, Dauer, Ort, bereits gewählte Runde-1-Antworten.
Gute Beispiele: 'Taubheit', 'Schwellung', 'Kribbeln', 'Rötung', 'Überwärmung'
Schlechte Beispiele: 'Wie stark sind die Schmerzen?', 'Seit wann?', bereits genannte Orte aus Runde 1

Patientenkontext:
- Geschlecht: ${gender || ''}
- Alter: ${age || ''}
- Beschwerden grob in: ${zones}
- Ort präzise (Runde 1): ${Array.isArray(round1Answers) && round1Answers.length ? round1Answers.join(', ') : ''}
- Zustand: ${condition || ''}
- Schmerz: ${pain || ''}
- Schmerzqualität: ${painQuality || ''}
- Ausstrahlung: ${radiation || ''}
- Schmerzcharakter: ${painPattern || ''}
- Seit: ${since || ''}
- Vorerkrankungen: ${conditions || ''}

Hinweis: Säuglinge (0-1 Jahre) und Hochbetagte (80+) haben atypische Symptomatik – Optionen entsprechend anpassen.
Fehlende oder leere Felder ignorieren und nicht interpretieren.

Antworte auf ${langName}. Antworte nur als JSON Array mit exakt 6 Objekten: [{"emoji":"...","label":"..."}]. Kein weiterer Text.`;
      const raw = await callGemini(apiKey, prompt);
      const questions = JSON.parse(raw);
      if (!Array.isArray(questions) || questions.length < 1) throw new Error('Unexpected response');
      return res.status(200).json({ questions: questions.slice(0, 6) });

    } else if (action === 'diagnose') {
      const { bodyPart, round1Answers, round2Answers, lang, who, gender, age, condition, pain, painQuality, radiation, painPattern, since, conditions, medications, allergies } = req.body;
      if (!bodyPart || !lang) return res.status(400).json({ error: 'Missing bodyPart or lang' });

      const langName = langNames[lang] || lang;
      const prompt = `Du bist ein klinisches Vorsichtungssystem für Notaufnahmen. Du lieferst strukturierte Entscheidungshilfen – keine Diagnosen. Die medizinische Beurteilung liegt ausschließlich beim behandelnden Arzt.

Analysiere folgende Patientendaten und nenne 3 differenzialdiagnostische Vorschläge sortiert nach Wahrscheinlichkeit.

Wichtige Hinweise:
- Bei Brust + Arm Symptomen immer Herzinfarkt in Betracht ziehen, unabhängig von links oder rechts, da Patienten Seiten verwechseln
- Bei weiblichen Patienten im gebärfähigen Alter mit Unterbauchschmerzen immer Schwangerschaft und Eileiterschwangerschaft berücksichtigen
- Körperstellen-Kombinationen sind wichtiger als einzelne Stellen
- Vorerkrankungen stark gewichten – z.B. bekannte Herzprobleme + Brustschmerzen = sofort höhere Priorität
- Säuglinge (0-1 Jahre) und Hochbetagte (80+) sind Risikogruppen mit atypischer Symptomatik
- Fehlende oder leere Felder ignorieren und nicht interpretieren

Patientendaten:
- Wer: ${who || ''}
- Geschlecht: ${gender || ''}
- Alter: ${age || ''}
- Beschwerden in: ${bodyPart}
- Allgemeinzustand: ${condition || ''}
- Schmerz: ${pain || ''}
- Schmerzqualität: ${painQuality || ''}
- Ausstrahlung: ${radiation || ''}
- Schmerzcharakter: ${painPattern || ''}
- Seit: ${since || ''}
- Vorerkrankungen: ${conditions || ''}
- Medikamente: ${medications || ''}
- Allergien: ${allergies || ''}
- Symptome Runde 1: ${Array.isArray(round1Answers) && round1Answers.length ? round1Answers.join(', ') : ''}
- Symptome Runde 2: ${Array.isArray(round2Answers) && round2Answers.length ? round2Answers.join(', ') : ''}

Antworte auf ${langName}. Antworte nur als JSON Array mit exakt 3 Objekten: [{"name":"...","likelihood":"..."}]. Likelihood ist einer von: Wahrscheinlich, Möglich, Weniger wahrscheinlich. Kein weiterer Text.`;
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
