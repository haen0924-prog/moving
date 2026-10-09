// Vercel 서버 함수: 사진을 받아 Gemini로 15초 이야기를 만들어 돌려줍니다.
// API 키는 Vercel 환경변수 GEMINI_API_KEY 에 저장하세요. (코드에 직접 쓰지 않음)

const GENRES = ['동화', '모험', '코믹', '감동'];
const MOODS = ['따뜻함', '신남', '신비', '웃김'];
const MODELS = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.0-flash'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능해요' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: '서버에 API 키가 없어요. Vercel 환경변수 GEMINI_API_KEY를 확인해 주세요.' });

  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const image = body.image;
  const genre = GENRES.includes(body.genre) ? body.genre : '동화';
  if (!image || typeof image !== 'string' || image.length > 3000000) {
    return res.status(400).json({ error: '사진이 없거나 너무 커요' });
  }

  const prompt = `이 사진 속 사물을 주인공으로 한 15초짜리 짧은 숏폼 이야기를 만들어 주세요.
장르: ${genre}
조건:
- 사물이 살아있는 것처럼 말하거나 행동하는 재미있는 이야기
- 정확히 4문장, 각 문장은 공백 포함 22자 이내 (소리 내어 읽으면 3초 정도)
- 기승전결이 있고 마지막 문장은 여운이나 작은 반전
- 초등학생도 이해할 쉬운 한국어
- 제목은 12자 이내
JSON으로만 답하세요:
{"object":"사물 이름","title":"제목","lines":["문장1","문장2","문장3","문장4"],"mood":"따뜻함, 신남, 신비, 웃김 중 하나"}`;

  let lastErr = '';
  for (const m of MODELS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: 'image/jpeg', data: image } },
            { text: prompt }
          ] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 1 }
        })
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        const txt = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [])
          .map(p => p.text || '').join('');
        return res.status(200).json(parseStory(txt));
      }
      lastErr = (j.error && j.error.message) || ('오류 ' + r.status);
      if (r.status === 404) continue; // 모델 이름이 없으면 다음 모델로
      if (r.status === 429) return res.status(429).json({ error: '지금 사용하는 사람이 많아요. 30초 뒤에 다시 눌러 주세요.' });
      return res.status(r.status).json({ error: 'AI 오류: ' + lastErr });
    } catch (e) {
      lastErr = e.message;
    }
  }
  return res.status(500).json({ error: 'AI 오류: ' + lastErr });
};

function parseStory(txt) {
  const clean = String(txt).replace(/```json|```/g, '').trim();
  const s = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1));
  const lines = (Array.isArray(s.lines) ? s.lines : []).filter(Boolean).slice(0, 4).map(String);
  while (lines.length < 4) lines.push('');
  return {
    title: String(s.title || '사물 이야기'),
    lines,
    mood: MOODS.includes(s.mood) ? s.mood : '따뜻함'
  };
}
