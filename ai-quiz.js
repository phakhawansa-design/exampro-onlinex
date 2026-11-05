// =====================================================================
// 🤖 สร้าง / แปลงข้อสอบปรนัยด้วย Claude (ai-quiz.js)
// - POST /api/generate-ai-quiz  { topic, difficulty, numQuestions, choices, fileBase64?, mime?, sourceText? }
//   ถ้าใส่ไฟล์ (PDF/ภาพ) หรือข้อความ จะ "แปลง" ข้อสอบที่มีอยู่ หรือออกข้อสอบจากเนื้อหานั้น
//   ถ้าไม่มี ANTHROPIC_API_KEY จะส่งต่อให้คลังข้อสอบจำลองเดิมใน server.js
// =====================================================================
module.exports = function registerAiQuiz(app) {
    const KEY = () => process.env.ANTHROPIC_API_KEY || '';
    const MODEL = () => process.env.QUIZ_MODEL || process.env.ESSAY_MODEL || 'claude-sonnet-5-5';
    const LETTERS = 'abcdefghij';

    app.get('/api/ai-quiz/status', (req, res) => res.json({ aiEnabled: !!KEY(), model: MODEL() }));

    app.post('/api/generate-ai-quiz', async (req, res, next) => {
        const b = req.body || {};
        if (!KEY()) {
            if (b.fileBase64 || b.sourceText) return res.status(400).json({ success: false, message: 'การแปลงไฟล์ต้องใส่ ANTHROPIC_API_KEY ในไฟล์ .env ก่อน' });
            return next(); // ใช้คลังข้อสอบจำลองเดิม
        }
        try {
            const count = Math.min(100, Math.max(1, parseInt(b.numQuestions) || 10));
            const nChoices = Math.min(10, Math.max(2, parseInt(b.choices) || 4));
            const diff = { easy: 'ง่าย', medium: 'ปานกลาง', hard: 'ยาก' }[String(b.difficulty || 'medium').toLowerCase()] || 'ปานกลาง';
            const hasSource = !!(b.fileBase64 || b.sourceText);
            if (!hasSource && !String(b.topic || '').trim()) return res.status(400).json({ success: false, message: 'กรุณาระบุหัวข้อ หรือแนบไฟล์' });

            const content = [];
            if (b.fileBase64) {
                const mime = String(b.mime || '');
                if (mime === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: mime, data: b.fileBase64 } });
                else if (/^image\/(jpeg|png|webp|gif)$/.test(mime)) content.push({ type: 'image', source: { type: 'base64', media_type: mime, data: b.fileBase64 } });
                else return res.status(400).json({ success: false, message: 'รองรับไฟล์ PDF หรือภาพ (หรือวางข้อความแทน)' });
            }
            if (b.sourceText) content.push({ type: 'text', text: 'เนื้อหา/ข้อสอบต้นฉบับ:\n' + String(b.sourceText).slice(0, 60000) });

            const task = hasSource
                ? `ถ้าเอกสารข้างต้นเป็นข้อสอบปรนัยอยู่แล้ว ให้ "แปลง" ทุกข้อตามต้นฉบับ (ไม่แต่งเพิ่ม ไม่ตัดข้อ เก็บเฉลยเดิมถ้ามี ถ้าไม่มีเฉลยให้เฉลยเองตามความรู้)
ถ้าเป็นเนื้อหาบทเรียน ให้ออกข้อสอบปรนัย ${count} ข้อ ระดับ${diff} จากเนื้อหานั้น${b.topic ? ` เน้นเรื่อง "${b.topic}"` : ''}`
                : `ออกข้อสอบปรนัยภาษาไทยเรื่อง "${b.topic}" จำนวน ${count} ข้อ ระดับ${diff} ข้อละ ${nChoices} ตัวเลือก`;

            content.push({ type: 'text', text: `${task}

กติกา:
- ตัวเลือกที่ถูกต้องมีเพียง 1 ตัว และสุ่มตำแหน่งเฉลย ไม่ให้เป็นตัวเดียวกันตลอด
- ตัวเลือกผิดต้องดูสมเหตุสมผล ไม่ใช้ "ถูกทุกข้อ/ผิดทุกข้อ" ถ้าไม่จำเป็น
- ไม่เกิน 10 ตัวเลือกต่อข้อ

ตอบกลับเป็น JSON array เท่านั้น ห้ามมีข้อความอื่น รูปแบบ:
[{"question":"...","choices":["...","..."],"answer":"a"}]` });

            const r = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-api-key': KEY(), 'anthropic-version': '2023-06-01' },
                body: JSON.stringify({ model: MODEL(), max_tokens: 16000, messages: [{ role: 'user', content }] })
            });
            const body = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(`Claude API ${r.status}: ${(body.error && body.error.message) || 'unknown error'}`);
            const text = (body.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
            const m = text.match(/\[[\s\S]*\]/);
            if (!m) throw new Error('AI ตอบกลับไม่อยู่ในรูปแบบ JSON');
            const questions = JSON.parse(m[0])
                .filter(q => q && q.question && Array.isArray(q.choices) && q.choices.length >= 2)
                .map(q => {
                    const choices = q.choices.slice(0, 10).map(c => String(c));
                    let ans = String(q.answer || 'a').trim().toLowerCase().charAt(0);
                    if (LETTERS.indexOf(ans) < 0 || LETTERS.indexOf(ans) >= choices.length) ans = 'a';
                    return { question: String(q.question), choices, answer: ans };
                });
            if (!questions.length) throw new Error('AI ไม่ได้สร้างข้อสอบที่ใช้ได้');
            console.log(`🤖 Claude สร้างข้อสอบ ${questions.length} ข้อ`);
            res.json({ success: true, source: 'claude', questions, usage: body.usage || null });
        } catch (e) {
            console.error('❌ AI Quiz:', e.message);
            res.status(500).json({ success: false, message: e.message });
        }
    });
};
