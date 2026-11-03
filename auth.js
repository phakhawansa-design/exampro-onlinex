// =====================================================================
// 🔐 ระบบยืนยันตัวตนด้วย Token (auth.js)
// ---------------------------------------------------------------------
// - ออก token ให้อัตโนมัติเมื่อล็อกอินสำเร็จ (อาจารย์ / แอดมิน / นักเรียน)
// - API ฝั่งอาจารย์และแอดมินต้องมี token ที่ถูกต้อง
// - username ที่ส่งมาจากเบราว์เซอร์จะถูกแทนด้วยตัวตนจริงใน token
//   (อาจารย์จึงดึงหรือแก้ข้อมูลของอาจารย์คนอื่นไม่ได้)
// - API ที่หน้าสอบของนักเรียนใช้ ยังเปิดใช้ได้ตามเดิม เพื่อไม่ให้การสอบสะดุด
//
// .env:
//   AUTH_SECRET=...        (ไม่บังคับ: ถ้าไม่ใส่จะสร้างให้และเก็บใน DATA_DIR/.auth_secret)
//   AUTH_ENFORCE=off       (ปิดการบังคับ token ชั่วคราวในกรณีฉุกเฉิน)
//   AUTH_TOKEN_HOURS=12
// =====================================================================
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ---------- รหัสผ่านอาจารย์ ----------
function hashTeacherPassword(pw) {
    const salt = crypto.randomBytes(16).toString('hex');
    const h = crypto.scryptSync(String(pw || ''), salt, 32).toString('hex');
    return `s1$${salt}$${h}`;
}
// คืนค่า { ok, needsUpgrade } รองรับรหัสเดิมที่เก็บแบบตัวอักษรปกติ และ sha256
function verifyTeacherPassword(stored, pw) {
    stored = String(stored || ''); pw = String(pw || '');
    if (stored.startsWith('s1$')) {
        const [, salt, h] = stored.split('$');
        const calc = crypto.scryptSync(pw, salt, 32);
        const want = Buffer.from(h || '', 'hex');
        return { ok: want.length === calc.length && crypto.timingSafeEqual(want, calc), needsUpgrade: false };
    }
    const sha = crypto.createHash('sha256').update(pw).digest('hex');
    if (stored.length && (stored === pw || stored === sha)) return { ok: true, needsUpgrade: true };
    return { ok: false, needsUpgrade: false };
}

function createAuth(dataDir) {
    let secret = process.env.AUTH_SECRET;
    if (!secret) {
        const f = path.join(dataDir, '.auth_secret');
        try { secret = fs.readFileSync(f, 'utf8').trim(); } catch (e) {}
        if (!secret) {
            secret = crypto.randomBytes(32).toString('hex');
            try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(f, secret); } catch (e) {}
        }
    }
    const HOURS = parseFloat(process.env.AUTH_TOKEN_HOURS || '12');
    const b64u = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    const sign = s => b64u(crypto.createHmac('sha256', secret).update(s).digest());

    function issue(payload) {
        const body = b64u(JSON.stringify({ ...payload, exp: Date.now() + HOURS * 3600e3 }));
        return body + '.' + sign(body);
    }
    function verify(token) {
        if (!token || typeof token !== 'string' || !token.includes('.')) return null;
        const [body, sig] = token.split('.');
        const want = sign(body);
        if (!sig || sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
        try {
            const p = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
            return p.exp > Date.now() ? p : null;
        } catch (e) { return null; }
    }
    return { issue, verify };
}

// API ที่ไม่ต้องใช้ token (หน้าล็อกอิน/สมัคร และหน้าสอบของนักเรียน)
const PUBLIC = [
    'POST /api/teacher/login', 'POST /api/superadmin/login', 'POST /api/admin/create-teacher',
    'POST /api/student/login', 'POST /api/student/register',
    'GET /api/student/get-room-by-code', 'POST /api/report-issue',
    'GET /api/room-settings', 'GET /api/teacher/get-publish-status', 'POST /api/office/submit',
    'GET /api/essay/status'
];
// API ของนักเรียน: ต้องมี token นักเรียน และ studentId ที่ส่งมาต้องเป็นของตัวเอง (กันส่งข้อสอบ/เปลี่ยนรหัสแทนคนอื่น)
const STUDENT_ONLY = [
    'GET /api/student/essay-feedback', 'POST /api/student/change-password', 'POST /api/student/heartbeat',
    'POST /api/student/leave-room', 'POST /api/student/check-exam-access', 'GET /api/student/my-exam-history',
    'POST /api/student/update-profile', 'GET /api/get-warnings', 'POST /api/mark-warning-read',
    'POST /api/report-cheat', 'POST /api/log-student-login', 'POST /api/submit-exam', 'GET /api/get-questions'
];
// ยังใช้ได้แม้ยังไม่เปลี่ยนรหัสเริ่มต้น
const ALLOW_BEFORE_PW_CHANGE = ['POST /api/student/change-password', 'POST /api/student/leave-room'];

function register(app, db, dataDir) {
    const auth = createAuth(dataDir);
    const enforce = String(process.env.AUTH_ENFORCE || 'on').toLowerCase() !== 'off';

    // คอลัมน์ "ต้องเปลี่ยนรหัสผ่าน" (ใช้หลังอาจารย์รีเซ็ตรหัสให้นักศึกษา) — รอให้ server.js สร้างตารางก่อน
    setTimeout(() => db.run('ALTER TABLE students ADD COLUMN must_change INTEGER DEFAULT 0', () => {}), 3000);

    // ---------- 🚦 จำกัดการเดารหัสผ่าน ----------
    const MAX_FAILS = parseInt(process.env.LOGIN_MAX_FAILS || '5');        // ผิดกี่ครั้งต่อบัญชี (ต่อเครื่อง)
    const LOCK_MIN = parseFloat(process.env.LOGIN_LOCK_MINUTES || '10');   // ล็อกกี่นาที
    const IP_MAX_FAILS = parseInt(process.env.LOGIN_IP_MAX_FAILS || '50'); // ผิดรวมต่อ IP (เผื่อทั้งห้องใช้เน็ตเดียวกัน)
    const WINDOW = 15 * 60e3;
    const fails = new Map(); // key -> { n, first, lockUntil }
    const clientIp = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || '?';
    const loginId = req => String((req.body && (req.body.username || req.body.studentId)) || '').trim().toLowerCase();
    const LOGIN_PATHS = ['/api/teacher/login', '/api/superadmin/login', '/api/student/login'];
    function lockedFor(key) {
        const f = fails.get(key); const now = Date.now();
        if (!f) return 0;
        if (f.lockUntil > now) return Math.ceil((f.lockUntil - now) / 60e3);
        if (now - f.first > WINDOW) fails.delete(key);
        return 0;
    }
    function addFail(key, max) {
        const now = Date.now(); let f = fails.get(key);
        if (!f || now - f.first > WINDOW) f = { n: 0, first: now, lockUntil: 0 };
        f.n++; if (f.n >= max) f.lockUntil = now + LOCK_MIN * 60e3;
        fails.set(key, f); return max - f.n;
    }
    setInterval(() => { const now = Date.now(); for (const [k, f] of fails) if (f.lockUntil < now && now - f.first > WINDOW) fails.delete(k); }, 10 * 60e3).unref();

    // 1) แนบ token ในคำตอบของการล็อกอินที่สำเร็จ (ไม่ต้องแก้โค้ด login เดิม) + นับการเข้าสู่ระบบผิด
    app.use((req, res, next) => {
        if (req.method !== 'POST') return next();
        const p = req.path;
        if (!['/api/teacher/login', '/api/superadmin/login', '/api/student/login', '/api/student/register', '/api/student/change-password', '/api/student/update-profile'].includes(p)) return next();
        const isLogin = LOGIN_PATHS.includes(p);
        const ip = clientIp(req), acctKey = `a|${p.includes('student') ? 's' : 't'}|${loginId(req)}|${ip}`, ipKey = `ip|${ip}`;
        if (isLogin) {
            const m = Math.max(lockedFor(acctKey), lockedFor(ipKey));
            if (m) return res.status(429).json({ success: false, locked: true, message: `เข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารอประมาณ ${m} นาทีแล้วลองใหม่` });
        }
        const orig = res.json.bind(res);
        res.json = body => {
            // นับผิด / ล้างเมื่อสำเร็จ
            if (isLogin && body && typeof body === 'object') {
                if (body.success) fails.delete(acctKey);
                else if (res.statusCode === 401) {
                    const left = addFail(acctKey, MAX_FAILS); addFail(ipKey, IP_MAX_FAILS);
                    if (left > 0 && left <= 2) body.message = `${body.message || 'รหัสผ่านไม่ถูกต้อง'} (เหลืออีก ${left} ครั้งก่อนถูกล็อกชั่วคราว)`;
                    else if (left <= 0) body.message = `เข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารอประมาณ ${LOCK_MIN} นาทีแล้วลองใหม่`;
                }
            }
            // นักศึกษาที่อาจารย์รีเซ็ตรหัสให้ → บังคับเปลี่ยนรหัสก่อนสอบ
            if (p === '/api/student/login' && body && body.success && body.student && !body.isDefaultPassword) {
                return db.get('SELECT must_change FROM students WHERE studentId = ?', [String(body.student.studentId).trim()], (err, row) => {
                    if (!err && row && Number(row.must_change) === 1) body.isDefaultPassword = true;
                    finish(body);
                });
            }
            if ((p === '/api/student/change-password' || (p === '/api/student/update-profile' && req.body && req.body.newPassword)) && body && body.success && req.authUser) {
                db.run('UPDATE students SET must_change = 0 WHERE studentId = ?', [req.authUser.u], () => {});
            }
            return finish(body);
        };
        const finish = body => {
            try {
                if (body && body.success) {
                    if (body.teacher) body.token = auth.issue({ typ: 'teacher', u: body.teacher.username, role: body.teacher.role || 'teacher' });
                    else if (body.admin) body.token = auth.issue({ typ: 'teacher', u: body.admin.username, role: 'admin' });
                    else if (body.student) body.token = auth.issue({ typ: 'student', u: String(body.student.studentId).trim(), ...(body.isDefaultPassword ? { mustChange: 1 } : {}) });
                    else if (p === '/api/student/change-password' && req.authUser && req.authUser.typ === 'student') {
                        body.token = auth.issue({ typ: 'student', u: req.authUser.u }); // เปลี่ยนรหัสแล้ว ออก token ใหม่ที่ไม่ติดเงื่อนไข
                        body.student = { studentId: req.authUser.u };
                    }
                }
            } catch (e) {}
            return orig(body);
        };
        next();
    });

    // 2) ตรวจ token
    app.use('/api', (req, res, next) => {
        const key = `${req.method} /api${req.path}`;
        const hdr = req.headers.authorization || '';
        const tok = hdr.startsWith('Bearer ') ? hdr.slice(7) : (req.query.token || '');
        const user = auth.verify(tok);
        req.authUser = user;
        if (req.method === 'OPTIONS' || PUBLIC.includes(key)) return next();

        if (STUDENT_ONLY.includes(key)) {
            if (!user || user.typ !== 'student') return res.status(401).json({ success: false, authRequired: true, student: true, message: 'กรุณาเข้าสู่ระบบใหม่อีกครั้ง' });
            if (user.mustChange && !ALLOW_BEFORE_PW_CHANGE.includes(key)) {
                return res.status(403).json({ success: false, mustChangePassword: true, message: 'กรุณาเปลี่ยนรหัสผ่านเริ่มต้นก่อนเข้าสอบ' });
            }
            // studentId ที่ส่งมาต้องตรงกับเจ้าของ token
            for (const src of [req.query, req.body]) {
                if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
                if (src.studentId !== undefined && String(src.studentId).trim() !== user.u) {
                    return res.status(403).json({ success: false, message: 'ไม่สามารถทำรายการแทนนักเรียนคนอื่นได้' });
                }
                if (src.studentId === undefined && /change-password|update-profile|my-exam-history|check-exam-access/.test(key)) src.studentId = user.u;
            }
            const pw = String((req.body && req.body.newPassword) || '').trim();
            if (key === 'POST /api/student/change-password' || (key === 'POST /api/student/update-profile' && pw)) {
                if (pw.length < 6 || pw === '1234' || pw === user.u) return res.status(400).json({ success: false, message: 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร และห้ามเป็น 1234 หรือรหัสนักศึกษา' });
            }
            return next();
        }
        if (!enforce) return next();
        if (!user || user.typ !== 'teacher') {
            return res.status(401).json({ success: false, authRequired: true, message: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' });
        }
        const isAdmin = user.role === 'admin';
        // /api/superadmin/* ใช้ได้เฉพาะแอดมิน (/api/admin/* อาจารย์ใช้อนุมัตินักเรียนได้ตามเดิม)
        if (!isAdmin && req.path.startsWith('/superadmin/')) return res.status(403).json({ success: false, message: 'เฉพาะผู้ดูแลระบบ' });
        // แทน username ที่ส่งมาด้วยตัวตนจริง (แอดมินดูได้ทุกคน)
        for (const src of [req.query, req.body]) {
            if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
            if (!isAdmin) { for (const k of ['username', 'teacherUsername', 'teacher_username']) if (k in src) src[k] = user.u; }
            if (!src.username) src.username = user.u; // ถ้าไม่ได้ส่งมา ใช้ตัวตนจาก token
        }
        if (isAdmin) return next();
        const get = (sql, params) => new Promise(ok => db.get(sql, params, (err, row) => ok(err ? null : row)));
        (async () => {
            // 1) ห้องสอบ (roomId) ต้องเป็นของอาจารย์คนนี้
            const roomId = (req.query && req.query.roomId) || (req.body && typeof req.body === 'object' && req.body.roomId);
            if (roomId) {
                const row = await get('SELECT teacherUsername FROM teacher_rooms WHERE roomId = ?', [String(roomId)]);
                if (row && row.teacherUsername && row.teacherUsername !== user.u) return res.status(403).json({ success: false, message: 'ห้องสอบนี้ไม่ใช่ของคุณ' });
            }
            // 2) รายวิชา (courseId ใน path / query / body) ต้องเป็นของอาจารย์คนนี้
            const m = req.path.match(/^\/(?:teacher\/)?courses\/(\d+)/);
            const cid = m ? m[1] : ((req.query && req.query.courseId) || (req.body && typeof req.body === 'object' && req.body.courseId));
            if (cid && /^\d+$/.test(String(cid)) && Number(cid) > 0) {
                const row = await get('SELECT teacherUsername FROM courses WHERE id = ?', [Number(cid)]);
                if (row && row.teacherUsername && row.teacherUsername !== user.u) return res.status(403).json({ success: false, message: 'รายวิชานี้ไม่ใช่ของคุณ' });
            }
            // 3) ลบ/อนุมัตินักศึกษา: ต้องเป็นนักศึกษาในวิชาของตัวเอง (อนุมัติได้ถ้ายังไม่อยู่ในวิชาใด)
            if (key === 'POST /api/admin/delete-student' || key === 'POST /api/admin/approve-student') {
                const sid = String((req.body && req.body.studentId) || '');
                const mine = await get('SELECT 1 AS ok FROM course_students cs JOIN courses c ON c.id = cs.courseId WHERE cs.studentId = ? AND c.teacherUsername = ?', [sid, user.u]);
                const anyCourse = await get('SELECT 1 AS ok FROM course_students WHERE studentId = ?', [sid]);
                const allowed = mine || (key === 'POST /api/admin/approve-student' && !anyCourse);
                if (!allowed) return res.status(403).json({ success: false, message: 'นักศึกษาคนนี้ไม่ได้อยู่ในรายวิชาของคุณ' });
            }
            next();
        })().catch(() => res.status(500).json({ success: false, message: 'ตรวจสิทธิ์ไม่สำเร็จ' }));
    });

    // 🔑 อาจารย์รีเซ็ตรหัสผ่านนักศึกษา → ได้รหัสชั่วคราว นักศึกษาต้องตั้งรหัสใหม่ตอนเข้าสู่ระบบครั้งถัดไป
    app.post('/api/teacher/reset-student-password', (req, res) => {
        const user = req.authUser;
        if (!user || user.typ !== 'teacher') return res.status(401).json({ success: false, authRequired: true, message: 'กรุณาเข้าสู่ระบบ' });
        const sid = String((req.body && req.body.studentId) || '').trim();
        if (!sid) return res.status(400).json({ success: false, message: 'กรุณาระบุรหัสนักศึกษา' });
        const go = () => db.get('SELECT id FROM students WHERE studentId = ?', [sid], (err, st) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            if (!st) return res.status(404).json({ success: false, message: 'นักศึกษาคนนี้ยังไม่เคยเข้าสู่ระบบ ให้ใช้รหัสผ่านเริ่มต้น (1234 หรือ 4 หลักท้ายของรหัสนักศึกษา) ได้เลย' });
            const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
            const temp = Array.from(crypto.randomBytes(8), b => A[b % A.length]).join('');
            const h = crypto.createHash('sha256').update(temp).digest('hex');
            db.run('UPDATE students SET password_hash = ?, must_change = 1 WHERE studentId = ?', [h, sid], err2 => {
                if (err2) return res.status(500).json({ success: false, message: err2.message });
                [...fails.keys()].filter(k => k.startsWith(`a|s|${sid.toLowerCase()}|`)).forEach(k => fails.delete(k)); // ปลดล็อกด้วย
                console.log(`🔑 ${user.u} รีเซ็ตรหัสผ่านนักศึกษา ${sid}`);
                res.json({ success: true, tempPassword: temp, message: 'รีเซ็ตรหัสผ่านแล้ว' });
            });
        });
        if (user.role === 'admin') return go();
        db.get('SELECT 1 AS ok FROM course_students cs JOIN courses c ON c.id = cs.courseId WHERE cs.studentId = ? AND c.teacherUsername = ?', [sid, user.u], (err, row) => {
            if (!row) return res.status(403).json({ success: false, message: 'นักศึกษาคนนี้ไม่ได้อยู่ในรายวิชาของคุณ' });
            go();
        });
    });

    console.log(enforce ? '🔐 เปิดระบบยืนยันตัวตนด้วย token แล้ว' : '⚠️ AUTH_ENFORCE=off: ปิดการบังคับ token (ไม่แนะนำ)');
    return auth;
}

module.exports = { register, hashTeacherPassword, verifyTeacherPassword };
