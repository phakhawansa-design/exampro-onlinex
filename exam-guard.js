// =====================================================================
// 🛡️ ตรีเนตร · ตัวช่วยฝั่งเซิร์ฟเวอร์ระหว่างสอบ (exam-guard.js)
// ---------------------------------------------------------------------
// 1) บันทึกคำตอบระหว่างสอบ (exam_progress)
//    - รีเฟรช / แบตหมด / เน็ตหลุด กลับมาทำต่อได้ คำตอบไม่หาย
//    - เวลาสอบนับจากครั้งแรกที่เปิดข้อสอบ (รีเฟรชแล้วเวลาไม่เริ่มใหม่)
//    - ล้างเมื่อส่งข้อสอบ หรือเมื่ออาจารย์เปิด/ปิดห้องสอบรอบใหม่
// 2) ไม่ให้เริ่มสอบจากเบราว์เซอร์ในแอปแชต (LINE, Facebook, IG ฯลฯ) ซึ่งตรวจจับการสลับหน้าจอไม่ได้
// 3) จับ "การหายไปจากหน้าสอบ" จากสัญญาณ heartbeat ที่ขาดหาย
//    (ใช้ได้แม้เบราว์เซอร์ไม่แจ้งเหตุการณ์สลับหน้าจอ เช่น พับแอป ล็อกจอ)
// 4) กันเปิดข้อสอบพร้อมกันหลายเครื่อง/หลายแท็บ (แต่ละหน้าสอบมีรหัส session ของตัวเอง)
//    - เปิดเครื่องที่ 2 ขณะเครื่องแรกยังทำอยู่ → ไม่ให้เข้า และบันทึกให้อาจารย์เห็น
//    - ถ้าเครื่องแรกเงียบไปนานพอ (เช่น ล็อกจอ) แล้วเครื่องใหม่เข้าได้ เครื่องเดิมจะถูกหยุดทันทีที่กลับมา
// 5) บันทึกการตอบ/แก้คำตอบภายในไม่กี่วินาทีหลังกลับจากการสลับหน้าจอ (answer_events)
//
// .env:
//   WATCH_GAP_SECONDS=15   (สัญญาณขาดนานเท่าไรจึงบันทึก ค่าเริ่มต้น 15 วินาที)
//   ALLOW_INAPP_BROWSER=on (ปิดการบล็อกเบราว์เซอร์ในแอป เฉพาะกรณีจำเป็น)
// ลงทะเบียนต่อจาก auth.js และก่อนเส้นทาง API อื่นใน server.js
// =====================================================================

const INAPP_RE = /\bLine\/|FBAN|FBAV|FB_IAB|FBIOS|FB4A|MessengerForiOS|Instagram|musical_ly|Bytedance|TikTok|MicroMessenger|;\s*wv\)/i;
const inAppName = ua => {
    const m = String(ua || '').match(/\bLine\/|FBAN\/Messenger|MessengerForiOS|FBAN|FBAV|FB_IAB|FBIOS|FB4A|Instagram|musical_ly|Bytedance|TikTok|MicroMessenger/i);
    if (!m) return 'แอปนี้';
    const s = m[0].toLowerCase();
    if (s.startsWith('line')) return 'LINE';
    if (s.includes('messenger')) return 'Messenger';
    if (s.startsWith('fb')) return 'Facebook';
    if (s === 'instagram') return 'Instagram';
    if (s === 'micromessenger') return 'WeChat';
    return 'TikTok';
};
const isInApp = ua => INAPP_RE.test(String(ua || ''));

module.exports = function examGuard(app, db) {
    const q = {
        get: (sql, p = []) => new Promise((ok, no) => db.get(sql, p, (e, r) => e ? no(e) : ok(r))),
        all: (sql, p = []) => new Promise((ok, no) => db.all(sql, p, (e, r) => e ? no(e) : ok(r || []))),
        run: (sql, p = []) => new Promise((ok, no) => db.run(sql, p, function (e) { e ? no(e) : ok(this || {}); }))
    };
    const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
    const body = req => {
        if (req.body && typeof req.body === 'object') return req.body;
        if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) {} }
        return {};
    };
    const keyOf = (roomId, studentId) => `${String(roomId || '').trim()}|${String(studentId || '').trim()}`;
    const thaiTime = () => new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit' });

    db.run(`CREATE TABLE IF NOT EXISTS exam_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT,
        student_id TEXT,
        answers_json TEXT,
        started_at TEXT,
        updated_at TEXT,
        UNIQUE(room_id, student_id)
    )`, err => { if (!err) console.log('🛡️ ระบบบันทึกคำตอบระหว่างสอบ + ตรวจสัญญาณขาดหาย พร้อมใช้งาน'); });
    db.run(`CREATE TABLE IF NOT EXISTS answer_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT,
        student_id TEXT,
        question_id TEXT,
        question_no INTEGER,
        kind TEXT,
        from_text TEXT,
        to_text TEXT,
        after_sec INTEGER,
        after_what TEXT,
        time TEXT,
        created_at TEXT
    )`);

    // ---------- ตัวสังเกตการณ์ (ไม่เปลี่ยนการทำงานของเส้นทางเดิม) ----------
    const GAP_MS = Math.max(8, parseFloat(process.env.WATCH_GAP_SECONDS || '15')) * 1000;
    const allowInApp = String(process.env.ALLOW_INAPP_BROWSER || '').toLowerCase() === 'on';
    const beats = new Map();      // key -> { t, state, vis }
    const lastCheat = new Map();  // key -> เวลาที่มีรายงานสลับหน้าจอล่าสุด
    const sessions = new Map();   // key -> { sid, t, warned } หน้าสอบที่เป็นเจ้าของการสอบตอนนี้
    const SESSION_IDLE_MS = 15000;
    const cleanSid = v => String(v || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    const logCheat = (roomId, studentId, name, cls, action) => db.run('INSERT INTO cheat_logs (roomId, studentId, name, class, action, time) VALUES (?, ?, ?, ?, ?, ?)',
        [String(roomId), String(studentId).trim(), name || String(studentId).trim(), cls || '', action, thaiTime()], () => {});
    setInterval(() => {
        const old = Date.now() - 6 * 3600e3;
        for (const [k, v] of beats) if (v.t < old) beats.delete(k);
        for (const [k, t] of lastCheat) if (t < old) lastCheat.delete(k);
        for (const [k, v] of sessions) if (v.t < old) sessions.delete(k);
    }, 30 * 60e3).unref();

    const afterOk = (res, fn) => res.on('finish', () => { if (res.statusCode < 400) { try { fn(); } catch (e) { console.error(e); } } });

    // (6) ห้องสอบที่ผูกรายวิชาและมีรายชื่อ: ดึงข้อสอบ/ส่งคำตอบได้เฉพาะคนที่มีชื่อ
    //     (เดิมตรวจแค่ตอนเข้าสู่ระบบ คนที่เข้าสู่ระบบจากห้องอื่นแล้วเปิดลิงก์ห้องนี้ตรง ๆ จึงสอบได้)
    const normId = v => String(v || '').replace(/[^0-9a-zA-Z]/g, '');
    const deniedAt = new Map();
    async function notOnRoster(roomId, studentId) {
        const room = await q.get('SELECT courseId FROM teacher_rooms WHERE roomId = ?', [String(roomId)]);
        if (!room || !room.courseId || Number(room.courseId) <= 0) return false;      // ห้องไม่ผูกรายวิชา = เปิดให้ทุกคน (เหมือนเดิม)
        const rows = await q.all('SELECT studentId FROM course_students WHERE courseId = ? OR CAST(courseId AS TEXT) = ?', [room.courseId, String(room.courseId)]);
        if (!rows.length) return false;                                                 // วิชายังไม่มีรายชื่อ = ไม่จำกัด (เหมือนตอนเข้าสู่ระบบ)
        const sid = String(studentId || '').trim();
        return !rows.some(r => r.studentId === sid || normId(r.studentId) === normId(sid));
    }
    app.use(async (req, res, next) => {
        const p = req.path;
        const isQ = p === '/api/get-questions' && req.method === 'GET', isSubmit = p === '/api/submit-exam' && req.method === 'POST';
        if ((!isQ && !isSubmit) || !req.authUser || req.authUser.typ !== 'student') return next();
        const roomId = isQ ? req.query.roomId : body(req).roomId;
        if (!roomId) return next();
        try {
            if (await notOnRoster(roomId, req.authUser.u)) {
                const k = keyOf(roomId, req.authUser.u), now = Date.now();
                if (!deniedAt.has(k) || now - deniedAt.get(k) > 60000) {
                    deniedAt.set(k, now);
                    db.run('INSERT INTO cheat_logs (roomId, studentId, name, class, action, time) VALUES (?, ?, ?, ?, ?, ?)',
                        [String(roomId), req.authUser.u, req.authUser.u, '', '🚫 พยายามเปิดข้อสอบห้องนี้ แต่ไม่มีรายชื่อในรายวิชา (ระบบไม่ให้เข้า)', thaiTime()], () => {});
                }
                return res.status(403).json({ success: false, accessDenied: true,
                    message: `❌ รหัสนักศึกษา (${req.authUser.u}) ไม่มีรายชื่อในรายวิชาของห้องสอบนี้\nจึงเข้าสอบหรือส่งคำตอบไม่ได้ กรุณาติดต่ออาจารย์ผู้สอน` });
            }
        } catch (e) { console.error('ตรวจรายชื่อรายวิชาไม่สำเร็จ:', e.message); }
        next();
    });

    app.use((req, res, next) => {
        const p = req.path;
        // (2) บล็อกเบราว์เซอร์ในแอป ตอนดึงข้อสอบ
        if (p === '/api/get-questions' && req.method === 'GET' && !allowInApp && isInApp(req.headers['user-agent'])) {
            return res.status(403).json({
                success: false, inApp: true,
                message: `❌ เปิดข้อสอบใน ${inAppName(req.headers['user-agent'])} ไม่ได้ เพราะระบบตรวจจับการสลับหน้าจอไม่ได้\nกรุณาคัดลอกลิงก์ไปเปิดใน Safari หรือ Chrome`
            });
        }
        // (4) เปิดข้อสอบ = จองเป็นเจ้าของการสอบ ถ้ามีหน้าสอบอื่นของคนเดียวกันยังทำงานอยู่ → ไม่ให้เข้า
        if (p === '/api/get-questions' && req.method === 'GET' && req.authUser && req.authUser.typ === 'student' && req.query.roomId) {
            const sid = cleanSid(req.query.sid), k = keyOf(req.query.roomId, req.authUser.u), now = Date.now(), cur = sessions.get(k);
            if (sid) {
                if (cur && cur.sid !== sid && now - cur.t < SESSION_IDLE_MS) {
                    if (!cur.blockedAt || now - cur.blockedAt > 60000) { // บันทึกไม่เกินนาทีละครั้ง
                        cur.blockedAt = now;
                        logCheat(req.query.roomId, req.authUser.u, cur.name, cur.cls, '📱 พยายามเปิดข้อสอบบนอีกเครื่อง/อีกแท็บ ขณะที่หน้าสอบเดิมยังเปิดอยู่ (ระบบไม่ให้เข้า)');
                        lastCheat.set(k, now);
                    }
                    return res.status(409).json({
                        success: false, concurrent: true,
                        message: '❌ บัญชีนี้กำลังทำข้อสอบอยู่บนอีกเครื่องหรืออีกแท็บ\nระบบบันทึกและแจ้งอาจารย์แล้ว\n\nถ้าเครื่องเดิมปิดไปแล้ว รอประมาณ 15 วินาทีแล้วลองใหม่'
                    });
                }
                if (cur && cur.sid !== sid && cur.sid) {
                    logCheat(req.query.roomId, req.authUser.u, cur.name, cur.cls, '📱 เปิดข้อสอบจากเครื่อง/แท็บใหม่ (หน้าสอบเดิมถูกหยุด)');
                    lastCheat.set(k, now);
                }
                sessions.set(k, { sid, t: now, name: cur && cur.name, cls: cur && cur.cls });
            }
        }
        if (req.method !== 'POST') return next();
        const b = body(req);

        if (p === '/api/report-cheat' && b.roomId && b.studentId) {
            lastCheat.set(keyOf(b.roomId, b.studentId), Date.now());
        } else if (p === '/api/student/heartbeat' && b.roomId && b.studentId) {
            const k = keyOf(b.roomId, b.studentId), now = Date.now(), prev = beats.get(k);
            // (4) หน้าสอบที่ไม่ใช่เจ้าของปัจจุบัน → แจ้งให้หยุด
            const sid = cleanSid(b.sid), own = sessions.get(k);
            if (sid && (b.state || 'in_exam') === 'in_exam') {
                if (!own) sessions.set(k, { sid, t: now, name: b.name, cls: b.class });
                else if (own.sid === sid) Object.assign(own, { t: now, name: b.name || own.name, cls: b.class || own.cls });
                else {
                    res.setHeader('X-Trinetra-Session', 'superseded');
                    if (!own.warned || own.warned !== sid) {
                        own.warned = sid;
                        logCheat(b.roomId, b.studentId, b.name, b.class, '📱 พบหน้าสอบเปิดพร้อมกันหลายเครื่อง/หลายแท็บ (หน้าสอบเก่าถูกหยุด)');
                        lastCheat.set(k, now);
                    }
                    beats.set(k, prev || { t: now, state: 'in_exam', vis: 'visible' });
                    return next();
                }
            }
            const state = b.state || 'in_exam', vis = b.vis || 'visible';
            if (state === 'in_exam' && prev && prev.state === 'in_exam' && prev.vis !== 'hidden'
                && now - prev.t > GAP_MS && (lastCheat.get(k) || 0) < prev.t) {
                const sec = Math.round((now - prev.t) / 1000);
                const action = `⏸️ หายจากหน้าสอบประมาณ ${sec} วินาที (พับแอป/ล็อกจอ/สลับแอป หรือเน็ตหลุด)`;
                db.run('INSERT INTO cheat_logs (roomId, studentId, name, class, action, time) VALUES (?, ?, ?, ?, ?, ?)',
                    [String(b.roomId), String(b.studentId).trim(), b.name || '', b.class || '', action, thaiTime()], () => {});
                lastCheat.set(k, now);
            }
            beats.set(k, { t: now, state, vis });
        } else if ((p === '/api/submit-exam' || p === '/api/student/leave-room') && b.roomId && b.studentId) {
            const k = keyOf(b.roomId, b.studentId);
            beats.delete(k);
            if (p === '/api/student/leave-room') { const own = sessions.get(k); if (own && own.sid && own.sid === cleanSid(b.sid)) sessions.delete(k); }
            if (p === '/api/submit-exam') afterOk(res, () => sessions.delete(k));
            if (p === '/api/submit-exam') afterOk(res, () => db.run('DELETE FROM exam_progress WHERE room_id = ? AND student_id = ?', [String(b.roomId), String(b.studentId).trim()], () => {}));
        } else if (p === '/api/teacher/publish-exam' && b.roomId) {
            // เปิดหรือปิดห้องสอบ = เริ่มรอบใหม่ ล้างคำตอบที่ค้างของรอบก่อน
            afterOk(res, () => db.run('DELETE FROM exam_progress WHERE room_id = ?', [String(b.roomId)], () => {}));
        }
        next();
    });

    // ---------- (5) ตอบ/แก้คำตอบหลังกลับจากการสลับหน้าจอ ----------
    app.post('/api/student/answer-event', async (req, res) => {
        try {
            const b = body(req);
            const roomId = String(b.roomId || ''), studentId = String(b.studentId || '').trim();
            if (!roomId || !studentId || !b.questionId) return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบถ้วน' });
            const cut = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
            await q.run('INSERT INTO answer_events (room_id, student_id, question_id, question_no, kind, from_text, to_text, after_sec, after_what, time, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [roomId, studentId, cut(b.questionId, 20), Number(b.questionNo) || 0, b.kind === 'change' ? 'change' : 'answer', cut(b.from, 120), cut(b.to, 120),
                 Math.max(0, Math.round(Number(b.afterSec) || 0)), cut(b.afterWhat, 40), thaiTime(), new Date().toISOString()]);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ success: false, message: e.message }); }
    });

    // ---------- (1) บันทึก / กู้คืนคำตอบระหว่างสอบ ----------
    app.get('/api/student/progress', async (req, res) => {
        try {
            const roomId = String(req.query.roomId || ''), studentId = String(req.query.studentId || '').trim();
            if (!roomId || !studentId) return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบถ้วน' });
            const now = Date.now();
            await q.run('INSERT INTO exam_progress (room_id, student_id, answers_json, started_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
                [roomId, studentId, '{}', String(now), '0']);
            const row = await q.get('SELECT answers_json, started_at, updated_at FROM exam_progress WHERE room_id = ? AND student_id = ?', [roomId, studentId]);
            res.json({
                success: true,
                answers: parse(row && row.answers_json, {}),
                startedAt: Number(row && row.started_at) || now,
                updatedAt: Number(row && row.updated_at) || 0,
                serverNow: now
            });
        } catch (e) { res.status(500).json({ success: false, message: e.message }); }
    });

    app.post('/api/student/progress', async (req, res) => {
        try {
            const b = body(req);
            const roomId = String(b.roomId || ''), studentId = String(b.studentId || '').trim();
            if (!roomId || !studentId || !b.answers || typeof b.answers !== 'object') return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบถ้วน' });
            const answers = {};
            for (const [k, v] of Object.entries(b.answers).slice(0, 1000)) if (/^\d+$/.test(k) && /^[a-j]$/i.test(String(v))) answers[k] = String(v).toLowerCase();
            const now = Date.now();
            await q.run(`INSERT INTO exam_progress (room_id, student_id, answers_json, started_at, updated_at) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (room_id, student_id) DO UPDATE SET answers_json = excluded.answers_json, updated_at = excluded.updated_at`,
                [roomId, studentId, JSON.stringify(answers), String(now), String(now)]);
            res.json({ success: true, saved: Object.keys(answers).length, updatedAt: now });
        } catch (e) { res.status(500).json({ success: false, message: e.message }); }
    });
};
module.exports.isInApp = isInApp;
