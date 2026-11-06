// =====================================================================
// 📝 ระบบตรวจข้อสอบอัตนัยลายมือด้วย AI (Essay Grader)
// ---------------------------------------------------------------------
// โมดูลแยกจาก server.js ทั้งหมด: สร้างตารางใหม่ของตัวเอง (essay_*)
// ไม่แก้ไขตารางหรือ API เดิมของระบบสอบ
//
// ตั้งค่าใน .env:
//   ANTHROPIC_API_KEY=sk-ant-...      (ถ้าไม่ใส่ จะทำงานในโหมดทดลอง/ผลจำลอง)
//   ESSAY_MODEL=claude-sonnet-5-5     (ไม่บังคับ)
//   ESSAY_CONFIDENCE_THRESHOLD=0.7    (ไม่บังคับ)
// =====================================================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = function registerEssayGrader(app, db) {
    const UPLOAD_DIR = path.join(process.env.DATA_DIR || path.join(__dirname, '.data'), 'essay_uploads');
    try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) {}

    const API_KEY = () => process.env.ANTHROPIC_API_KEY || '';
    const MODEL = () => process.env.ESSAY_MODEL || 'claude-sonnet-5-5';
    const THRESHOLD = () => parseFloat(process.env.ESSAY_CONFIDENCE_THRESHOLD || '0.7');
    const MAX_FILE_BYTES = 30 * 1024 * 1024;
    const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    // ---------- Promise helpers บน db เดิม (รองรับทั้ง SQLite และ PostgreSQL) ----------
    const q = {
        get: (sql, p = []) => new Promise((ok, no) => db.get(sql, p, (e, r) => e ? no(e) : ok(r))),
        all: (sql, p = []) => new Promise((ok, no) => db.all(sql, p, (e, r) => e ? no(e) : ok(r || []))),
        run: (sql, p = []) => new Promise((ok, no) => db.run(sql, p, function (e) { e ? no(e) : ok(this || {}); }))
    };
    const now = () => new Date().toISOString();
    const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };

    // ---------- ตารางใหม่ ----------
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS essay_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_username TEXT,
            course_id INTEGER DEFAULT 0,
            title TEXT,
            questions_json TEXT,
            created_at TEXT
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS essay_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            assignment_id INTEGER,
            student_id TEXT,
            student_name TEXT,
            file_name TEXT,
            file_mime TEXT,
            file_path TEXT,
            status TEXT DEFAULT 'pending',
            error TEXT,
            created_at TEXT
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS essay_grades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            submission_id INTEGER,
            question_no INTEGER,
            transcript TEXT,
            ai_score REAL,
            max_score REAL,
            matched_json TEXT,
            missing_json TEXT,
            reasoning TEXT,
            confidence REAL,
            final_score REAL,
            status TEXT,
            history_json TEXT,
            updated_at TEXT
        )`, (err) => {
            // คอลัมน์ติดตามค่าใช้จ่าย API
            db.run('ALTER TABLE essay_submissions ADD COLUMN input_tokens INTEGER DEFAULT 0', () => {});
            db.run('ALTER TABLE essay_submissions ADD COLUMN output_tokens INTEGER DEFAULT 0', () => {});
            // ความใกล้เคียงกับเฉลย 1-10: ค่าที่ AI ประเมิน และค่าที่อาจารย์แก้เอง
            db.run('ALTER TABLE essay_grades ADD COLUMN similarity REAL', () => {});
            db.run('ALTER TABLE essay_grades ADD COLUMN teacher_similarity REAL', () => {});
            if (!err) console.log('📝 Essay Grader พร้อมใช้งาน' + (API_KEY() ? ` (AI: ${MODEL()})` : ' (โหมดทดลอง: ยังไม่ได้ใส่ ANTHROPIC_API_KEY)'));
        });
    });

    async function ownAssignment(id, username) {
        const a = await q.get('SELECT * FROM essay_assignments WHERE id = ?', [id]);
        if (!a) return null;
        if (username !== 'admin' && a.teacher_username !== username) return null;
        return a;
    }
    const fail = (res, e, code = 500) => res.status(code).json({ success: false, message: e.message || String(e) });

    // ---------- สถานะ ----------
    app.get('/api/essay/status', (req, res) => {
        res.json({ aiEnabled: !!API_KEY(), model: MODEL(), threshold: THRESHOLD(), retentionDays: RETENTION() });
    });

    // ---------- ค่าใช้จ่าย API ----------
    const PRICE_IN = () => parseFloat(process.env.ESSAY_PRICE_IN || '2');    // USD ต่อ 1 ล้าน token (ราคา Sonnet โดยประมาณ ปรับใน .env ได้)
    const PRICE_OUT = () => parseFloat(process.env.ESSAY_PRICE_OUT || '10');
    const USD_THB = () => parseFloat(process.env.USD_THB || '35');
    app.get('/api/essay/usage', async (req, res) => {
        try {
            const u = req.query.username;
            const rows = await q.all(`SELECT s.input_tokens, s.output_tokens, s.created_at FROM essay_submissions s
                JOIN essay_assignments a ON a.id = s.assignment_id ${u === 'admin' ? '' : 'WHERE a.teacher_username = ?'}`, u === 'admin' ? [] : [u]);
            const month = new Date().toISOString().slice(0, 7);
            const sum = list => list.reduce((o, r) => ({ files: o.files + 1, inTok: o.inTok + (Number(r.input_tokens) || 0), outTok: o.outTok + (Number(r.output_tokens) || 0) }), { files: 0, inTok: 0, outTok: 0 });
            const cost = o => ({ ...o, usd: +(o.inTok / 1e6 * PRICE_IN() + o.outTok / 1e6 * PRICE_OUT()).toFixed(2), thb: +((o.inTok / 1e6 * PRICE_IN() + o.outTok / 1e6 * PRICE_OUT()) * USD_THB()).toFixed(0) });
            res.json({ total: cost(sum(rows)), thisMonth: cost(sum(rows.filter(r => String(r.created_at || '').startsWith(month)))), note: 'ประมาณการจากราคาที่ตั้งใน .env (ESSAY_PRICE_IN / ESSAY_PRICE_OUT / USD_THB)' });
        } catch (e) { fail(res, e); }
    });

    // ---------- PDPA: ลบไฟล์ภาพกระดาษคำตอบอัตโนมัติ (คะแนนยังอยู่) ----------
    const RETENTION = () => parseInt(process.env.ESSAY_RETENTION_DAYS || '0') || 0;
    async function purgeOldFiles() {
        const days = RETENTION(); if (!days) return;
        const cutoff = new Date(Date.now() - days * 864e5).toISOString();
        const old = await q.all("SELECT id, file_path FROM essay_submissions WHERE created_at < ? AND file_path IS NOT NULL AND file_path != ''", [cutoff]).catch(() => []);
        for (const s of old) {
            try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(s.file_path))); } catch (e) {}
            await q.run("UPDATE essay_submissions SET file_path = '' WHERE id = ?", [s.id]).catch(() => {});
        }
        if (old.length) console.log(`🧹 PDPA: ลบไฟล์กระดาษคำตอบที่เก่ากว่า ${days} วัน ${old.length} ไฟล์ (คะแนนยังอยู่)`);
    }
    setTimeout(purgeOldFiles, 15000);
    setInterval(purgeOldFiles, 12 * 3600e3).unref();

    // ---------- นักเรียนดู feedback ของตัวเอง (เฉพาะงานที่อาจารย์ยืนยันครบแล้ว) ----------
    app.get('/api/student/essay-feedback', async (req, res) => {
        try {
            const sid = req.authUser && req.authUser.typ === 'student' ? req.authUser.u : null;
            if (!sid) return fail(res, new Error('กรุณาเข้าสู่ระบบใหม่'), 401);
            const subs = await q.all(`SELECT s.id, s.created_at, a.title, a.questions_json FROM essay_submissions s
                JOIN essay_assignments a ON a.id = s.assignment_id WHERE s.student_id = ? AND s.status = 'done' ORDER BY s.id DESC`, [sid]);
            const out = [];
            for (const s of subs) {
                const g = await q.all('SELECT question_no, final_score, max_score, matched_json, missing_json, reasoning, status FROM essay_grades WHERE submission_id = ? ORDER BY question_no', [s.id]);
                if (!g.length || g.some(x => x.status !== 'confirmed')) continue;
                const qs = parse(s.questions_json, []);
                out.push({ title: s.title, date: s.created_at,
                    total: g.reduce((t, x) => t + Number(x.final_score || 0), 0), max: g.reduce((t, x) => t + Number(x.max_score || 0), 0),
                    items: g.map(x => ({ no: x.question_no, prompt: (qs.find(z => z.no == x.question_no) || {}).prompt || '', score: Number(x.final_score), max: Number(x.max_score),
                        matched: parse(x.matched_json, []), missing: parse(x.missing_json, []), reasoning: x.reasoning })) });
            }
            res.json(out);
        } catch (e) { fail(res, e); }
    });

    // ---------- คะแนนรวมรายวิชา (ปรนัยจากระบบสอบเดิม + อัตนัย) ----------
    app.get('/api/essay/course-summary', async (req, res) => {
        try {
            const courseId = Number(req.query.courseId);
            if (!courseId) return fail(res, new Error('กรุณาเลือกรายวิชา'), 400);
            const u = req.query.username;
            const rooms = await q.all(`SELECT roomId, exam_title, roomName FROM teacher_rooms WHERE courseId = ? ${u === 'admin' ? '' : 'AND teacherUsername = ?'}`, u === 'admin' ? [courseId] : [courseId, u]);
            const roomIds = rooms.map(r => r.roomId);
            const exams = roomIds.length ? await q.all(`SELECT roomId, studentId, name, score, maxScore FROM exam_results WHERE roomId IN (${roomIds.map(() => '?').join(',')})`, roomIds) : [];
            const assigns = await q.all(`SELECT id, title, questions_json FROM essay_assignments WHERE course_id = ? ${u === 'admin' ? '' : 'AND teacher_username = ?'}`, u === 'admin' ? [courseId] : [courseId, u]);
            const roster = await q.all('SELECT studentId, prefix, firstName, lastName FROM course_students WHERE courseId = ?', [courseId]).catch(() => []);
            const cols = [
                ...rooms.map(r => ({ key: 'r:' + r.roomId, label: `ปรนัย: ${r.exam_title || r.roomName || r.roomId}`, max: 0 })),
                ...assigns.map(a => ({ key: 'e:' + a.id, label: `อัตนัย: ${a.title}`, max: parse(a.questions_json, []).reduce((t, x) => t + Number(x.maxScore || 0), 0) }))
            ];
            const people = new Map();
            const person = (id, name) => { id = String(id || '').trim(); if (!id) return null; if (!people.has(id)) people.set(id, { studentId: id, name: name || '', scores: {} }); const p = people.get(id); if (!p.name && name) p.name = name; return p; };
            roster.forEach(r => person(r.studentId, `${r.prefix || ''}${r.firstName || ''} ${r.lastName || ''}`.trim()));
            for (const e of exams) {
                const p = person(e.studentId, e.name); if (!p) continue;
                const k = 'r:' + e.roomId, col = cols.find(c => c.key === k);
                col.max = Math.max(col.max, Number(e.maxScore) || 0);
                p.scores[k] = Math.max(p.scores[k] ?? 0, Number(e.score) || 0); // ถ้าสอบหลายครั้ง ใช้คะแนนสูงสุด
            }
            for (const a of assigns) {
                const subs = await q.all("SELECT id, student_id, student_name FROM essay_submissions WHERE assignment_id = ? AND status = 'done'", [a.id]);
                for (const s of subs) {
                    const p = person(s.student_id, s.student_name); if (!p) continue;
                    const g = await q.all('SELECT final_score, ai_score FROM essay_grades WHERE submission_id = ?', [s.id]);
                    p.scores['e:' + a.id] = g.reduce((t, x) => t + Number(x.final_score ?? x.ai_score ?? 0), 0);
                }
            }
            res.json({ columns: cols, students: [...people.values()].sort((x, y) => x.studentId.localeCompare(y.studentId)) });
        } catch (e) { fail(res, e); }
    });

    // ---------- งาน / ข้อสอบ ----------
    app.get('/api/essay/assignments', async (req, res) => {
        try {
            const u = req.query.username;
            if (!u) return fail(res, new Error('กรุณาระบุ username'), 400);
            const rows = u === 'admin'
                ? await q.all('SELECT * FROM essay_assignments ORDER BY id DESC')
                : await q.all('SELECT * FROM essay_assignments WHERE teacher_username = ? ORDER BY id DESC', [u]);
            for (const r of rows) {
                r.questions = parse(r.questions_json, []);
                delete r.questions_json;
                const c = await q.get('SELECT COUNT(*) AS n FROM essay_submissions WHERE assignment_id = ?', [r.id]);
                r.submission_count = Number(c && c.n) || 0;
                const d = await q.get("SELECT COUNT(*) AS n FROM essay_submissions WHERE assignment_id = ? AND status = 'done'", [r.id]);
                r.done_count = Number(d && d.n) || 0;
                const rv = await q.get("SELECT COUNT(*) AS n FROM essay_grades g JOIN essay_submissions s ON s.id = g.submission_id WHERE s.assignment_id = ? AND g.status = 'review'", [r.id]);
                r.review_count = Number(rv && rv.n) || 0;
            }
            res.json(rows);
        } catch (e) { fail(res, e); }
    });

    function cleanQuestions(list) {
        if (!Array.isArray(list) || !list.length) throw new Error('ต้องมีอย่างน้อย 1 ข้อ');
        return list.map((x, i) => {
            const rubric = (Array.isArray(x.rubric) ? x.rubric : [])
                .filter(r => r && String(r.point || '').trim())
                .map(r => ({ point: String(r.point).trim(), score: Number(r.score) || 0 }));
            const max = Number(x.maxScore) || rubric.reduce((s, r) => s + r.score, 0);
            if (!String(x.prompt || '').trim()) throw new Error(`ข้อ ${i + 1}: กรุณาใส่โจทย์`);
            if (!max) throw new Error(`ข้อ ${i + 1}: กรุณาใส่คะแนนเต็มหรือ Rubric`);
            // lines: จำนวนเส้นตอบในกระดาษคำตอบ (0 = ใช้ค่าตั้งต้นของหน้าพิมพ์)
            const lines = Math.max(0, Math.min(40, parseInt(x.lines, 10) || 0));
            return { no: i + 1, prompt: String(x.prompt).trim(), answerKey: String(x.answerKey || '').trim(), rubric, maxScore: max, note: String(x.note || '').trim(), lines };
        });
    }

    app.post('/api/essay/assignments', async (req, res) => {
        try {
            const { username, title, courseId, questions, id } = req.body || {};
            if (!username || !String(title || '').trim()) return fail(res, new Error('กรุณาระบุชื่องาน'), 400);
            const qs = JSON.stringify(cleanQuestions(questions));
            if (id) {
                const a = await ownAssignment(id, username);
                if (!a) return fail(res, new Error('ไม่พบงานนี้'), 404);
                await q.run('UPDATE essay_assignments SET title = ?, course_id = ?, questions_json = ? WHERE id = ?', [title.trim(), Number(courseId) || 0, qs, id]);
                return res.json({ success: true, id: Number(id) });
            }
            const r = await q.run('INSERT INTO essay_assignments (teacher_username, course_id, title, questions_json, created_at) VALUES (?, ?, ?, ?, ?)',
                [username, Number(courseId) || 0, title.trim(), qs, now()]);
            res.json({ success: true, id: r.lastID });
        } catch (e) { fail(res, e, 400); }
    });

    app.delete('/api/essay/assignments/:id', async (req, res) => {
        try {
            const a = await ownAssignment(req.params.id, req.query.username);
            if (!a) return fail(res, new Error('ไม่พบงานนี้'), 404);
            const subs = await q.all('SELECT id, file_path FROM essay_submissions WHERE assignment_id = ?', [a.id]);
            for (const s of subs) {
                await q.run('DELETE FROM essay_grades WHERE submission_id = ?', [s.id]);
                try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(s.file_path))); } catch (e) {}
            }
            await q.run('DELETE FROM essay_submissions WHERE assignment_id = ?', [a.id]);
            await q.run('DELETE FROM essay_assignments WHERE id = ?', [a.id]);
            res.json({ success: true });
        } catch (e) { fail(res, e); }
    });

    // ---------- อัปโหลดกระดาษคำตอบ (JSON base64 เพื่อไม่ต้องเพิ่ม dependency) ----------
    app.post('/api/essay/submissions', async (req, res) => {
        try {
            const { username, assignmentId, studentId, studentName, fileName, mime, dataBase64 } = req.body || {};
            const a = await ownAssignment(assignmentId, username);
            if (!a) return fail(res, new Error('ไม่พบงานนี้'), 404);
            if (!ALLOWED_MIME.includes(mime)) return fail(res, new Error('รองรับเฉพาะ PDF, JPG, PNG, WEBP'), 400);
            const buf = Buffer.from(String(dataBase64 || ''), 'base64');
            if (!buf.length) return fail(res, new Error('ไฟล์ว่าง'), 400);
            if (buf.length > MAX_FILE_BYTES) return fail(res, new Error('ไฟล์ใหญ่เกิน 30MB'), 400);
            const ext = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[mime];
            const stored = crypto.randomBytes(12).toString('hex') + ext;
            fs.writeFileSync(path.join(UPLOAD_DIR, stored), buf);
            const r = await q.run(`INSERT INTO essay_submissions (assignment_id, student_id, student_name, file_name, file_mime, file_path, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
                [a.id, String(studentId || '').trim(), String(studentName || '').trim(), String(fileName || stored), mime, stored, now()]);
            res.json({ success: true, id: r.lastID });
            enqueue(r.lastID);
        } catch (e) { fail(res, e); }
    });

    app.get('/api/essay/submissions', async (req, res) => {
        try {
            const a = await ownAssignment(req.query.assignmentId, req.query.username);
            if (!a) return fail(res, new Error('ไม่พบงานนี้'), 404);
            const subs = await q.all('SELECT id, assignment_id, student_id, student_name, file_name, file_mime, status, error, created_at FROM essay_submissions WHERE assignment_id = ? ORDER BY id', [a.id]);
            for (const s of subs) {
                const g = await q.all('SELECT * FROM essay_grades WHERE submission_id = ? ORDER BY question_no', [s.id]);
                s.grades = g.map(x => ({ ...x, matched: parse(x.matched_json, []), missing: parse(x.missing_json, []), history: parse(x.history_json, []) }));
            }
            res.json({ assignment: { ...a, questions: parse(a.questions_json, []) }, submissions: subs });
        } catch (e) { fail(res, e); }
    });

    async function ownSubmission(id, username) {
        const s = await q.get('SELECT * FROM essay_submissions WHERE id = ?', [id]);
        if (!s) return null;
        return (await ownAssignment(s.assignment_id, username)) ? s : null;
    }

    app.get('/api/essay/file/:id', async (req, res) => {
        try {
            const s = await ownSubmission(req.params.id, req.query.username);
            if (!s) return res.status(404).end();
            if (!s.file_path || !fs.existsSync(path.join(UPLOAD_DIR, path.basename(s.file_path)))) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.status(410).send('<p style="font-family:sans-serif;padding:24px;color:#64748b">ไฟล์ต้นฉบับถูกลบแล้วตามนโยบายเก็บข้อมูล (PDPA) คะแนนยังอยู่ครบ</p>');
            }
            res.setHeader('Content-Type', s.file_mime);
            res.sendFile(path.join(UPLOAD_DIR, path.basename(s.file_path)));
        } catch (e) { res.status(500).end(); }
    });

    app.post('/api/essay/submissions/:id/regrade', async (req, res) => {
        try {
            const s = await ownSubmission(req.params.id, (req.body || {}).username);
            if (!s) return fail(res, new Error('ไม่พบไฟล์นี้'), 404);
            await q.run("UPDATE essay_submissions SET status = 'pending', error = NULL WHERE id = ?", [s.id]);
            res.json({ success: true });
            enqueue(s.id);
        } catch (e) { fail(res, e); }
    });

    app.delete('/api/essay/submissions/:id', async (req, res) => {
        try {
            const s = await ownSubmission(req.params.id, req.query.username);
            if (!s) return fail(res, new Error('ไม่พบไฟล์นี้'), 404);
            await q.run('DELETE FROM essay_grades WHERE submission_id = ?', [s.id]);
            await q.run('DELETE FROM essay_submissions WHERE id = ?', [s.id]);
            try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(s.file_path))); } catch (e) {}
            res.json({ success: true });
        } catch (e) { fail(res, e); }
    });

    app.post('/api/essay/submissions/:id/rename', async (req, res) => {
        try {
            const { username, studentId, studentName } = req.body || {};
            const s = await ownSubmission(req.params.id, username);
            if (!s) return fail(res, new Error('ไม่พบไฟล์นี้'), 404);
            await q.run('UPDATE essay_submissions SET student_id = ?, student_name = ? WHERE id = ?', [String(studentId || '').trim(), String(studentName || '').trim(), s.id]);
            res.json({ success: true });
        } catch (e) { fail(res, e); }
    });

    // ---------- อาจารย์ยืนยัน/แก้คะแนน ----------
    app.post('/api/essay/grades/:id/confirm', async (req, res) => {
        try {
            const { username, score, note, similarity } = req.body || {};
            const g = await q.get('SELECT * FROM essay_grades WHERE id = ?', [req.params.id]);
            if (!g || !(await ownSubmission(g.submission_id, username))) return fail(res, new Error('ไม่พบคะแนนนี้'), 404);
            const sc = Number(score);
            if (!Number.isFinite(sc) || sc < 0 || sc > Number(g.max_score)) return fail(res, new Error(`คะแนนต้องอยู่ระหว่าง 0 ถึง ${g.max_score}`), 400);
            // ความใกล้เคียงที่อาจารย์ให้เอง (1-10) ไม่บังคับ
            let sim = g.teacher_similarity;
            if (similarity !== undefined && similarity !== null && String(similarity).trim() !== '') {
                sim = Number(similarity);
                if (!Number.isFinite(sim) || sim < 1 || sim > 10) return fail(res, new Error('ความใกล้เคียงต้องอยู่ระหว่าง 1 ถึง 10'), 400);
            }
            const hist = parse(g.history_json, []);
            hist.push({ by: username, from: g.final_score ?? g.ai_score, to: sc, simFrom: g.teacher_similarity ?? g.similarity, simTo: sim, note: String(note || ''), at: now() });
            await q.run("UPDATE essay_grades SET final_score = ?, teacher_similarity = ?, status = 'confirmed', history_json = ?, updated_at = ? WHERE id = ?",
                [sc, sim ?? null, JSON.stringify(hist), now(), g.id]);
            res.json({ success: true });
        } catch (e) { fail(res, e); }
    });

    // ---------- คิวตรวจ (ทีละไฟล์ กันยิง API พร้อมกันเยอะเกิน) ----------
    const queue = [];
    let working = false;
    function enqueue(id) { if (!queue.includes(id)) queue.push(id); pump(); }
    async function pump() {
        if (working) return;
        working = true;
        while (queue.length) {
            const id = queue.shift();
            try { await gradeSubmission(id); }
            catch (e) {
                console.error('❌ Essay grading error:', e.message);
                await q.run("UPDATE essay_submissions SET status = 'error', error = ? WHERE id = ?", [e.message.slice(0, 500), id]).catch(() => {});
            }
        }
        working = false;
    }
    // ไฟล์ที่ค้างสถานะ pending/grading ตอนรีสตาร์ทเซิร์ฟเวอร์ ให้ตรวจต่อ
    setTimeout(() => {
        q.all("SELECT id FROM essay_submissions WHERE status IN ('pending','grading')").then(r => r.forEach(x => enqueue(x.id))).catch(() => {});
    }, 3000);

    async function gradeSubmission(id) {
        const s = await q.get('SELECT * FROM essay_submissions WHERE id = ?', [id]);
        if (!s) return;
        const a = await q.get('SELECT * FROM essay_assignments WHERE id = ?', [s.assignment_id]);
        if (!a) return;
        const questions = parse(a.questions_json, []);
        await q.run("UPDATE essay_submissions SET status = 'grading', error = NULL WHERE id = ?", [id]);

        let usage = null;
        const results = API_KEY()
            ? await callClaude(s, questions, u => { usage = u; })
            : questions.map(qq => ({ question: qq.no, transcript: '(โหมดทดลอง: ยังไม่ได้ใส่ ANTHROPIC_API_KEY ใน .env)', score: 0, matched_points: [], missing_points: [], reasoning: 'ผลจำลองสำหรับทดสอบหน้าจอ กรุณาใส่ API key เพื่อให้ AI ตรวจจริง', confidence: 0 }));

        await q.run('DELETE FROM essay_grades WHERE submission_id = ?', [id]);
        for (const qq of questions) {
            const r = results.find(x => Number(x.question) === qq.no) || { transcript: '', score: 0, reasoning: 'AI ไม่พบคำตอบข้อนี้', confidence: 0 };
            const score = Math.max(0, Math.min(qq.maxScore, Number(r.score) || 0));
            const conf = Math.max(0, Math.min(1, Number(r.confidence) || 0));
            // ความใกล้เคียงกับเฉลย 1-10 (ไม่มีค่า = AI ไม่ได้ประเมิน เช่น โหมดทดลอง)
            const simRaw = Number(r.similarity);
            const sim = Number.isFinite(simRaw) && simRaw > 0 ? Math.max(1, Math.min(10, Math.round(simRaw))) : null;
            await q.run(`INSERT INTO essay_grades (submission_id, question_no, transcript, ai_score, max_score, matched_json, missing_json, reasoning, confidence, similarity, final_score, status, history_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, qq.no, String(r.transcript || ''), score, qq.maxScore, JSON.stringify(r.matched_points || []), JSON.stringify(r.missing_points || []),
                 String(r.reasoning || ''), conf, sim, null, conf < THRESHOLD() ? 'review' : 'ai', '[]', now()]);
        }
        await q.run("UPDATE essay_submissions SET status = 'done', input_tokens = ?, output_tokens = ? WHERE id = ?",
            [usage ? Number(usage.input_tokens) || 0 : 0, usage ? Number(usage.output_tokens) || 0 : 0, id]);
    }

    async function callClaude(s, questions, onUsage) {
        if (!s.file_path) throw new Error('ไฟล์ต้นฉบับถูกลบแล้ว ตรวจใหม่ไม่ได้');
        const data = fs.readFileSync(path.join(UPLOAD_DIR, path.basename(s.file_path))).toString('base64');
        const fileBlock = s.file_mime === 'application/pdf'
            ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
            : { type: 'image', source: { type: 'base64', media_type: s.file_mime, data } };

        const spec = questions.map(qq => [
            `ข้อ ${qq.no} (เต็ม ${qq.maxScore} คะแนน)`,
            `โจทย์: ${qq.prompt}`,
            qq.answerKey ? `เฉลย: ${qq.answerKey}` : '',
            qq.rubric.length ? 'Rubric:\n' + qq.rubric.map(r => `- ${r.point} (${r.score} คะแนน)`).join('\n') : '',
            qq.note ? `หมายเหตุการให้คะแนน: ${qq.note}` : ''
        ].filter(Boolean).join('\n')).join('\n\n');

        const prompt = `คุณเป็นผู้ช่วยอาจารย์ตรวจข้อสอบอัตนัยที่เขียนด้วยลายมือ (ส่วนใหญ่เป็นภาษาไทย)
ไฟล์แนบคือกระดาษคำตอบของนักเรียน 1 คน

ขั้นตอน:
1. หาคำตอบของแต่ละข้อในไฟล์ แล้วถอดข้อความลายมือให้ตรงตามที่เขียนจริง (ไม่แก้คำผิด ไม่เติมเอง) ถ้าอ่านไม่ออกให้ใส่ [อ่านไม่ออก]
2. ให้คะแนนตาม Rubric อย่างเคร่งครัด ไม่ให้คะแนนเกินคะแนนเต็ม ใช้คำพ้องความหมายได้ สะกดผิดเล็กน้อยไม่หักคะแนน เว้นแต่ Rubric ระบุ
3. ระบุ confidence 0-1 ต่ำลงเมื่อ ลายมืออ่านยาก มีการขีดฆ่า เขียนนอกกรอบ หรือไม่แน่ใจว่าเป็นคำตอบข้อไหน
4. ประเมิน similarity = ความใกล้เคียงของ "ความหมาย" ในคำตอบนักเรียนกับเฉลย เป็นจำนวนเต็ม 1-10
   (ถ้าข้อนั้นไม่มีเฉลย ให้เทียบกับ Rubric และสิ่งที่โจทย์ต้องการ)
   10 = ตรงกับเฉลยครบถ้วน · 7-9 = ใกล้เคียงมาก ขาดรายละเอียดเล็กน้อย · 4-6 = ถูกบางส่วน · 2-3 = เกี่ยวข้องเล็กน้อย · 1 = ไม่ตรงเลย/ไม่ได้ตอบ
   ใช้คำต่างจากเฉลยได้ถ้าความหมายเดียวกัน ไม่ต้องสนลายมือหรือคำผิดเล็กน้อย และอธิบายสั้น ๆ ใน reasoning

ข้อสอบ:
${spec}

ตอบกลับเป็น JSON array เท่านั้น ห้ามมีข้อความอื่น รูปแบบ:
[{"question":1,"transcript":"...","score":0,"similarity":1,"matched_points":["..."],"missing_points":["..."],"reasoning":"...","confidence":0.0}]`;

        const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': API_KEY(), 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
                model: MODEL(),
                max_tokens: 8000,
                messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: prompt }] }]
            })
        });
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(`Claude API ${r.status}: ${(body.error && body.error.message) || 'unknown error'}`);
        if (onUsage && body.usage) onUsage(body.usage);
        const text = (body.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
        const m = text.match(/\[[\s\S]*\]/);
        if (!m) throw new Error('AI ตอบกลับไม่อยู่ในรูปแบบ JSON');
        const arr = JSON.parse(m[0]);
        if (!Array.isArray(arr)) throw new Error('AI ตอบกลับไม่ถูกรูปแบบ');
        return arr;
    }
};
