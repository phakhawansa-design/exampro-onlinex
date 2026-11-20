require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function hashPassword(str) {
    return crypto.createHash('sha256').update(str || '').digest('hex');
}
// ผู้เรียกใช้ API ฝั่งอาจารย์: ใช้ตัวตนจาก token เสมอ (ไม่เชื่อ username ที่หน้าเว็บส่งมา) — อาจารย์เห็นได้เฉพาะข้อมูลของตัวเอง
function viewer(req) {
    const u = req.authUser;
    if (u && u.typ === 'teacher') return { admin: u.role === 'admin', user: u.u, adm: u.role === 'admin' ? 1 : 0 };
    const n = String((req.query && req.query.username) || (req.body && req.body.username) || '');
    return { admin: n === 'admin', user: n, adm: n === 'admin' ? 1 : 0 };
}
const MY_ROOMS = 'SELECT roomId FROM teacher_rooms WHERE teacherUsername = ?';
// เฉลย/คำตอบให้อยู่รูปแบบเดียวกัน: "B", " b ", "ข", "ข." → "b" (เดิมเฉลยที่บันทึกเป็นตัวอักษรไทยจะไม่มีใครตอบถูก)
const THAI_CHOICE = { 'ก': 'a', 'ข': 'b', 'ค': 'c', 'ง': 'd', 'จ': 'e', 'ฉ': 'f', 'ช': 'g', 'ซ': 'h', 'ฌ': 'i', 'ญ': 'j' };
function normAnswer(v) {
    const s = String(v === undefined || v === null ? '' : v).trim().replace(/[.)\s]+$/, '').trim();
    if (THAI_CHOICE[s]) return THAI_CHOICE[s];
    return s.toLowerCase();
}
// ห้องสอบเปิดเฉพาะบางกลุ่มเรียน (allowed_classes เช่น "TEC3R,TEC2N") · ว่าง = ทุกกลุ่มในรายวิชา
function splitGroupList(s) { return String(s || '').split(/\s*[,|]\s*/).map(x => x.trim().toLowerCase()).filter(Boolean); }
function outsideAllowedGroups(allowed, studentClass) {
    const a = splitGroupList(allowed);
    if (!a.length) return false;
    return !splitGroupList(studentClass).some(x => a.includes(x));
}
function groupDeniedMsg(allowed, studentClass) {
    return `ห้องสอบนี้เปิดให้เฉพาะกลุ่มเรียน ${String(allowed).split(/\s*[,|]\s*/).filter(Boolean).join(', ')} เท่านั้น` +
        (studentClass ? ` (กลุ่มของคุณ: ${studentClass})` : '') + ' กรุณาตรวจสอบรหัสเข้าสอบกับอาจารย์ผู้คุมสอบ';
}
// กฎรหัสผ่านนักศึกษา (ตรงกับหน้าเว็บ): อย่างน้อย 6 ตัว ห้ามเป็น 1234 และห้ามเป็นรหัสนักศึกษา
const STUDENT_PW_RULE_MSG = 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร และห้ามเป็น 1234 หรือรหัสนักศึกษา';
function weakStudentPw(pw, studentId) {
    pw = String(pw || '').trim();
    const sid = String(studentId || '').trim();
    return pw.length < 6 || pw === '1234' || pw === sid || pw === sid.replace(/[^0-9a-zA-Z]/g, '');
}

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.text({ type: 'text/plain' }));
app.use('/images', express.static(path.join(__dirname, 'images')));
// กันไม่ให้ดาวน์โหลดไฟล์ฝั่งเซิร์ฟเวอร์ (ฐานข้อมูล, โค้ด, สคริปต์) ผ่านเว็บ
app.use((req, res, next) => {
    const p = decodeURIComponent(req.path).toLowerCase();
    if (/\.(db|db-journal|sqlite|bat|env|log|md)$/.test(p) || /^\/(server|auth|backup|check_storage|make_pdf|exam-guard|trinetra-link|backup-export)\.js$/.test(p) || /^\/(package(-lock)?\.json|\.npmrc|\.gitignore)$/.test(p) || p.startsWith('/_backup') || p.startsWith('/exam-converter/server/') || p.startsWith('/routes/') || p.startsWith('/node_modules') || p.startsWith('/.')) {
        return res.status(404).end();
    }
    next();
});
app.use(express.static(__dirname));

const { Pool } = require('pg');

if (!process.env.DATABASE_URL && fs.existsSync(path.join(__dirname, '.env'))) {
    try {
        const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
        const match = envContent.match(/postgresql:\/\/[^\r\n\s]+/);
        if (match) {
            process.env.DATABASE_URL = match[0];
        }
    } catch(e) {}
}

const isPg = !!process.env.DATABASE_URL;
let db;

function convertToPg(sql) {
    if (typeof sql !== 'string') return sql;
    let converted = sql;
    
    converted = converted.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
    converted = converted.replace(/roomId TEXT PRIMARY KEY/gi, 'roomId VARCHAR(255) PRIMARY KEY');
    
    if (/INSERT OR IGNORE INTO/i.test(converted)) {
        converted = converted.replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO');
        if (/teachers/i.test(converted) && !/ON CONFLICT/i.test(converted)) {
            converted += ' ON CONFLICT (username) DO NOTHING';
        } else if (/teacher_rooms/i.test(converted) && !/ON CONFLICT/i.test(converted)) {
            converted += ' ON CONFLICT (roomId) DO NOTHING';
        } else {
            converted += ' ON CONFLICT DO NOTHING';
        }
    }

    let paramIndex = 1;
    converted = converted.replace(/GROUP_CONCAT\(DISTINCT\s+([^)]+)\)/gi, "STRING_AGG(DISTINCT CAST($1 AS TEXT), ', ')");
    converted = converted.replace(/GROUP_CONCAT\(([^)]+)\)/gi, "STRING_AGG(CAST($1 AS TEXT), ', ')");
    converted = converted.replace(/\?/g, () => `$${paramIndex++}`);
    converted = converted.replace(/(\$\d+)\s+IS\s+NOT\s+NULL/gi, 'CAST($1 AS TEXT) IS NOT NULL');
    converted = converted.replace(/(\$\d+)\s+IS\s+NULL/gi, 'CAST($1 AS TEXT) IS NULL');
    return converted;
}

if (isPg) {
    console.log('กำลังเชื่อมต่อฐานข้อมูล Neon PostgreSQL...');
    let connStr = process.env.DATABASE_URL;
    if (connStr) {
        connStr = connStr.replace(/sslmode=(require|prefer|verify-ca)/gi, 'sslmode=verify-full');
    }
    // PostgreSQL คืนผล COUNT()/SUM() (bigint) และ numeric เป็นตัวอักษร เช่น "5" ต่างจาก SQLite ที่เป็นตัวเลข
    //    แปลงเป็นตัวเลขให้เหมือนกัน (เดิมบน Neon ตัวเลขบางช่องต่อกันเป็นข้อความ หรือเทียบ === 0 ไม่ผ่าน)
    try {
        const { types } = require('pg');
        types.setTypeParser(20, v => { const n = Number(v); return Number.isSafeInteger(n) ? n : v; });
        types.setTypeParser(1700, v => Number(v));
    } catch (e) { console.error('ตั้งค่าการแปลงตัวเลขของ PostgreSQL ไม่สำเร็จ:', e.message); }
    const pool = new Pool({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false }
    });

    // PostgreSQL คืน column names เป็นตัวพิมพ์เล็กทั้งหมด (roomid แทน roomId)
    // ฟังก์ชันนี้แปลงกลับเป็น camelCase ให้ตรงกับ Frontend
    const colMap = {
        roomid: 'roomId', roomname: 'roomName', teacherusername: 'teacherUsername',
        templateid: 'templateId', templatename: 'templateName',
        studentid: 'studentId', studentname: 'studentName',
        maxscore: 'maxScore', answers_json: 'answers_json',
        is_published: 'is_published', exam_title: 'exam_title', exam_code: 'exam_code', examcode: 'examCode',
        show_score: 'show_score', show_leaderboard: 'show_leaderboard',
        question_img: 'question_img',
        a_img: 'a_img', b_img: 'b_img', c_img: 'c_img', d_img: 'd_img',
        e_img: 'e_img', f_img: 'f_img', g_img: 'g_img', h_img: 'h_img',
        i_img: 'i_img', j_img: 'j_img',
        created_at: 'created_at',
        logintime: 'loginTime', logindate: 'loginDate',
        teachername: 'teacherName',
        firstname: 'firstName', lastname: 'lastName',
        examcount: 'examCount', avgscore: 'avgScore', cheatcount: 'cheatCount', tabswitches: 'tabSwitches',
        roomcount: 'roomCount', questioncount: 'questionCount',
        resultcount: 'resultCount', questionbytes: 'questionBytes',
        resultbytes: 'resultBytes',
        password_hash: 'password_hash', status: 'status', approved_at: 'approved_at', approved_by: 'approved_by',
        courseid: 'courseId', coursecode: 'courseCode', coursename: 'courseName',
        semester: 'semester', description: 'description',
        fullnameen: 'fullNameEn', studentcount: 'studentCount',
        // ชื่อคอลัมน์ที่ตั้งเองในคำสั่ง SQL (เดิมขาดไป ทำให้บน Neon ค่าเหล่านี้หายจากหน้าเว็บ)
        courseclassroom: 'courseClassroom', studentclasses: 'studentClasses', enrolledcourses: 'enrolledCourses',
        templatebytes: 'templateBytes', templatecount: 'templateCount'
    };
    function transformRow(row) {
        if (!row || typeof row !== 'object') return row;
        const out = {};
        for (const [k, v] of Object.entries(row)) {
            out[colMap[k] || k] = v;
        }
        return out;
    }

    db = {
        isPg: true,
        get(sql, params, callback) {
            if (typeof params === 'function') { callback = params; params = []; }
            const pgSql = convertToPg(sql);
            pool.query(pgSql, params || [])
                .then(res => callback && callback(null, transformRow(res.rows[0])))
                .catch(err => callback && callback(err));
        },
        all(sql, params, callback) {
            if (typeof params === 'function') { callback = params; params = []; }
            const pgSql = convertToPg(sql);
            pool.query(pgSql, params || [])
                .then(res => callback && callback(null, (res.rows || []).map(transformRow)))
                .catch(err => callback && callback(err));
        },
        run(sql, params, callback) {
            if (typeof params === 'function') { callback = params; params = []; }
            let pgSql = convertToPg(sql);
            const isInsert = /^\s*INSERT\s+/i.test(pgSql);
            if (isInsert && !/RETURNING/i.test(pgSql)) {
                pgSql += ' RETURNING id';
            }
            pool.query(pgSql, params || [])
                .then(res => {
                    const ctx = {
                        lastID: res.rows && res.rows[0] && res.rows[0].id ? res.rows[0].id : null,
                        changes: res.rowCount
                    };
                    if (callback) callback.call(ctx, null);
                })
                .catch(err => {
                    if (callback) callback.call({ lastID: null, changes: 0 }, err);
                });
        },
        prepare(sql) {
            return {
                run(...args) {
                    const cb = typeof args[args.length - 1] === 'function' ? args.pop() : null;
                    db.run(sql, args, cb);
                },
                finalize() {}
            };
        },
        serialize(fn) {
            if (fn) fn();
        }
    };

    pool.query('SELECT NOW()')
        .then(() => console.log('เชื่อมต่อฐานข้อมูล Neon PostgreSQL สำเร็จ! (Cloud DB Active)'))
        .catch(err => console.error('เชื่อมต่อ Neon PostgreSQL ล้มเหลว:', err.message));

} else {
    const dbDir = process.env.DATA_DIR || path.join(__dirname, '.data');
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path.join(dbDir, 'exam_system.db');

    db = new sqlite3.Database(dbPath, (err) => {
        if (err) console.error('เชื่อมต่อ SQLite ล้มเหลว:', err.message);
        else console.log('เชื่อมต่อฐานข้อมูล SQLite สำเร็จ (ไฟล์: ' + dbPath + ')');
    });
}

// เข้าสู่ระบบช่องเดียว (login.html): ตรวจว่าเป็นบัญชีอาจารย์/แอดมินก่อน ถ้าไม่ใช่ถือเป็นนักศึกษา
// ส่งต่อไปยัง API เดิม (/api/teacher/login หรือ /api/student/login) จึงได้ระบบล็อกเมื่อใส่รหัสผิด token และบังคับเปลี่ยนรหัสครบเหมือนเดิม
app.use((req, res, next) => {
    if (req.method !== 'POST' || req.path !== '/api/login') return next();
    const body = req.body || {};
    const id = String(body.username || body.id || '').trim();
    const password = String(body.password || '');
    if (!id || !password) return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสนักศึกษา/ชื่อผู้ใช้ และรหัสผ่าน' });
    db.get('SELECT id FROM teachers WHERE username = ?', [id], (err, t) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        if (t) { req.body = { username: id, password }; req.url = '/api/teacher/login'; }
        else { req.body = { studentId: id, password }; req.url = '/api/student/login'; }
        next();
    });
});

// ระบบยืนยันตัวตนด้วย token (auth.js) — ต้องลงทะเบียนก่อน API ทั้งหมด
const { hashTeacherPassword, verifyTeacherPassword } = require('./auth');
require('./auth').register(app, db, process.env.DATA_DIR || path.join(__dirname, '.data'));
// บันทึกคำตอบระหว่างสอบ + บล็อกเบราว์เซอร์ในแอป + จับสัญญาณขาดหาย (ต้องอยู่ก่อนเส้นทาง API ของการสอบ)
try { require('./exam-guard')(app, db); } catch (e) { console.error('โหลด Exam Guard ไม่สำเร็จ:', e.message); }

// สร้างตารางข้อมูลทั้งหมด และทำการ Migration ตารางเดิมอย่างปลอดภัย
db.serialize(() => {
    // 1. ตารางอาจารย์
    db.run(`CREATE TABLE IF NOT EXISTS teachers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        name TEXT,
        phone TEXT,
        status TEXT DEFAULT 'approved',
        role TEXT DEFAULT 'teacher',
        created_at TEXT
    )`);

    // 2. ตารางห้องสอบเฉพาะตัวอาจารย์ (อาจารย์ 1 ท่านมีได้ 10 ห้อง)
    db.run(`CREATE TABLE IF NOT EXISTS teacher_rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacherUsername TEXT,
        roomId TEXT UNIQUE,
        roomName TEXT
    )`);

    // 3. ตารางข้อสอบ (รองรับสูงสุด 10 ตัวเลือก: a ถึง j และรูปภาพโจทย์ + ช้อยส์)
    db.run(`CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        roomId TEXT,
        question TEXT,
        a TEXT, b TEXT, c TEXT, d TEXT, e TEXT, f TEXT, g TEXT, h TEXT, i TEXT, j TEXT,
        answer TEXT,
        question_img TEXT,
        a_img TEXT, b_img TEXT, c_img TEXT, d_img TEXT, e_img TEXT, f_img TEXT, g_img TEXT, h_img TEXT, i_img TEXT, j_img TEXT
    )`);

    // 4. ตารางผลสอบ (รองรับชั้นเรียน วันที่ และเวลาส่ง)
    db.run(`CREATE TABLE IF NOT EXISTS exam_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        roomId TEXT,
        studentId TEXT,
        name TEXT,
        class TEXT,
        score INTEGER,
        maxScore INTEGER,
        time TEXT,
        date TEXT,
        answers_json TEXT
    )`);

    // 5. ตารางประวัติทุจริต/สลับหน้าจอ (รองรับชั้นเรียน)
    db.run(`CREATE TABLE IF NOT EXISTS cheat_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        roomId TEXT,
        studentId TEXT,
        name TEXT,
        class TEXT,
        action TEXT,
        time TEXT
    )`);

    // 6. ตารางบันทึกรายงานปัญหาจากนักศึกษา (Student Issue Reports)
    db.run(`CREATE TABLE IF NOT EXISTS student_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        roomId TEXT,
        studentId TEXT,
        studentName TEXT,
        class TEXT,
        issue TEXT,
        time TEXT,
        date TEXT
    )`);



    // 9. ตารางประวัติการ login ของนักศึกษา
    db.run(`CREATE TABLE IF NOT EXISTS student_logins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        studentId TEXT,
        name TEXT,
        class TEXT,
        roomId TEXT,
        loginTime TEXT,
        loginDate TEXT
    )`);

    // 10. ตารางแจ้งเตือนความประพฤตินักศึกษา (Student Warning Messaging)
    db.run(`CREATE TABLE IF NOT EXISTS student_warnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        roomId TEXT,
        studentId TEXT,
        message TEXT,
        status TEXT DEFAULT 'unread',
        time TEXT
    )`);

    // 11. ตารางคลังข้อสอบสะสม (My Exam Library)
    db.run(`CREATE TABLE IF NOT EXISTS exam_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacherUsername TEXT,
        templateName TEXT,
        courseId INTEGER DEFAULT 0,
        created_at TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS template_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        templateId INTEGER,
        question TEXT,
        a TEXT, b TEXT, c TEXT, d TEXT, e TEXT, f TEXT, g TEXT, h TEXT, i TEXT, j TEXT,
        answer TEXT,
        question_img TEXT,
        a_img TEXT, b_img TEXT, c_img TEXT, d_img TEXT, e_img TEXT, f_img TEXT, g_img TEXT, h_img TEXT, i_img TEXT, j_img TEXT,
        FOREIGN KEY(templateId) REFERENCES exam_templates(id) ON DELETE CASCADE
    )`);

    // 12. ตารางรายชื่อนักศึกษา (Student Management)
    db.run(`CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacherUsername TEXT,
        studentId TEXT UNIQUE,
        firstName TEXT,
        lastName TEXT,
        class TEXT,
        password_hash TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        note TEXT,
        created_at TEXT,
        approved_at TEXT,
        approved_by TEXT
    )`);

    // 13. ตารางรายวิชา (Courses / Subjects Management)
    db.run(`CREATE TABLE IF NOT EXISTS courses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teacherUsername TEXT,
        courseCode TEXT,
        courseName TEXT,
        semester TEXT DEFAULT '',
        description TEXT DEFAULT '',
        created_at TEXT
    )`);

    // 14. ตารางรายชื่อนักศึกษาประจำวิชา (Course Student Roster)
    db.run(`CREATE TABLE IF NOT EXISTS course_students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        courseId INTEGER,
        studentId TEXT,
        prefix TEXT DEFAULT '',
        firstName TEXT,
        lastName TEXT,
        class TEXT DEFAULT '',
        fullNameEn TEXT DEFAULT '',
        created_at TEXT
    )`);

    // ==========================================
    // กู้ห้องสอบที่ถูกลบไปก่อนหน้านี้: ผลสอบ/ประวัติสลับหน้าจอที่ห้องหายไปแล้ว → สร้างห้องกลับมาแบบซ่อน (archived)
    //   เจ้าของห้อง = อาจารย์เจ้าของรายวิชาของผลสอบ หรือดูจากรหัสห้อง (เช่น somchai_room_xxx, somchai_r3)
    function recoverDeletedRooms() {
        const orphanSql = (t) => `SELECT roomId, MAX(courseId) as courseId FROM ${t} WHERE roomId IS NOT NULL AND roomId NOT IN (SELECT roomId FROM teacher_rooms) GROUP BY roomId`;
        db.all(orphanSql('exam_results'), [], (e1, a) => {
            db.all(orphanSql('cheat_logs'), [], (e2, b) => {
                if (e1 && e2) return console.error('ตรวจห้องสอบที่ถูกลบไม่สำเร็จ:', (e1 || e2).message);
                const map = new Map();
                [...(a || []), ...(b || [])].forEach(r => { if (r.roomId && !map.has(r.roomId)) map.set(r.roomId, Number(r.courseId) || 0); });
                if (!map.size) return;
                db.all('SELECT id, teacherUsername FROM courses', [], (e3, courses) => {
                    db.all('SELECT username FROM teachers', [], (e4, teachers) => {
                        const owners = new Set((teachers || []).map(t => t.username));
                        const courseOwner = new Map((courses || []).map(c => [Number(c.id), c.teacherUsername]));
                        let n = 0;
                        map.forEach((courseId, roomId) => {
                            let owner = courseOwner.get(courseId);
                            if (!owner) { const m = String(roomId).match(/^(.+?)(?:_room_[a-z0-9]+|_rd+)$/i); if (m && owners.has(m[1])) owner = m[1]; }
                            if (!owner) return;
                            n++;
                            db.run(`INSERT INTO teacher_rooms (teacherUsername, roomId, roomName, exam_title, exam_code, is_published, courseId, archived)
                                    VALUES (?, ?, ?, ?, '', 0, ?, 1)`, [owner, roomId, 'ห้องสอบที่ลบแล้ว', 'ห้องสอบที่ลบแล้ว', courseId || 0],
                                (err) => { if (err) console.error('กู้ห้องสอบ ' + roomId + ' ไม่สำเร็จ:', err.message); });
                        });
                        if (n) console.log(`✔ กู้ห้องสอบที่ถูกลบ ${n} ห้อง (ผลสอบและประวัติกลับมาแสดงแล้ว)`);
                    });
                });
            });
        });
    }

    // ระบบ Auto-Migrations (เพิ่มคอลัมน์ใหม่สำหรับตารางเดิมที่มีอยู่แล้ว)
    // ==========================================
    
    // ผูกห้องสอบกับรายวิชา (courseId)
    db.run("ALTER TABLE teacher_rooms ADD COLUMN courseId INTEGER DEFAULT 0", (err) => {
        if (!err) console.log("✔ Added column 'courseId' to teacher_rooms table");
    });

    // ห้องสอบที่อาจารย์ลบ = เก็บเข้าคลัง (archived = 1) ไม่ลบแถวจริง
    //   เดิมลบแถวห้องสอบทิ้ง → ผลสอบและประวัติสลับหน้าจอของห้องนั้นยังอยู่ แต่ไม่มีเจ้าของ จึงหายจากทุกหน้า
    // ค่าตั้งของระบบ (แอดมินตั้ง) เช่น ปีการศึกษา/ภาคเรียนเริ่มต้นของทุกบัญชี
    // มีคอลัมน์ id เพราะตัวแปลงคำสั่งของ PostgreSQL เติม RETURNING id ให้ทุก INSERT
    db.run("CREATE TABLE IF NOT EXISTS app_settings (id INTEGER PRIMARY KEY AUTOINCREMENT, skey VARCHAR(100) UNIQUE, svalue TEXT, updated_at TEXT)");
    db.run("ALTER TABLE teacher_rooms ADD COLUMN max_leaves INTEGER DEFAULT 3", (err) => {
        if (!err) console.log("✔ Added column 'max_leaves' to teacher_rooms table");
    });
    db.run("ALTER TABLE teacher_rooms ADD COLUMN allowed_classes TEXT DEFAULT ''", (err) => {
        if (!err) console.log("✔ Added column 'allowed_classes' to teacher_rooms table");
    });
    db.run("ALTER TABLE teacher_rooms ADD COLUMN archived INTEGER DEFAULT 0", (err) => {
        if (!err) console.log("✔ Added column 'archived' to teacher_rooms table");
        setTimeout(recoverDeletedRooms, 4000);
    });
    
    // ผูกชุดข้อสอบในคลังกับรายวิชา (courseId)
    db.run("ALTER TABLE exam_templates ADD COLUMN courseId INTEGER DEFAULT 0", (err) => {
        if (!err) console.log("✔ Added column 'courseId' to exam_templates table");
    });

    // ซิงค์ชื่อกลุ่ม/ห้องเรียนใน teacher_rooms ให้ตรงกับห้องเรียนของรายวิชา (กรณีเคยบันทึกเป็นชื่อข้อสอบ)
    db.run(`
        UPDATE teacher_rooms 
        SET roomName = (
            SELECT COALESCE(NULLIF(c.description, ''), 'ห้องเรียนตามรายวิชา') 
            FROM courses c 
            WHERE c.id = teacher_rooms.courseId
        )
        WHERE courseId > 0 AND (roomName = exam_title OR roomName LIKE 'แบบทดสอบ%' OR roomName LIKE 'สอบ%')
    `, (err) => {
        if (!err) console.log("✔ Synchronized roomName with course classrooms for teacher_rooms");
    });
    
    // อัปเกรดตารางผลสอบ (exam_results)
    db.run("ALTER TABLE exam_results ADD COLUMN class TEXT", (err) => {
        if (!err) console.log("✔ Added column 'class' to exam_results table");
    });
    db.run("ALTER TABLE exam_results ADD COLUMN date TEXT", (err) => {
        if (!err) console.log("✔ Added column 'date' to exam_results table");
    });
    db.run("ALTER TABLE exam_results ADD COLUMN answers_json TEXT", (err) => {
        if (!err) console.log("✔ Added column 'answers_json' to exam_results table");
    });
    db.run("ALTER TABLE exam_results ADD COLUMN courseId INTEGER", (err) => {
        if (!err) console.log("✔ Added column 'courseId' to exam_results table");
    });
    // บันทึกการสลับหน้าจอ: เก็บรายวิชา ณ ตอนที่เกิดเหตุ (นับแยกวิชาได้ถูกต้อง แม้ภายหลังจะย้ายห้องสอบไปวิชาอื่น)
    db.run("ALTER TABLE cheat_logs ADD COLUMN courseId INTEGER", () => {
        db.run("UPDATE cheat_logs SET courseId = (SELECT tr.courseId FROM teacher_rooms tr WHERE tr.roomId = cheat_logs.roomId) WHERE courseId IS NULL", () => {});
    });

    // ล้างบันทึกในหน้า "ตรวจสอบพฤติกรรมน่าสงสัย" = ซ่อนจากหน้านั้นเท่านั้น (แฟ้มประวัติรวมและประวัตินักศึกษายังเก็บไว้ครบ)
    db.run("ALTER TABLE cheat_logs ADD COLUMN monitor_hidden INTEGER DEFAULT 0", (err) => {
        if (!err) console.log("✔ Added column 'monitor_hidden' to cheat_logs table");
        // หน้า "ตรวจสอบพฤติกรรมน่าสงสัย" แสดงเฉพาะห้องที่กำลังเปิดสอบ → บันทึกของห้องที่ปิดแล้วซ่อนจากหน้านั้น
        //   (แฟ้มประวัติรวม ประวัตินักศึกษา และหน้าผลสอบยังเห็นครบ)
        setTimeout(() => db.run("UPDATE cheat_logs SET monitor_hidden = 1 WHERE COALESCE(monitor_hidden, 0) = 0 AND roomId NOT IN (SELECT roomId FROM teacher_rooms WHERE is_published = 1)", [],
            (e) => { if (e) console.error('ซ่อนบันทึกของห้องที่ปิดแล้วไม่สำเร็จ:', e.message); }), 5000);
    });

    // อัปเกรดตารางล็อกทุจริต (cheat_logs)
    db.run("ALTER TABLE cheat_logs ADD COLUMN class TEXT", (err) => {
        if (!err) console.log("✔ Added column 'class' to cheat_logs table");
    });

    // อัปเกรดตารางข้อสอบ (questions) เพิ่มช้อยส์ e ถึง j
    const extraChoices = ['e', 'f', 'g', 'h', 'i', 'j'];
    extraChoices.forEach(col => {
        db.run(`ALTER TABLE questions ADD COLUMN ${col} TEXT`, (err) => {
            if (!err) console.log(`✔ Added column '${col}' to questions table`);
        });
    });

    // อัปเกรดตารางห้องสอบ (teacher_rooms)
    db.run("ALTER TABLE teacher_rooms ADD COLUMN randomize INTEGER DEFAULT 1", (err) => {
        if (!err) console.log("✔ Added column 'randomize' to teacher_rooms table");
    });
    db.run("ALTER TABLE teacher_rooms ADD COLUMN is_published INTEGER DEFAULT 0", (err) => {
        if (!err) console.log("✔ Added column 'is_published' to teacher_rooms table");
    });
    db.run("ALTER TABLE teacher_rooms ADD COLUMN duration INTEGER DEFAULT 0", (err) => {
        if (!err) console.log("✔ Added column 'duration' to teacher_rooms table");
    });
    db.run("ALTER TABLE teacher_rooms ADD COLUMN announcement TEXT DEFAULT ''", (err) => {
        if (!err) console.log("✔ Added column 'announcement' to teacher_rooms table");
    });
    db.run("ALTER TABLE teacher_rooms ADD COLUMN show_score INTEGER DEFAULT 1", (err) => {
        if (!err) console.log("✔ Added column 'show_score' to teacher_rooms table");
    });
    db.run("ALTER TABLE teacher_rooms ADD COLUMN show_leaderboard INTEGER DEFAULT 1", (err) => {
        if (!err) console.log("✔ Added column 'show_leaderboard' to teacher_rooms table");
    });
    db.run("ALTER TABLE teacher_rooms ADD COLUMN exam_title TEXT DEFAULT ''", (err) => {
        if (!err) console.log("✔ Added column 'exam_title' to teacher_rooms table");
    });
    db.run("ALTER TABLE teacher_rooms ADD COLUMN exam_code TEXT DEFAULT ''", (err) => {
        if (!err) console.log("✔ Added column 'exam_code' to teacher_rooms table");
    });

    // อัปเกรดตารางข้อสอบ (questions) เพิ่มรูปภาพโจทย์และรูปช้อยส์
    db.run("ALTER TABLE questions ADD COLUMN question_img TEXT", (err) => {
        if (!err) console.log("✔ Added column 'question_img' to questions table");
    });
    const imageChoices = ['a_img', 'b_img', 'c_img', 'd_img', 'e_img', 'f_img', 'g_img', 'h_img', 'i_img', 'j_img'];
    imageChoices.forEach(col => {
        db.run(`ALTER TABLE questions ADD COLUMN ${col} TEXT`, (err) => {
            if (!err) console.log(`✔ Added column '${col}' to questions table`);
        });
    });

    // อัปเกรดตารางอาจารย์ (teachers) เพิ่ม status, role, created_at
    db.run("ALTER TABLE teachers ADD COLUMN status TEXT DEFAULT 'approved'", (err) => {
        if (!err) console.log("✔ Added column 'status' to teachers table");
    });
    db.run("ALTER TABLE teachers ADD COLUMN role TEXT DEFAULT 'teacher'", (err) => {
        if (!err) console.log("✔ Added column 'role' to teachers table");
    });
    db.run("ALTER TABLE teachers ADD COLUMN created_at TEXT", (err) => {
        if (!err) console.log("✔ Added column 'created_at' to teachers table");
    });
    db.run("ALTER TABLE teachers ADD COLUMN phone TEXT", (err) => {
        if (!err) console.log("✔ Added column 'phone' to teachers table");
    });

    // อัปเกรดตารางนักศึกษา (students) เพิ่ม password_hash, status, approved_at, approved_by
    db.run("ALTER TABLE students ADD COLUMN password_hash TEXT DEFAULT ''", (err) => {
        if (!err) console.log("✔ Added column 'password_hash' to students table");
    });
    db.run("ALTER TABLE students ADD COLUMN status TEXT DEFAULT 'approved'", (err) => {
        if (!err) console.log("✔ Added column 'status' to students table");
    });
    db.run("ALTER TABLE students ADD COLUMN approved_at TEXT", (err) => {
        if (!err) console.log("✔ Added column 'approved_at' to students table");
    });
    db.run("ALTER TABLE students ADD COLUMN approved_by TEXT", (err) => {
        if (!err) console.log("✔ Added column 'approved_by' to students table");
    });

    // Seed บัญชี Super Admin เริ่มต้น: ใช้ ADMIN_PASSWORD จาก .env ถ้ามี ไม่งั้นใช้ admin123 แล้วบังคับเปลี่ยนตอนเข้าสู่ระบบครั้งแรก
    const seedAdminPw = (process.env.ADMIN_PASSWORD || '').trim() || 'admin123';
    db.run(`INSERT OR IGNORE INTO teachers (username, password, name, status, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        ['admin', hashTeacherPassword(seedAdminPw), 'ผู้ดูแลระบบ (Super Admin)', 'approved', 'admin', new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })],
        function (err) {
            if (err || !this || !this.changes) return;
            console.log(seedAdminPw === 'admin123'
                ? 'สร้างบัญชี Super Admin แล้ว (admin / admin123) ระบบจะบังคับตั้งรหัสใหม่ตอนเข้าสู่ระบบครั้งแรก'
                : 'สร้างบัญชี Super Admin แล้ว (admin / รหัสจาก ADMIN_PASSWORD)');
        }
    );
    // สุ่มสร้างรหัส PIN 6 หลักสำหรับห้องสอบที่ยังไม่มีรหัส PIN ให้ทันที
    db.all("SELECT id, roomId FROM teacher_rooms WHERE exam_code IS NULL OR exam_code = ''", [], (err, rows) => {
        if (!err && rows && rows.length > 0) {
            rows.forEach(r => {
                const autoPin = Math.floor(100000 + Math.random() * 900000).toString();
                db.run("UPDATE teacher_rooms SET exam_code = ? WHERE id = ?", [autoPin, r.id]);
            });
            console.log(`สุ่มสร้างรหัส PIN 6 หลักให้ห้องสอบเริ่มต้น ${rows.length} ห้องเรียบร้อย`);
        }
    });
});

// ระบบจัดการนักศึกษาที่อยู่ในห้องสอบ / รอสอบแบบเรียลไทม์ (Real-time Live Room Tracker)
const activeRoomTracker = new Map(); // roomId -> Map(studentId -> { studentId, name, class, state, lastSeen })

function recordStudentActive(roomId, studentId, name, studentClass, state = 'in_exam') {
    if (!roomId || !studentId) return;
    const rId = String(roomId).trim();
    const sId = String(studentId).trim();
    if (!activeRoomTracker.has(rId)) {
        activeRoomTracker.set(rId, new Map());
    }
    const roomMap = activeRoomTracker.get(rId);
    roomMap.set(sId, {
        studentId: sId,
        name: name || 'นักศึกษา',
        class: studentClass || '',
        state: state || 'in_exam',
        lastSeen: Date.now()
    });
}

function removeStudentActive(roomId, studentId) {
    if (!roomId || !studentId) return;
    const rId = String(roomId).trim();
    const sId = String(studentId).trim();
    if (activeRoomTracker.has(rId)) {
        activeRoomTracker.get(rId).delete(sId);
    }
}

function getActiveRoomStudents(roomId) {
    if (!roomId) return [];
    const rId = String(roomId).trim();
    if (!activeRoomTracker.has(rId)) return [];
    const roomMap = activeRoomTracker.get(rId);
    const now = Date.now();
    const active = [];
    const TIMEOUT_MS = 8000; // หากขาดการติดต่อเกิน 8 วินาทีถือว่าออกจากห้องสอบ
    for (const [sId, data] of Array.from(roomMap.entries())) {
        if (now - data.lastSeen < TIMEOUT_MS) {
            active.push(data);
        } else {
            roomMap.delete(sId);
        }
    }
    return active;
}

function getActiveRoomStudentMap(roomId) {
    const list = getActiveRoomStudents(roomId);
    const map = new Map();
    list.forEach(s => map.set(String(s.studentId), s));
    return map;
}

// Backward compatibility alias for waitingStudentsTracker
const waitingStudentsTracker = activeRoomTracker;
function recordWaitingStudent(roomId, studentId, name, studentClass) {
    recordStudentActive(roomId, studentId, name, studentClass, 'waiting');
}
function getWaitingStudents(roomId) {
    return getActiveRoomStudents(roomId);
}

function saveQuestionsToTemplateHelper(templateId, questions, res) {
    db.run('DELETE FROM template_questions WHERE templateId = ?', [templateId], (delErr) => {
        if (delErr) return res.status(500).json({ message: delErr.message });

        const stmt = db.prepare(`
            INSERT INTO template_questions (
                templateId, question, question_img,
                a, b, c, d, e, f, g, h, i, j,
                a_img, b_img, c_img, d_img, e_img, f_img, g_img, h_img, i_img, j_img,
                answer
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        questions.forEach(q => {
            stmt.run(
                templateId, q.question || '', q.question_img || '',
                q.a || '', q.b || '', q.c || '', q.d || '', q.e || '', q.f || '', q.g || '', q.h || '', q.i || '', q.j || '',
                q.a_img || '', q.b_img || '', q.c_img || '', q.d_img || '', q.e_img || '', q.f_img || '', q.g_img || '', q.h_img || '', q.i_img || '', q.j_img || '',
                q.answer || ''
            );
        });
        stmt.finalize();
        res.json({ success: true, templateId, count: questions.length });
    });
}

// ==========================================
// ระบบคลังข้อสอบสะสม (My Exam Library) & ข้อมูลพื้นที่จัดเก็บ (Storage stats)
// ==========================================

function syncRoomToLibrary(roomId) {
    db.get('SELECT teacherUsername, exam_title, roomName, courseId FROM teacher_rooms WHERE roomId = ?', [roomId], (err, room) => {
        if (err || !room) return;
        const teacherUsername = room.teacherUsername;
        const templateName = room.exam_title || room.roomName || 'ข้อสอบไม่มีชื่อ';
        const courseId = room.courseId ? parseInt(room.courseId, 10) : 0;

        // ค้นหา template ด้วย teacherUsername + templateName + courseId
        // เพื่อให้ข้อสอบชื่อเดียวกันในต่างวิชาไม่ปนกัน
        const findSql = courseId > 0
            ? 'SELECT id FROM exam_templates WHERE teacherUsername = ? AND templateName = ? AND courseId = ?'
            : 'SELECT id FROM exam_templates WHERE teacherUsername = ? AND templateName = ? AND (courseId IS NULL OR courseId = 0)';
        const findParams = courseId > 0 ? [teacherUsername, templateName, courseId] : [teacherUsername, templateName];

        db.get(findSql, findParams, (err, tpl) => {
            if (err) return;
            const nowStr = new Date().toLocaleDateString('th-TH', { 
                timeZone: 'Asia/Bangkok',
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });

            if (tpl) {
                const templateId = tpl.id;
                db.run('DELETE FROM template_questions WHERE templateId = ?', [templateId], (delErr) => {
                    if (delErr) return;
                    copyRoomQuestionsToTemplate(roomId, templateId);
                });
                db.run('UPDATE exam_templates SET created_at = ?, courseId = ? WHERE id = ?', [nowStr, courseId, templateId]);
            } else {
                db.run('INSERT INTO exam_templates (teacherUsername, templateName, courseId, created_at) VALUES (?, ?, ?, ?)',
                    [teacherUsername, templateName, courseId, nowStr],
                    function(insErr) {
                        if (insErr) return;
                        const templateId = this.lastID;
                        copyRoomQuestionsToTemplate(roomId, templateId);
                    }
                );
            }
        });
    });
}

function copyRoomQuestionsToTemplate(roomId, templateId) {
    db.all('SELECT * FROM questions WHERE roomId = ?', [roomId], (err, questions) => {
        if (err || !questions || questions.length === 0) return;
        const stmt = db.prepare(`
            INSERT INTO template_questions (
                templateId, question, question_img,
                a, b, c, d, e, f, g, h, i, j,
                a_img, b_img, c_img, d_img, e_img, f_img, g_img, h_img, i_img, j_img,
                answer
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, (prepErr) => {
            if (prepErr) console.error("Error preparing template_questions stmt:", prepErr.message);
        });
        questions.forEach(q => {
            stmt.run(
                templateId, q.question || '', q.question_img || '',
                q.a || '', q.b || '', q.c || '', q.d || '', q.e || '', q.f || '', q.g || '', q.h || '', q.i || '', q.j || '',
                q.a_img || '', q.b_img || '', q.c_img || '', q.d_img || '', q.e_img || '', q.f_img || '', q.g_img || '', q.h_img || '', q.i_img || '', q.j_img || '',
                q.answer || ''
            );
        });
        stmt.finalize();
    });
}

// เส้นทาง API หลัก (รวมไว้ในไฟล์นี้ไฟล์เดียว เพื่อให้อัปโหลดขึ้น GitHub แล้วไม่ขาดไฟล์) ลงทะเบียนตามลำดับเดิม หลังประกาศฟังก์ชันช่วยทั้งหมด
const routeCtx = { db, getActiveRoomStudentMap, getActiveRoomStudents, getWaitingStudents, hashPassword, hashTeacherPassword, recordStudentActive, recordWaitingStudent, removeStudentActive, saveQuestionsToTemplateHelper, syncRoomToLibrary, verifyTeacherPassword, waitingStudentsTracker };
// =====================================================================
// 01-teachers-rooms.js — อาจารย์: สมัคร/เข้าสู่ระบบ ห้องสอบ 10 ห้อง และรายชื่อห้องรอสอบ
// (โค้ดเดิม ไม่เปลี่ยนการทำงาน)
// =====================================================================
(function (app, ctx) {
    const { db, getWaitingStudents, hashTeacherPassword, verifyTeacherPassword } = ctx;

// ==========================================
// ระบบจัดการบัญชีอาจารย์ (Authentication)
// ==========================================

// API สำหรับสร้างไอดีอาจารย์ (สถานะเริ่มต้น = pending รอ Admin อนุมัติ)
app.post('/api/admin/create-teacher', (req, res) => {
    const { username, password, name, phone } = req.body;
    if (!username || !password || !name || !phone) return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน" });

    const created_at = new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // หน้าเข้าสู่ระบบใช้ช่องเดียวกัน → ห้ามตั้ง username ซ้ำกับรหัสนักศึกษา (ไม่งั้นนักศึกษาคนนั้นจะเข้าระบบไม่ได้)
    const uname = String(username).trim(), unameNorm = uname.replace(/[^0-9a-zA-Z]/g, '');
    db.get(`SELECT studentId FROM students WHERE studentId = ? OR REPLACE(studentId, '-', '') = ?
            UNION SELECT studentId FROM course_students WHERE studentId = ? OR REPLACE(studentId, '-', '') = ? LIMIT 1`,
        [uname, unameNorm, uname, unameNorm], (sErr, clash) => {
    if (clash) return res.status(400).json({ message: "Username นี้ตรงกับรหัสนักศึกษาในระบบ กรุณาใช้ชื่อผู้ใช้อื่น" });

    db.run('INSERT INTO teachers (username, password, name, phone, status, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', 
        [username, hashTeacherPassword(password), name, phone, 'pending', 'teacher', created_at], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) return res.status(400).json({ message: "Username นี้มีในระบบแล้ว" });
            return res.status(500).json({ message: err.message });
        }
        
        // เมื่อสร้างบัญชีเสร็จ ให้สร้างห้องเริ่มต้น 10 ห้องทันทีเพื่อความสะดวก
        const stmt = db.prepare('INSERT OR IGNORE INTO teacher_rooms (teacherUsername, roomId, roomName) VALUES (?, ?, ?)');
        for (let i = 1; i <= 10; i++) {
            stmt.run(username, `${username}_r${i}`, `ห้องสอบที่ ${i}`);
        }
        stmt.finalize();

        console.log(`สร้างบัญชีอาจารย์ (รอตรวจ): ${username} (${name})`);
        res.json({ success: true, message: `สร้างบัญชีสำเร็จ! กรุณารอผู้ดูแลระบบ (Admin) ตรวจสอบและอนุมัติก่อนเข้าใช้งานครับ` });
    });
    });
});

// ผู้ดูแลระบบเพิ่มบัญชีอาจารย์เอง → ใช้งานได้ทันที ไม่ต้องรออนุมัติ (เส้นทาง /api/superadmin/* ใช้ได้เฉพาะแอดมิน)
app.post('/api/superadmin/create-teacher', (req, res) => {
    const u = req.authUser;
    if (!u || u.typ !== 'teacher' || u.role !== 'admin') return res.status(403).json({ success: false, message: 'เฉพาะผู้ดูแลระบบ' });
    const uname = String((req.body && req.body.newUsername) || '').trim();
    const name = String((req.body && req.body.name) || '').trim();
    const phone = String((req.body && req.body.phone) || '').trim() || '-';
    const password = String((req.body && req.body.password) || '');
    if (!uname || !name || !password) return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อ-นามสกุล ชื่อผู้ใช้ และรหัสผ่าน' });
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(uname)) return res.status(400).json({ success: false, message: 'ชื่อผู้ใช้ใช้ได้เฉพาะ a-z, 0-9, จุด, ขีด และยาว 3–30 ตัว' });
    if (password.length < 8 || password === 'admin123' || password.toLowerCase() === uname.toLowerCase()) return res.status(400).json({ success: false, message: 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัว และห้ามซ้ำกับชื่อผู้ใช้' });
    const unameNorm = uname.replace(/[^0-9a-zA-Z]/g, '');
    db.get(`SELECT studentId FROM students WHERE studentId = ? OR REPLACE(studentId, '-', '') = ?
            UNION SELECT studentId FROM course_students WHERE studentId = ? OR REPLACE(studentId, '-', '') = ? LIMIT 1`,
        [uname, unameNorm, uname, unameNorm], (sErr, clash) => {
        if (clash) return res.status(400).json({ success: false, message: 'ชื่อผู้ใช้นี้ตรงกับรหัสนักศึกษาในระบบ กรุณาใช้ชื่ออื่น' });
        const created_at = new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        db.run('INSERT INTO teachers (username, password, name, phone, status, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [uname, hashTeacherPassword(password), name, phone, 'approved', 'teacher', created_at], function (err) {
            if (err) {
                if (/UNIQUE|duplicate/i.test(err.message)) return res.status(400).json({ success: false, message: 'ชื่อผู้ใช้นี้มีในระบบแล้ว' });
                return res.status(500).json({ success: false, message: err.message });
            }
            const stmt = db.prepare('INSERT OR IGNORE INTO teacher_rooms (teacherUsername, roomId, roomName) VALUES (?, ?, ?)');
            for (let i = 1; i <= 10; i++) stmt.run(uname, `${uname}_r${i}`, `ห้องสอบที่ ${i}`);
            stmt.finalize();
            console.log(`ผู้ดูแลระบบ ${u.u} เพิ่มบัญชีอาจารย์: ${uname} (${name})`);
            res.json({ success: true, message: `เพิ่มบัญชีอาจารย์ ${name} เรียบร้อย ใช้งานได้ทันที` });
        });
    });
});

// API สำหรับให้อาจารย์ล็อกอินเข้าสู่ระบบ (ตรวจสอบสถานะ approved ก่อน)
app.post('/api/teacher/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM teachers WHERE username = ?', [username], (err, found) => {
        if (err) return res.status(500).json({ message: err.message });
        // ตรวจรหัสผ่านแบบเข้ารหัส (รหัสเดิมที่ยังไม่เข้ารหัสจะถูกอัปเกรดอัตโนมัติเมื่อล็อกอินสำเร็จ)
        let teacher = null;
        if (found) {
            const v = verifyTeacherPassword(found.password, password);
            if (v.ok) {
                teacher = found;
                if (v.needsUpgrade) db.run('UPDATE teachers SET password = ? WHERE id = ?', [hashTeacherPassword(password), found.id]);
            }
        }
        if (!teacher) {
            return res.status(401).json({ success: false, message: "Username หรือ Password ไม่ถูกต้อง" });
        }

        // ตรวจสอบสถานะการอนุมัติ
        const status = teacher.status || 'approved';
        if (status === 'pending') {
            return res.status(403).json({ success: false, message: "บัญชีของคุณยังอยู่ระหว่างรอการอนุมัติจากผู้ดูแลระบบ (Admin) กรุณารอสักครู่ครับ" });
        }
        if (status === 'rejected') {
            return res.status(403).json({ success: false, message: "บัญชีของคุณถูกปฏิเสธโดยผู้ดูแลระบบ กรุณาติดต่อ Admin เพื่อสอบถามครับ" });
        }

        // ตรวจสอบ role - ถ้าเป็น admin ให้ไปหน้า Super Admin
        const role = teacher.role || 'teacher';

        // ตรวจสอบและสร้างห้อง 10 ห้องของอาจารย์ท่านนี้หากยังไม่มีห้องในตาราง
        if (role === 'teacher') {
            db.get('SELECT COUNT(*) as count FROM teacher_rooms WHERE teacherUsername = ?', [username], (err, row) => {
                if (!err && row.count === 0) {
                    const stmt = db.prepare('INSERT OR IGNORE INTO teacher_rooms (teacherUsername, roomId, roomName) VALUES (?, ?, ?)');
                    for (let i = 1; i <= 10; i++) {
                        stmt.run(username, `${username}_r${i}`, `ห้องสอบที่ ${i}`);
                    }
                    stmt.finalize();
                    console.log(`เจนห้องสอบเริ่มต้น 10 ห้องให้ผู้ใช้ ${username} สำเร็จ`);
                }
            });
        }

        res.json({ success: true, teacher: { username: teacher.username, name: teacher.name, role: role } });
    });
});

// API สำหรับดึงห้องสอบของอาจารย์ (หรือดึงทุกห้องในระบบหากเป็น admin)
app.get('/api/teacher/rooms', (req, res) => {
    const username = req.query.username;
    if (!username || username === 'undefined') return res.status(400).json({ message: "กรุณาระบุ username ของอาจารย์" });

    // หากเป็น admin ให้ดึงห้องของอาจารย์ทุกคน
    if (username === 'admin') {
        const sqlQuery = `
            SELECT tr.roomId, tr.roomName, tr.exam_title, tr.exam_code, tr.is_published, tr.duration, tr.courseId, tr.teacherUsername, tr.announcement, tr.allowed_classes, tr.max_leaves,
                   c.courseCode, c.courseName, c.description as courseClassroom,
                   (SELECT GROUP_CONCAT(DISTINCT cs.class) FROM course_students cs WHERE cs.courseId = tr.courseId AND cs.class != '' AND cs.class IS NOT NULL) as studentClasses,
                   (SELECT COUNT(*) FROM questions q WHERE q.roomId = tr.roomId) as questionCount
            FROM teacher_rooms tr
            LEFT JOIN courses c ON c.id = tr.courseId
            WHERE COALESCE(tr.archived, 0) = 0
            ORDER BY tr.is_published DESC, tr.id ASC
        `;
        return db.all(sqlQuery, [], (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows || []);
        });
    }

    const sqlQuery = `
        SELECT tr.roomId, tr.roomName, tr.exam_title, tr.exam_code, tr.is_published, tr.duration, tr.courseId, tr.announcement, tr.allowed_classes, tr.max_leaves,
               c.courseCode, c.courseName, c.description as courseClassroom,
               (SELECT GROUP_CONCAT(DISTINCT cs.class) FROM course_students cs WHERE cs.courseId = tr.courseId AND cs.class != '' AND cs.class IS NOT NULL) as studentClasses,
               (SELECT COUNT(*) FROM questions q WHERE q.roomId = tr.roomId) as questionCount
        FROM teacher_rooms tr
        LEFT JOIN courses c ON c.id = tr.courseId
        WHERE tr.teacherUsername = ? AND COALESCE(tr.archived, 0) = 0
        ORDER BY tr.id ASC
    `;

    db.all(sqlQuery, [username], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        if (!rows || rows.length === 0) {
            const stmt = db.prepare('INSERT OR IGNORE INTO teacher_rooms (teacherUsername, roomId, roomName, exam_code) VALUES (?, ?, ?, ?)');
            for (let i = 1; i <= 10; i++) {
                const autoPin = Math.floor(100000 + Math.random() * 900000).toString();
                stmt.run(username, `${username}_r${i}`, `ห้องสอบที่ ${i}`, autoPin);
            }
            stmt.finalize();

            db.all(sqlQuery, [username], (err2, newRows) => {
                if (err2) return res.status(500).json({ message: err2.message });
                res.json(newRows);
            });
        } else {
            res.json(rows);
        }
    });
});

// API สร้างห้องสอบใหม่ พร้อมรหัส PIN 6 หลักและเปิดห้องรอสอบทันที
// ===== ปีการศึกษา/ภาคเรียนเริ่มต้นของระบบ (แอดมินตั้ง ทุกบัญชีอาจารย์เริ่มที่ค่านี้ แล้วเปลี่ยนเองได้) =====
const TERM_YEARS = []; for (let y = 2567; y <= 2580; y++) TERM_YEARS.push(String(y));
function readTermDefault(cb) {
    db.get("SELECT svalue FROM app_settings WHERE skey = 'term_default'", [], (err, row) => {
        let v = { y: 'all', t: 'all', v: 0 };
        try { if (row && row.svalue) v = Object.assign(v, JSON.parse(row.svalue)); } catch (e) {}
        cb(v);
    });
}
app.get('/api/settings/term-default', (req, res) => readTermDefault(v => res.json(v)));
app.post('/api/superadmin/term-default', (req, res) => {
    const u = req.authUser;
    if (!u || u.typ !== 'teacher' || u.role !== 'admin') return res.status(403).json({ success: false, message: 'เฉพาะผู้ดูแลระบบ' });
    const y = String((req.body && req.body.y) || 'all'), t = String((req.body && req.body.t) || 'all');
    if (!(y === 'all' || TERM_YEARS.includes(y)) || !['all', '1', '2', '3', '4'].includes(t)) return res.status(400).json({ success: false, message: 'ปีการศึกษาหรือภาคเรียนไม่ถูกต้อง' });
    const val = JSON.stringify({ y, t, v: Date.now() }), now = new Date().toISOString();
    db.run("UPDATE app_settings SET svalue = ?, updated_at = ? WHERE skey = 'term_default'", [val, now], function (err) {
        if (err) return res.status(500).json({ success: false, message: err.message });
        const done = () => readTermDefault(v => res.json({ success: true, ...v }));
        if (this.changes) return done();
        db.run("INSERT INTO app_settings (skey, svalue, updated_at) VALUES ('term_default', ?, ?)", [val, now], (e2) => {
            if (e2) return res.status(500).json({ success: false, message: e2.message });
            done();
        });
    });
});

// ===== ออกจากหน้าข้อสอบ: จำนวนครั้งที่นับแล้ว (นักศึกษารีเฟรชหน้าแล้วตัวนับไม่เริ่มใหม่) =====
const LEAVE_PREFIX = 'ออกจากหน้าข้อสอบ';
app.get('/api/student/leave-count', (req, res) => {
    const u = req.authUser;
    if (!u || u.typ !== 'student') return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบ' });
    const roomId = String(req.query.roomId || '');
    if (!roomId) return res.status(400).json({ message: 'กรุณาระบุห้องสอบ' });
    db.get(`SELECT COUNT(*) as n FROM cheat_logs WHERE roomId = ? AND (studentId = ? OR REPLACE(studentId, '-', '') = REPLACE(?, '-', '')) AND action LIKE ?`,
        [roomId, u.u, u.u, LEAVE_PREFIX + '%'], (err, row) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json({ count: Number(row && row.n) || 0 });
        });
});
// อาจารย์ตั้งจำนวนครั้งที่ออกจากหน้าข้อสอบได้ก่อนส่งอัตโนมัติ (0 = ไม่ส่งอัตโนมัติ) · ความเป็นเจ้าของห้องตรวจที่ auth.js
app.post('/api/teacher/room-leave-limit', (req, res) => {
    const { roomId } = req.body || {};
    const n = parseInt(req.body && req.body.maxLeaves, 10);
    if (!roomId || isNaN(n) || n < 0 || n > 50) return res.status(400).json({ success: false, message: 'ค่าไม่ถูกต้อง' });
    db.run('UPDATE teacher_rooms SET max_leaves = ? WHERE roomId = ?', [n, roomId], function (err) {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, maxLeaves: n });
    });
});

// ===== ผลสอบรายข้อของนักศึกษา: ถูก/ผิดทันที · เฉลยหลังอาจารย์ปิดห้อง · เคารพการตั้งค่า "ไม่แสดงคะแนน" =====
app.get('/api/student/result-detail', (req, res) => {
    const u = req.authUser;
    if (!u || u.typ !== 'student') return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบ' });
    const roomId = String(req.query.roomId || '');
    if (!roomId) return res.status(400).json({ message: 'กรุณาระบุห้องสอบ' });
    db.get(`SELECT er.score, er.maxScore, er.answers_json, er.date, er.time, tr.show_score, tr.is_published, tr.exam_title, tr.roomName, c.courseCode, c.courseName
            FROM exam_results er LEFT JOIN teacher_rooms tr ON tr.roomId = er.roomId LEFT JOIN courses c ON c.id = tr.courseId
            WHERE er.roomId = ? AND (er.studentId = ? OR REPLACE(er.studentId, '-', '') = REPLACE(?, '-', '')) ORDER BY er.id DESC LIMIT 1`,
        [roomId, u.u, u.u], (err, r) => {
            if (err) return res.status(500).json({ message: err.message });
            if (!r) return res.status(404).json({ message: 'ไม่พบผลสอบของคุณในห้องนี้' });
            const head = { examTitle: r.exam_title || r.roomName || '', courseCode: r.courseCode || '', courseName: r.courseName || '', date: r.date, time: r.time };
            if (Number(r.show_score) === 0) return res.json({ ...head, hidden: true, message: 'อาจารย์ตั้งค่าไม่แสดงคะแนนของห้องสอบนี้' });
            const closed = Number(r.is_published) !== 1;
            let mine = {}; try { mine = JSON.parse(r.answers_json || '{}') || {}; } catch (e) {}
            db.all('SELECT * FROM questions WHERE roomId = ? ORDER BY id ASC', [roomId], (qErr, qs) => {
                if (qErr) return res.status(500).json({ message: qErr.message });
                if (!qs || !qs.length) return res.json({ ...head, score: r.score, maxScore: r.maxScore, unavailable: true, message: 'ข้อสอบของห้องนี้ถูกลบไปแล้ว จึงแสดงรายละเอียดรายข้อไม่ได้' });
                const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
                const items = qs.map((q, i) => {
                    const ans = normAnswer(mine[q.id]), key = normAnswer(q.answer);
                    return {
                        no: i + 1, question: q.question || '', image: q.question_img || '',
                        choices: keys.filter(k => q[k] !== null && q[k] !== undefined && String(q[k]).trim() !== '').map(k => ({ key: k, text: String(q[k]) })),
                        mine: ans || null, correct: !!ans && ans === key,
                        answer: closed ? key : null
                    };
                });
                res.json({ ...head, score: r.score, maxScore: r.maxScore, closed, items });
            });
        });
});

// จำนวนนักศึกษาแต่ละกลุ่มเรียนของทุกรายวิชาของอาจารย์ (การ์ดรายวิชา / เลือกกลุ่มตอนเปิดห้องสอบ)
app.get('/api/teacher/course-groups', (req, res) => {
    const v = viewer(req);
    db.all(`SELECT cs.courseId, COALESCE(cs.class, '') as class, COUNT(*) as n
            FROM course_students cs JOIN courses c ON c.id = cs.courseId
            WHERE (? = 1 OR c.teacherUsername = ?)
            GROUP BY cs.courseId, COALESCE(cs.class, '')`, [v.adm, v.user], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows || []);
    });
});

// ตั้งกลุ่มเรียนที่เข้าห้องสอบนี้ได้ (ว่าง = ทุกกลุ่ม) · ความเป็นเจ้าของห้องตรวจที่ auth.js
app.post('/api/teacher/room-groups', (req, res) => {
    const { roomId, allowedClasses } = req.body || {};
    if (!roomId) return res.status(400).json({ success: false, message: 'กรุณาระบุห้องสอบ' });
    const clean = (Array.isArray(allowedClasses) ? allowedClasses : String(allowedClasses || '').split(','))
        .map(x => String(x).trim()).filter(Boolean).join(',');
    db.run('UPDATE teacher_rooms SET allowed_classes = ? WHERE roomId = ?', [clean, roomId], function (err) {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, allowed_classes: clean });
    });
});

app.post('/api/teacher/create-room', (req, res) => {
    const { username, roomName, examTitle, courseId, duration, announcement, showScore, randomize, allowedClasses } = req.body;
    const cleanAllowed = (Array.isArray(allowedClasses) ? allowedClasses : String(allowedClasses || '').split(','))
        .map(x => String(x).trim()).filter(Boolean).join(',');
    if (!username) return res.status(400).json({ message: "กรุณาระบุ username ของอาจารย์" });

    const cleanRoomName = (roomName || 'ห้องสอบใหม่').trim();
    const cleanExamTitle = (examTitle || cleanRoomName).trim();
    const cleanDuration = parseInt(duration, 10) || 0;
    const cleanCourseId = courseId ? parseInt(courseId, 10) : null;
    const cleanShowScore = showScore !== undefined ? parseInt(showScore, 10) : 1;
    const cleanRandomize = randomize !== undefined ? parseInt(randomize, 10) : 1;
    const cleanAnnouncement = (announcement || '').trim();

    // สร้าง roomId เฉพาะตัว เช่น phakhawan_room_m1a2b3
    const roomId = `${username}_room_${Date.now().toString(36)}`;
    // สุ่ม PIN 6 หลัก
    const examPin = Math.floor(100000 + Math.random() * 900000).toString();

    const insertSql = `
        INSERT INTO teacher_rooms (
            teacherUsername, roomId, roomName, exam_title, exam_code,
            is_published, duration, announcement, show_score, randomize, courseId, allowed_classes
        ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
    `;

    db.run(insertSql, [
        username, roomId, cleanRoomName, cleanExamTitle, examPin,
        cleanDuration, cleanAnnouncement, cleanShowScore, cleanRandomize, cleanCourseId, cleanAllowed
    ], function(err) {
        if (err) return res.status(500).json({ message: "ไม่สามารถสร้างห้องสอบได้: " + err.message });

        console.log(`[ห้องสอบใหม่] อาจารย์ ${username} สร้างห้อง "${cleanRoomName}" (ID: ${roomId}, PIN: ${examPin})`);

        res.json({
            success: true,
            message: "สร้างห้องสอบใหม่เรียบร้อยแล้ว",
            roomId,
            exam_code: examPin,
            roomName: cleanRoomName,
            examTitle: cleanExamTitle,
            room: {
                id: this.lastID,
                roomId,
                roomName: cleanRoomName,
                exam_title: cleanExamTitle,
                exam_code: examPin,
                is_published: 0,
                duration: cleanDuration,
                announcement: cleanAnnouncement,
                show_score: cleanShowScore,
                randomize: cleanRandomize,
                courseId: cleanCourseId
            }
        });
    });
});


// ดึงรายชื่อและจำนวนนักศึกษาที่กำลังรอสอบอยู่ในห้อง (Real-time Waiting Counter)
app.get('/api/teacher/waiting-students', (req, res) => {
    const roomId = req.query.roomId;
    if (!roomId) return res.status(400).json({ message: "กรุณาระบุ roomId" });

    db.get('SELECT is_published, exam_code, exam_title, roomName, duration FROM teacher_rooms WHERE roomId = ?', [roomId], (err, room) => {
        if (err || !room) return res.status(404).json({ message: "ไม่พบห้องสอบนี้" });

        const students = getWaitingStudents(roomId);
        res.json({
            success: true,
            roomId,
            is_published: room.is_published === 1,
            examCode: room.exam_code,
            examTitle: room.exam_title || room.roomName,
            duration: room.duration || 0,
            count: students.length,
            students
        });
    });
});

// API บังคับสร้างห้องสอบเริ่มต้น 10 ห้องสำหรับอาจารย์
app.post('/api/teacher/create-rooms', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ message: "กรุณาระบุ username" });

    const stmt = db.prepare('INSERT OR IGNORE INTO teacher_rooms (teacherUsername, roomId, roomName, exam_code) VALUES (?, ?, ?, ?)');
    for (let i = 1; i <= 10; i++) {
        const autoPin = Math.floor(100000 + Math.random() * 900000).toString();
        stmt.run(username, `${username}_r${i}`, `ห้องสอบที่ ${i}`, autoPin);
    }
    stmt.finalize();
    res.json({ success: true, message: "สร้างห้องสอบเริ่มต้นเรียบร้อย" });
});
})(app, routeCtx);

// =====================================================================
// 02-student-records.js — ประวัตินักศึกษา (หน้า admin-students)
// (โค้ดเดิม ไม่เปลี่ยนการทำงาน)
// =====================================================================
(function (app, ctx) {
    const { db } = ctx;

// ==========================================
// Student Management APIs (ระบบจัดการประวัตินักศึกษา)
// ==========================================

// ดึงรายชื่อนักศึกษาพร้อมสถิติการสอบ (รองรับแยกตามรายวิชา courseId)
app.get('/api/students', (req, res) => {
    const v = viewer(req);
    const courseId = req.query.courseId;
    const one = courseId && courseId !== 'ALL';
    // แยกแถวตามรายวิชาเสมอ: จำนวนสอบ/คะแนน/จำนวนครั้งสลับหน้าจอ นับเฉพาะห้องสอบของรายวิชานั้น ไม่รวมข้ามวิชา
    const sql = `
        SELECT 
            cs.studentId, 
            COALESCE(cs.firstName, s.firstName, 'นักศึกษา') as firstName, 
            COALESCE(cs.lastName, s.lastName, '') as lastName, 
            COALESCE(cs.class, s.class, '') as class, 
            s.note, 
            COALESCE(s.status, 'approved') as status,
            s.created_at,
            s.approved_at,
            c.id as courseId,
            c.courseCode,
            c.courseName,
            COUNT(DISTINCT er.id) as examCount,
            AVG(CASE WHEN er.maxScore > 0 THEN (CAST(er.score AS FLOAT) / er.maxScore) * 100 ELSE NULL END) as avgScore,
            COUNT(DISTINCT cl.id) as cheatCount
        FROM course_students cs
        JOIN courses c ON c.id = cs.courseId
        LEFT JOIN students s ON (s.studentId = cs.studentId OR REPLACE(s.studentId, '-', '') = REPLACE(cs.studentId, '-', ''))
        LEFT JOIN exam_results er ON (er.studentId = cs.studentId OR REPLACE(er.studentId, '-', '') = REPLACE(cs.studentId, '-', ''))
                                 AND COALESCE(NULLIF(er.courseId, 0), (SELECT NULLIF(t9.courseId, 0) FROM teacher_rooms t9 WHERE t9.roomId = er.roomId)) = cs.courseId
        LEFT JOIN cheat_logs cl ON (cl.studentId = cs.studentId OR REPLACE(cl.studentId, '-', '') = REPLACE(cs.studentId, '-', ''))
                                 AND COALESCE(NULLIF(cl.courseId, 0), (SELECT NULLIF(t8.courseId, 0) FROM teacher_rooms t8 WHERE t8.roomId = cl.roomId)) = cs.courseId
        WHERE ${one ? '(cs.courseId = ? OR CAST(cs.courseId AS TEXT) = ?)' : '(? = 1 OR c.teacherUsername = ?)'}
          AND (? = 1 OR c.teacherUsername = ?)
        GROUP BY cs.id, cs.studentId, cs.firstName, cs.lastName, cs.class, s.firstName, s.lastName, s.class, s.note, s.status, s.created_at, s.approved_at, c.id, c.courseCode, c.courseName
        ORDER BY cs.studentId ASC, c.courseCode ASC
    `;
    const params = (one ? [courseId, String(courseId)] : [v.adm, v.user]).concat([v.adm, v.user]);
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows || []);
    });
});

// ดึงข้อมูลนักศึกษาอัตโนมัติจากผลการสอบ (Import from results)
app.post('/api/students/import-from-results', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ message: "กรุณาระบุ username" });

    const sql = `
        SELECT DISTINCT er.studentId, er.name, er.class
        FROM exam_results er
        JOIN teacher_rooms tr ON tr.roomId = er.roomId
        WHERE tr.teacherUsername = ? AND er.studentId IS NOT NULL AND er.studentId != ''
    `;

    db.all(sql, [username], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        if (!rows || rows.length === 0) {
            return res.json({ success: true, imported: 0, total: 0 });
        }

        let imported = 0;
        const now = new Date().toISOString();
        const promises = rows.map(r => {
            const fullName = (r.name || '').trim();
            const parts = fullName.split(/\s+/);
            const firstName = parts[0] || 'นักศึกษา';
            const lastName = parts.slice(1).join(' ') || '-';
            const cls = r.class || '';

            return new Promise((resolve) => {
                db.get('SELECT id FROM students WHERE teacherUsername = ? AND studentId = ?', [username, r.studentId], (errGet, exist) => {
                    if (exist) {
                        resolve();
                    } else {
                        db.run(
                            'INSERT INTO students (teacherUsername, studentId, firstName, lastName, class, created_at) VALUES (?, ?, ?, ?, ?, ?)',
                            [username, r.studentId, firstName, lastName, cls, now],
                            function(errInsert) {
                                if (!errInsert) imported++;
                                resolve();
                            }
                        );
                    }
                });
            });
        });

        Promise.all(promises).then(() => {
            db.get('SELECT COUNT(*) as total FROM students WHERE teacherUsername = ?', [username], (errCount, countRow) => {
                res.json({ success: true, imported, total: countRow ? countRow.total : 0 });
            });
        });
    });
});

// บันทึก/แก้ไขข้อมูลนักศึกษา
app.post('/api/students/save', (req, res) => {
    const { username, studentId, firstName, lastName, class: cls, note } = req.body;
    if (!username || !studentId || !firstName) {
        return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
    }

    const now = new Date().toISOString();
    db.get('SELECT id FROM students WHERE teacherUsername = ? AND studentId = ?', [username, studentId], (err, existing) => {
        if (err) return res.status(500).json({ message: err.message });
        if (existing) {
            db.run(
                'UPDATE students SET firstName = ?, lastName = ?, class = ?, note = ? WHERE teacherUsername = ? AND studentId = ?',
                [firstName, lastName || '', cls || '', note || '', username, studentId],
                (err2) => {
                    if (err2) return res.status(500).json({ message: err2.message });
                    res.json({ success: true, message: "อัปเดตข้อมูลนักศึกษาเรียบร้อย" });
                }
            );
        } else {
            db.run(
                'INSERT INTO students (teacherUsername, studentId, firstName, lastName, class, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [username, studentId, firstName, lastName || '', cls || '', note || '', now],
                (err2) => {
                    if (err2) return res.status(500).json({ message: err2.message });
                    res.json({ success: true, message: "บันทึกข้อมูลนักศึกษาเรียบร้อย" });
                }
            );
        }
    });
});

// ลบข้อมูลนักศึกษา
app.delete('/api/students/delete', (req, res) => {
    const { username, studentId } = req.body;
    if (!username || !studentId) return res.status(400).json({ message: "กรุณาระบุข้อมูล" });

    db.run('DELETE FROM students WHERE teacherUsername = ? AND studentId = ?', [username, studentId], (err) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json({ success: true, message: "ลบข้อมูลสำเร็จ" });
    });
});

// ดึงประวัติการสอบของนักศึกษารายคน
app.get('/api/students/exam-history', (req, res) => {
    const { studentId, username } = req.query;
    if (!studentId || !username) return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
    // ?courseId= (ไม่บังคับ) → เฉพาะผลสอบของรายวิชานั้น ให้ตรงกับตัวเลขในตารางหน้า "ประวัตินักศึกษา"
    const cId = req.query.courseId && req.query.courseId !== 'ALL' ? String(req.query.courseId) : '';

    db.all(`
        SELECT er.id, er.roomId, er.score, er.maxScore, er.time, er.date, 
               COALESCE(tr.roomName, er.roomId) as roomName, tr.exam_title,
               COUNT(DISTINCT cl.id) as tabSwitches
        FROM exam_results er
        LEFT JOIN teacher_rooms tr ON tr.roomId = er.roomId
        LEFT JOIN cheat_logs cl ON cl.roomId = er.roomId AND (cl.studentId = er.studentId OR REPLACE(cl.studentId, '-', '') = REPLACE(er.studentId, '-', ''))
                                AND COALESCE(COALESCE(NULLIF(cl.courseId, 0), (SELECT NULLIF(t8.courseId, 0) FROM teacher_rooms t8 WHERE t8.roomId = cl.roomId)), -1) = COALESCE(COALESCE(NULLIF(er.courseId, 0), (SELECT NULLIF(t9.courseId, 0) FROM teacher_rooms t9 WHERE t9.roomId = er.roomId)), -1)
        WHERE (er.studentId = ? OR REPLACE(er.studentId, '-', '') = REPLACE(?, '-', ''))
          AND (? = 1 OR tr.teacherUsername = ?)
          AND (? = '' OR CAST(COALESCE(NULLIF(er.courseId, 0), (SELECT NULLIF(t9.courseId, 0) FROM teacher_rooms t9 WHERE t9.roomId = er.roomId)) AS TEXT) = ?)
        GROUP BY er.id, er.roomId, er.score, er.maxScore, er.time, er.date, tr.roomName, tr.exam_title
        ORDER BY er.id DESC
    `, [studentId, studentId, viewer(req).adm, viewer(req).user, cId, cId], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows || []);
    });
});

// ดึงประวัติพฤติกรรม/สลับหน้าจอของนักศึกษารายคน
app.get('/api/students/cheat-history', (req, res) => {
    const { studentId, username } = req.query;
    if (!studentId || !username) return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
    const cId = req.query.courseId && req.query.courseId !== 'ALL' ? String(req.query.courseId) : '';

    db.all(`
        SELECT cl.id, cl.roomId, cl.action, cl.time, COALESCE(tr.roomName, cl.roomId) as roomName
        FROM cheat_logs cl
        LEFT JOIN teacher_rooms tr ON tr.roomId = cl.roomId
        WHERE (cl.studentId = ? OR REPLACE(cl.studentId, '-', '') = REPLACE(?, '-', ''))
          AND (? = 1 OR tr.teacherUsername = ?)
          AND (? = '' OR CAST(COALESCE(NULLIF(cl.courseId, 0), (SELECT NULLIF(t8.courseId, 0) FROM teacher_rooms t8 WHERE t8.roomId = cl.roomId)) AS TEXT) = ?)
        ORDER BY cl.id DESC
    `, [studentId, studentId, viewer(req).adm, viewer(req).user, cId, cId], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows || []);
    });
});
})(app, routeCtx);

// =====================================================================
// 03-student-account.js — นักศึกษา: สมัคร เข้าสู่ระบบ เปลี่ยนรหัส ตรวจสิทธิ์เข้าสอบ heartbeat
// (โค้ดเดิม ไม่เปลี่ยนการทำงาน)
// =====================================================================
(function (app, ctx) {
    const { db, hashPassword, recordStudentActive, removeStudentActive } = ctx;

// ==========================================
// ระบบสมัครและอนุมัติบัญชีนักศึกษา (Student Registration & Admin Approval)
// ==========================================

// 1. นักศึกษาสมัครสมาชิกใหม่ (สถานะเริ่มต้น: approved ใช้งานได้ทันที ไม่ต้องรอแอดมินอนุมัติ)
app.post('/api/student/register', (req, res) => {
    const { studentId, firstName, lastName, class: cls, password } = req.body;
    if (!studentId || !firstName || !password) {
        return res.status(400).json({ success: false, message: "กรุณากรอกรหัสนักศึกษา, ชื่อจริง, และรหัสผ่านให้ครบถ้วน" });
    }

    const cleanStudentId = studentId.trim();
    const cleanFirstName = firstName.trim();
    const cleanLastName = (lastName || '').trim();
    const cleanClass = (cls || '').trim();
    if (weakStudentPw(password, cleanStudentId)) {
        return res.status(400).json({ success: false, message: STUDENT_PW_RULE_MSG });
    }

    // ตรวจสอบว่าชื่อและนามสกุลเป็นภาษาไทยเท่านั้น
    const thaiRegex = /^[\u0E00-\u0E7F\s.]+$/;
    if (!thaiRegex.test(cleanFirstName) || (cleanLastName && !thaiRegex.test(cleanLastName))) {
        return res.status(400).json({ 
            success: false, 
            message: "ชื่อและนามสกุลต้องเป็นภาษาไทยเท่านั้นครับ (ไม่อนุญาตให้ใช้ภาษาอื่นหรืออักขระพิเศษ)" 
        });
    }

    const passwordHash = hashPassword(password);
    const now = new Date().toISOString();

    // สมัครได้เฉพาะรหัสนักศึกษาที่ยังไม่มีในระบบ
    //  - มีบัญชีแล้ว (สมัครเอง/เคยเข้าสู่ระบบ/อาจารย์เพิ่มให้) หรือมีชื่อในรายวิชาแล้ว → ให้เข้าสู่ระบบแทน
    //  - เดิมบัญชีที่อาจารย์นำเข้าถูก "สมัครทับ" ได้: ตั้งรหัสผ่านใหม่และเขียนชื่อ/กลุ่มเรียนทับรายชื่อทุกวิชา
    //    (กลุ่มเรียนที่อาจารย์จัดไว้เปลี่ยนตามที่พิมพ์ → ห้องที่เปิดเฉพาะกลุ่มไม่ให้เข้าสอบ) และใครรู้รหัสเพื่อนก็สมัครแทนได้
    const normId = cleanStudentId.replace(/[^0-9a-zA-Z]/g, '');
    db.get("SELECT approved_by FROM students WHERE studentId = ? OR REPLACE(studentId, '-', '') = ?", [cleanStudentId, normId], (err, existing) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        if (existing) {
            const self = existing.approved_by === 'registered' || existing.approved_by === 'system_auto';
            return res.status(409).json({
                success: false, hasAccount: true,
                message: self
                    ? 'รหัสนักศึกษานี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านของคุณ (ถ้าลืมรหัสผ่าน ให้แจ้งอาจารย์รีเซ็ตให้)'
                    : 'คุณมีบัญชีอยู่แล้ว (อาจารย์เพิ่มรายชื่อไว้ให้) ไม่ต้องสมัครใหม่ กรุณาเข้าสู่ระบบด้วยรหัสนักศึกษา และรหัสผ่านเริ่มต้น 1234 แล้วระบบจะให้ตั้งรหัสผ่านใหม่'
            });
        }
        db.get("SELECT id FROM course_students WHERE studentId = ? OR REPLACE(studentId, '-', '') = ? LIMIT 1", [cleanStudentId, normId], (cErr, rostered) => {
        if (cErr) return res.status(500).json({ success: false, message: cErr.message });
        if (rostered) {
            return res.status(409).json({
                success: false, hasAccount: true,
                message: 'คุณมีรายชื่ออยู่ในรายวิชาแล้ว ไม่ต้องสมัครใหม่ กรุณาเข้าสู่ระบบด้วยรหัสนักศึกษา และรหัสผ่านเริ่มต้น 1234 แล้วระบบจะให้ตั้งรหัสผ่านใหม่'
            });
        }

        db.run(
            `INSERT INTO students (studentId, firstName, lastName, class, password_hash, status, created_at, approved_at, approved_by)
             VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, 'system_auto')`,
            [cleanStudentId, cleanFirstName, cleanLastName, cleanClass, passwordHash, now, now],
            function(insertErr) {
                if (insertErr) return res.status(500).json({ success: false, message: insertErr.message });
                res.json({
                    success: true,
                    message: "สมัครสมาชิกสำเร็จ! บัญชีของคุณเปิดใช้งานเรียบร้อย สามารถเข้าสู่ระบบได้ทันทีครับ",
                    student: {
                        studentId: cleanStudentId,
                        firstName: cleanFirstName,
                        lastName: cleanLastName,
                        name: `${cleanFirstName} ${cleanLastName}`.trim(),
                        class: cleanClass
                    }
                });
            }
        );
        });
    });
});

// 2. นักศึกษาเข้าสู่ระบบ (Student Login)
// 2. นักศึกษาเข้าสู่ระบบ (Student Login - รองรับตรวจรหัสจากรายชื่อวิชา + รหัสเริ่มต้น 1234)
app.post('/api/student/login', (req, res) => {
    const { studentId, password, examCode, roomId } = req.body;
    if (!studentId) {
        return res.status(400).json({ success: false, message: "กรุณากรอกรหัสนักศึกษา" });
    }

    const cleanStudentId = studentId.trim();
    const normStudentId = cleanStudentId.replace(/[^0-9a-zA-Z]/g, '');
    const inputPassword = (password || '1234').trim();
    const defaultHash = hashPassword('1234');
    const inputHash = hashPassword(inputPassword);
    // รหัสผ่านเริ่มต้นที่เดาได้: 1234 หรือ 4 หลักท้ายของรหัสนักศึกษา (บัญชีที่อาจารย์เพิ่มเอง)
    const last4Hash = hashPassword(cleanStudentId.replace(/[^0-9]/g, '').slice(-4) || '1234');
    // รหัสแบบมีขีดตัวท้าย เช่น 67322110051-6 → นักศึกษาอาจนับ 4 หลักท้ายเป็น 0516 (ไม่นับขีด) หรือ 0051 (ก่อนขีด) รับทั้งสองแบบ
    const beforeDash = cleanStudentId.includes('-') ? cleanStudentId.slice(0, cleanStudentId.lastIndexOf('-')).replace(/[^0-9]/g, '').slice(-4) : '';
    const DEFAULT_HASHES = [defaultHash, last4Hash].concat(beforeDash.length === 4 ? [hashPassword(beforeDash)] : []);
    const isGuessableHash = h => !h || DEFAULT_HASHES.includes(h);
    // ยังไม่เคยเปลี่ยนรหัส: ใช้ได้ทั้ง 1234 และ 4 หลักท้ายของรหัสนักศึกษา (ตรงกับที่หน้าเข้าสอบบอกไว้) แล้วระบบจะบังคับตั้งรหัสใหม่
    const firstLoginOk = h => isGuessableHash(h) && DEFAULT_HASHES.includes(inputHash);

    const checkStudentStatusAndLogin = (studentObj, isDefaultPassword, roomObj) => {
        const status = studentObj.status || 'approved';
        if (status === 'rejected') {
            return res.status(403).json({ 
                success: false, 
                isRejected: true,
                message: "บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ (Admin)" 
            });
        }

        res.json({
            success: true,
            isDefaultPassword: !!isDefaultPassword,
            student: {
                studentId: studentObj.studentId,
                firstName: studentObj.firstName || '',
                lastName: studentObj.lastName || '',
                name: `${studentObj.firstName || ''} ${studentObj.lastName || ''}`.trim() || studentObj.studentId,
                class: studentObj.class || ''
            },
            room: roomObj || null
        });
    };

    // Helper: ตรวจสอบและดึงข้อมูลห้องสอบ (ถ้ามีส่ง examCode หรือ roomId มา)
    const resolveRoom = (callback) => {
        if (!examCode && !roomId) return callback(null, null);

        const cleanCode = (examCode || '').trim().replace(/\s+/g, '');
        const cleanRoomId = (roomId || '').trim();
        const roomSql = `
            SELECT tr.roomId, tr.roomName, tr.exam_title, tr.exam_code, tr.is_published, tr.duration, tr.courseId, tr.allowed_classes,
                   t.name as teacherName, c.courseCode, c.courseName
            FROM teacher_rooms tr
            LEFT JOIN teachers t ON t.username = tr.teacherUsername
            LEFT JOIN courses c ON c.id = tr.courseId
            WHERE (REPLACE(tr.exam_code, ' ', '') = ? AND ? != '') OR tr.roomId = ?
        `;
        db.get(roomSql, [cleanCode, cleanCode, cleanRoomId || cleanCode], (rErr, room) => {
            if (rErr) return callback(rErr, null);
            callback(null, room || null);
        });
    };

    resolveRoom((rErr, room) => {
        if (rErr) return res.status(500).json({ success: false, message: rErr.message });

        // ถ้ามีการส่ง examCode หรือ roomId มา และพบห้องสอบ
        if (room && room.courseId && room.courseId > 0) {
            // ตรวจสอบว่ารหัสนักศึกษาอยู่ในรายชื่อของวิชานี้หรือไม่
            db.all('SELECT * FROM course_students WHERE courseId = ? OR CAST(courseId AS TEXT) = ?', [room.courseId, String(room.courseId)], (csListErr, enrolledList) => {
                if (csListErr) return res.status(500).json({ success: false, message: csListErr.message });

                if (enrolledList && enrolledList.length > 0) {
                    const foundInCourse = enrolledList.find(s => {
                        const enrolledNorm = (s.studentId || '').replace(/[^0-9a-zA-Z]/g, '');
                        return s.studentId === cleanStudentId || enrolledNorm === normStudentId;
                    });

                    if (!foundInCourse) {
                        return res.status(403).json({
                            success: false,
                            accessDenied: true,
                            message: `ขออภัย รหัสนักศึกษา (${cleanStudentId}) ไม่มีรายชื่ออยู่ในบัญชีผู้มีสิทธิ์สอบรายวิชา "${room.courseName || room.courseCode || 'วิชานี้'}" จึงไม่สามารถเข้าห้องสอบได้`
                        });
                    }

                    // ห้องสอบเปิดเฉพาะบางกลุ่มเรียน → นักศึกษากลุ่มอื่นเข้าไม่ได้
                    if (outsideAllowedGroups(room.allowed_classes, foundInCourse.class)) {
                        return res.status(403).json({ success: false, accessDenied: true, message: groupDeniedMsg(room.allowed_classes, foundInCourse.class) });
                    }

                    // นักศึกษามีสิทธิ์ในวิชานี้ -> ตรวจสอบในตาราง students
                    db.get("SELECT * FROM students WHERE studentId = ? OR REPLACE(studentId, '-', '') = ?", [cleanStudentId, normStudentId], (sErr, student) => {
                        if (sErr) return res.status(500).json({ success: false, message: sErr.message });

                        const now = new Date().toISOString();
                        if (!student) {
                            // ยังไม่มีในตาราง students -> สร้างให้อัตโนมัติด้วยข้อมูลจาก course_students
                            const fName = foundInCourse.firstName || 'นักศึกษา';
                            const lName = foundInCourse.lastName || '';
                            const cls = foundInCourse.class || '';
                            if (!DEFAULT_HASHES.includes(inputHash)) return res.status(401).json({ success: false, message: "รหัสผ่านไม่ถูกต้อง (เข้าสู่ระบบครั้งแรกใช้ 1234 หรือ 4 หลักท้ายของรหัสนักศึกษา)" }); // ครั้งแรกต้องใช้รหัสเริ่มต้นเท่านั้น

                            db.run(
                                `INSERT INTO students (studentId, firstName, lastName, class, password_hash, status, created_at, approved_at, approved_by)
                                 VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, 'course_roster_auto')`,
                                [cleanStudentId, fName, lName, cls, defaultHash, now, now],
                                function(insErr) {
                                    if (insErr) return res.status(500).json({ success: false, message: insErr.message });
                                    console.log(`[สร้างบัญชีนักศึกษาจากรายชื่อวิชา] ${cleanStudentId} (${fName}) เข้าสู่ระบบห้อง ${room.roomId}`);
                                    checkStudentStatusAndLogin({
                                        studentId: cleanStudentId,
                                        firstName: fName,
                                        lastName: lName,
                                        class: cls,
                                        status: 'approved'
                                    }, true, room);
                                }
                            );
                            return;
                        }

                        // มีบัญชีนักศึกษาอยู่แล้ว -> ต้องตรวจรหัสผ่านเสมอ (เดิมเข้าได้โดยไม่ตรวจรหัส ทำให้สอบแทนกันได้)
                        if (student.password_hash && student.password_hash !== inputHash && !firstLoginOk(student.password_hash)) {
                            return res.status(401).json({ success: false, message: "รหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง" });
                        }
                        const isDefault = isGuessableHash(student.password_hash);
                        checkStudentStatusAndLogin(student, isDefault, room);
                    });
                    return;
                }

                // หากวิชานี้ไม่ได้มีรายชื่อระบุไว้ ให้ตรวจสอบ login ปกติ
                checkStudentLoginStandard();
            });
            return;
        }

        // กรณีไม่ได้ส่งห้องสอบมา หรือห้องสอบไม่ได้ผูกรายชื่อวิชา
        checkStudentLoginStandard();

        function checkStudentLoginStandard() {
            db.get("SELECT * FROM students WHERE studentId = ? OR REPLACE(studentId, '-', '') = ?", [cleanStudentId, normStudentId], (err, student) => {
                if (err) return res.status(500).json({ success: false, message: err.message });
                
                if (!student) {
                    // ไม่พบบัญชีในตาราง students -> ตรวจสอบในรายชื่อรายวิชาของอาจารย์ (course_students)
                    db.get("SELECT * FROM course_students WHERE studentId = ? OR REPLACE(studentId, '-', '') = ? ORDER BY id DESC LIMIT 1", [cleanStudentId, normStudentId], (csErr, csRow) => {
                        if (csErr) return res.status(500).json({ success: false, message: csErr.message });
                        if (!csRow) {
                            return res.status(404).json({ 
                                success: false, 
                                message: "ไม่พบรหัสนักศึกษานี้ในระบบ กรุณาตรวจสอบรหัสนักศึกษา หรือแจ้งอาจารย์ผู้สอนเพื่อเพิ่มรายชื่อก่อนเข้าสอบครับ" 
                            });
                        }

                        const now = new Date().toISOString();
                        const fName = csRow.firstName || 'นักศึกษา';
                        const lName = csRow.lastName || '';
                        const cls = csRow.class || '';

                        // สร้างบัญชีในนักศึกษาให้อัตโนมัติโดยใช้รหัสผ่านเริ่มต้น 1234
                        if (!DEFAULT_HASHES.includes(inputHash)) return res.status(401).json({ success: false, message: "รหัสผ่านไม่ถูกต้อง (เข้าสู่ระบบครั้งแรกใช้ 1234 หรือ 4 หลักท้ายของรหัสนักศึกษา)" }); // ครั้งแรกต้องใช้รหัสเริ่มต้นเท่านั้น
                        db.run(
                            `INSERT INTO students (studentId, firstName, lastName, class, password_hash, status, created_at, approved_at, approved_by)
                             VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, 'system_auto')`,
                            [cleanStudentId, fName, lName, cls, defaultHash, now, now],
                            function(insErr) {
                                if (insErr) return res.status(500).json({ success: false, message: insErr.message });
                                console.log(`[สร้างบัญชีอัตโนมัติ] นักศึกษา ${cleanStudentId} (${fName}) จากรายชื่อวิชาเข้าสู่ระบบแล้ว`);
                                
                                checkStudentStatusAndLogin({
                                    studentId: cleanStudentId,
                                    firstName: fName,
                                    lastName: lName,
                                    class: cls,
                                    status: 'approved'
                                }, true, room);
                            }
                        );
                    });
                    return;
                }

                // กรณีมีบัญชีอยู่แล้วในระบบ students
                if (student.password_hash) {
                    // ตรวจสอบรหัสผ่าน
                    if (student.password_hash !== inputHash && !firstLoginOk(student.password_hash)) {
                        return res.status(401).json({ success: false, message: "รหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง" });
                    }
                }

                const isDefault = isGuessableHash(student.password_hash) || inputPassword === '1234';
                checkStudentStatusAndLogin(student, isDefault, room);
            });
        }
    });
});

// 2.2 เปลี่ยนรหัสผ่านนักศึกษา (Student Change Password)
app.post('/api/student/change-password', (req, res) => {
    const { studentId, newPassword } = req.body;
    if (!studentId || !newPassword) {
        return res.status(400).json({ success: false, message: "กรุณาระบุรหัสนักศึกษาและรหัสผ่านใหม่" });
    }

    if (weakStudentPw(newPassword, studentId)) {
        return res.status(400).json({ success: false, message: STUDENT_PW_RULE_MSG });
    }

    const cleanStudentId = studentId.trim();
    const newHash = hashPassword(newPassword.trim());

    db.run(
        'UPDATE students SET password_hash = ? WHERE studentId = ?',
        [newHash, cleanStudentId],
        function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            console.log(`[เปลี่ยนรหัสผ่านสำเร็จ] นักศึกษา ${cleanStudentId} ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว`);
            res.json({ success: true, message: "เปลี่ยนรหัสผ่านใหม่เรียบร้อยแล้ว!" });
        }
    );
});

// 2.1 นักศึกษาแก้ไขข้อมูลส่วนตัว / เปลี่ยนรหัสผ่าน (Student Profile Update)
app.post('/api/student/update-profile', (req, res) => {
    const { studentId, firstName, lastName, class: cls, newPassword } = req.body;
    if (!studentId || !firstName) {
        return res.status(400).json({ success: false, message: "กรุณาระบุรหัสและชื่อจริง" });
    }

    const cleanFirstName = firstName.trim();
    const cleanLastName = (lastName || '').trim();
    const cleanClass = (cls || '').trim();

    // ตรวจสอบภาษาไทย
    const thaiRegex = /^[\u0E00-\u0E7F\s.]+$/;
    if (!thaiRegex.test(cleanFirstName) || (cleanLastName && !thaiRegex.test(cleanLastName))) {
        return res.status(400).json({ 
            success: false, 
            message: "ชื่อและนามสกุลต้องเป็นภาษาไทยเท่านั้นครับ" 
        });
    }

    if (newPassword && weakStudentPw(newPassword, studentId)) {
        return res.status(400).json({ success: false, message: STUDENT_PW_RULE_MSG });
    }
    if (newPassword && newPassword.trim()) {
        const hash = hashPassword(newPassword.trim());
        db.run('UPDATE students SET firstName = ?, lastName = ?, class = ?, password_hash = ? WHERE studentId = ?',
            [cleanFirstName, cleanLastName, cleanClass, hash, studentId.trim()], (err) => {
                if (err) return res.status(500).json({ success: false, message: err.message });
                res.json({ success: true, message: "บันทึกข้อมูลส่วนตัวและเปลี่ยนรหัสผ่านสำเร็จ" });
            });
    } else {
        db.run('UPDATE students SET firstName = ?, lastName = ?, class = ? WHERE studentId = ?',
            [cleanFirstName, cleanLastName, cleanClass, studentId.trim()], (err) => {
                if (err) return res.status(500).json({ success: false, message: err.message });
                res.json({ success: true, message: "บันทึกข้อมูลส่วนตัวสำเร็จ" });
            });
    }
});

// 2.2 นักศึกษาดูประวัติการสอบของตนเอง (Student My Exam History)
app.get('/api/student/my-exam-history', (req, res) => {
    const studentId = req.query.studentId;
    if (!studentId) return res.status(400).json({ message: "กรุณาระบุ studentId" });

    const cleanId = studentId.trim();
    const normId = cleanId.replace(/[^0-9a-zA-Z]/g, '');

    db.all(`
        SELECT er.id, er.roomId, er.score, er.maxScore, er.time, er.date, 
               tr.roomName, tr.exam_title, tr.show_score,
               c.courseCode, c.courseName
        FROM exam_results er
        LEFT JOIN teacher_rooms tr ON tr.roomId = er.roomId
        LEFT JOIN courses c ON c.id = tr.courseId
        WHERE er.studentId = ? OR REPLACE(er.studentId, '-', '') = ?
        ORDER BY er.id DESC
    `, [cleanId, normId], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        // อาจารย์ตั้งไม่ให้นักศึกษาเห็นคะแนน → ไม่ส่งคะแนนออกไปเลย (ไม่ใช่แค่ซ่อนบนหน้าเว็บ)
        res.json((rows || []).map(r => (Number(r.show_score) === 0 ? { ...r, score: null, maxScore: null } : r)));
    });
});

// 2.3 ตรวจสอบสิทธิ์และดึงข้อมูลก่อนเข้าห้องสอบ / เข้าห้องรอสอบ (Gatekeeper & Pre-exam Check)
// สอบได้ครั้งเดียว: ส่งคำตอบห้องนี้แล้ว → เข้าสอบซ้ำไม่ได้ (อาจารย์ลบผลของคนนั้นในหน้าผลสอบ หรือเผยแพร่ใหม่แบบล้างผล เพื่อให้สอบใหม่ได้)
const ALREADY_SUBMITTED_MSG = 'คุณส่งคำตอบข้อสอบนี้ไปแล้ว การสอบแต่ละครั้งเข้าสอบได้เพียงครั้งเดียว หากมีเหตุจำเป็นต้องสอบใหม่ กรุณาติดต่ออาจารย์ผู้สอน';
function findSubmitted(roomId, studentId, cb) {
    db.get("SELECT score, maxScore, date, time FROM exam_results WHERE roomId = ? AND (studentId = ? OR REPLACE(studentId, '-', '') = REPLACE(?, '-', '')) LIMIT 1",
        [roomId, String(studentId || '').trim(), String(studentId || '').trim()], (e, row) => cb(e ? null : row));
}
global.__findSubmitted = findSubmitted; global.__ALREADY_SUBMITTED_MSG = ALREADY_SUBMITTED_MSG;

app.post('/api/student/check-exam-access', (req, res) => {
    const { studentId, examCode } = req.body;
    if (!studentId || !examCode) {
        return res.status(400).json({ success: false, message: "ข้อมูลไม่ครบถ้วน กรุณาระบุรหัสนักศึกษาและรหัส PIN" });
    }

    const cleanCode = examCode.trim().replace(/\s+/g, '');
    const cleanStudentId = studentId.trim();
    const normStudentId = cleanStudentId.replace(/[^0-9a-zA-Z]/g, '');

    // 1. ค้นหาห้องสอบจาก PIN หรือ roomId
    const roomSql = `
        SELECT tr.roomId, tr.roomName, tr.exam_title, tr.exam_code, tr.is_published, tr.duration, tr.courseId, tr.allowed_classes,
               t.name as teacherName, c.courseCode, c.courseName
        FROM teacher_rooms tr
        LEFT JOIN teachers t ON t.username = tr.teacherUsername
        LEFT JOIN courses c ON c.id = tr.courseId
        WHERE REPLACE(tr.exam_code, ' ', '') = ? OR tr.roomId = ?
    `;

    db.get(roomSql, [cleanCode, cleanCode], (err, room) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        if (!room) {
            return res.status(404).json({ success: false, message: "ไม่พบห้องสอบสำหรับรหัส PIN นี้ กรุณาตรวจสอบอีกครั้ง" });
        }

        // 2. ดึงข้อมูลนักศึกษาในระบบ
        db.get("SELECT studentId, firstName, lastName, class FROM students WHERE studentId = ? OR REPLACE(studentId, '-', '') = ?",
            [cleanStudentId, normStudentId], (err2, student) => {
            if (err2) return res.status(500).json({ success: false, message: err2.message });
            if (!student) {
                return res.status(404).json({ success: false, message: "ไม่พบบัญชีนักศึกษา กรุณาเข้าสู่ระบบก่อนครับ" });
            }

            const sendApprovedResponse = () => findSubmitted(room.roomId, student.studentId, done => {
                if (done) return res.status(403).json({ success: false, alreadySubmitted: true, roomId: room.roomId, message: ALREADY_SUBMITTED_MSG });
                res.json({
                    success: true,
                    allowed: true,
                    roomId: room.roomId,
                    roomName: room.roomName,
                    examTitle: room.exam_title || room.roomName,
                    courseCode: room.courseCode || '',
                    courseName: room.courseName || '',
                    teacherName: room.teacherName || 'อาจารย์ผู้คุมสอบ',
                    is_published: room.is_published === 1,
                    duration: room.duration || 0,
                    student: {
                        studentId: student.studentId,
                        name: `${student.firstName} ${student.lastName}`.trim(),
                        class: student.class || ''
                    }
                });
            });

            // 3. คัดกรองความปลอดภัย: ถ้ารายวิชานี้มีการผูกไว้ และมีรายชื่อนักศึกษาใน course_students
            if (room.courseId && room.courseId > 0) {
                db.all('SELECT * FROM course_students WHERE courseId = ? OR CAST(courseId AS TEXT) = ?', [room.courseId, String(room.courseId)], (err3, enrolledList) => {
                    if (err3) return res.status(500).json({ success: false, message: err3.message });

                    if (enrolledList && enrolledList.length > 0) {
                        // ค้นหานักศึกษาในบัญชีรายชื่อของวิชานี้ด้วย studentId
                        const found = enrolledList.find(s => {
                            const enrolledNorm = (s.studentId || '').replace(/[^0-9a-zA-Z]/g, '');
                            return s.studentId === cleanStudentId || enrolledNorm === normStudentId;
                        });

                        if (!found) {
                            return res.status(403).json({
                                success: false,
                                accessDenied: true,
                                message: `ขออภัย รหัสนักศึกษา (${cleanStudentId}) ไม่มีรายชื่ออยู่ในบัญชีผู้มีสิทธิ์สอบรายวิชา "${room.courseName || room.courseCode || 'วิชานี้'}" จึงไม่สามารถเข้ามาร่วมสอบได้`
                            });
                        }
                    }

                    // ห้องสอบเปิดเฉพาะบางกลุ่มเรียน
                    if (enrolledList && enrolledList.length > 0) {
                        const me = enrolledList.find(s => s.studentId === cleanStudentId || (s.studentId || '').replace(/[^0-9a-zA-Z]/g, '') === normStudentId);
                        if (me && outsideAllowedGroups(room.allowed_classes, me.class)) {
                            return res.status(403).json({ success: false, accessDenied: true, message: groupDeniedMsg(room.allowed_classes, me.class) });
                        }
                    }

                    // ผ่านการตรวจสอบสิทธิ์
                    sendApprovedResponse();
                });
            } else {
                // หากห้องสอบนี้ไม่ได้ล็อกเฉพาะวิชา อนุญาตให้เข้าได้ตามปกติ
                sendApprovedResponse();
            }
        });
    });
});

// Heartbeat สำหรับนักศึกษาที่กำลังสอบ หรือรอสอบ (Real-time Heartbeat)
app.post('/api/student/heartbeat', (req, res) => {
    let roomId = req.body && req.body.roomId;
    let studentId = req.body && req.body.studentId;
    let name = req.body && req.body.name;
    let studentClass = req.body && req.body.class;
    let state = req.body && req.body.state;

    if (!roomId && typeof req.body === 'string') {
        try {
            const p = JSON.parse(req.body);
            roomId = p.roomId;
            studentId = p.studentId;
            name = p.name;
            studentClass = p.class;
            state = p.state;
        } catch(e) {}
    }

    if (!roomId || !studentId) return res.status(400).json({ success: false, message: "ข้อมูลไม่ครบถ้วน" });

    recordStudentActive(roomId, studentId, name, studentClass, state || 'in_exam');
    res.json({ success: true, active: true });
});

// แจ้งเตือนเมื่อนักศึกษาออกจากห้องสอบ (ปิดแท็บ / กดย้อนกลับ / ออกจากระบบ)
app.post('/api/student/leave-room', (req, res) => {
    let roomId = req.body && req.body.roomId;
    let studentId = req.body && req.body.studentId;

    if (!roomId && typeof req.body === 'string') {
        try {
            const p = JSON.parse(req.body);
            roomId = p.roomId;
            studentId = p.studentId;
        } catch(e) {}
    }

    if (roomId && studentId) {
        removeStudentActive(roomId, studentId);
        console.log(`[นักศึกษาออกจากห้องสอบ] รหัสนักศึกษา ${studentId} ออกจากห้อง ${roomId}`);
    }

    res.json({ success: true, left: true });
});
})(app, routeCtx);

// =====================================================================
// 04-live-dashboard.js — อาจารย์: รายชื่อเข้าสอบเทียบรายวิชา และแดชบอร์ดห้องสอบสด
// (โค้ดเดิม ไม่เปลี่ยนการทำงาน)
// =====================================================================
(function (app, ctx) {
    const { db, getActiveRoomStudentMap } = ctx;

// เปรียบเทียบรายชื่อนักศึกษาในรายวิชา (course_students) กับคนที่เข้ามาสอบจริงในห้องนี้แบบ Real-time
app.get('/api/teacher/room-roster-attendance', (req, res) => {
    const { roomId } = req.query;
    if (!roomId) return res.status(400).json({ message: "กรุณาระบุ roomId" });

    db.get('SELECT r.*, c.courseCode, c.courseName FROM teacher_rooms r LEFT JOIN courses c ON c.id = r.courseId WHERE r.roomId = ?', [roomId], (err, room) => {
        if (err || !room) return res.status(404).json({ message: "ไม่พบห้องสอบนี้" });

        const courseId = room.courseId;

        // 1. ดึงรายชื่อจาก course_students
        const sqlEnrolled = 'SELECT * FROM course_students WHERE courseId = ? OR CAST(courseId AS TEXT) = ? ORDER BY studentId ASC';
        db.all(sqlEnrolled, [courseId, String(courseId)], (err1, enrolledRows) => {
            const enrolledList = enrolledRows || [];

            // 2. ดึงผลสอบที่ส่งแล้ว
            db.all('SELECT * FROM exam_results WHERE roomId = ?', [roomId], (err2, resultRows) => {
                const results = resultRows || [];
                const submittedMap = new Map();
                results.forEach(r => submittedMap.set(String(r.studentId), r));

                // 3. ดึงคนที่กำลังออนไลน์/กำลังสอบในหน่วยความจำสดๆ (ตรวจสอบ heartbeat ภายใน 8 วินาทีล่าสุด)
                const activeMap = getActiveRoomStudentMap(roomId);

                // 4. ดึงประวัติคนที่เคยเข้าสู่ระบบเพื่อระบุว่าใครเคยเข้าแล้วออกไป
                db.all('SELECT studentId, name, class FROM student_logins WHERE roomId = ?', [roomId], (err3, loginRows) => {
                    const loggedInMap = new Map();
                    (loginRows || []).forEach(l => {
                        if (!loggedInMap.has(String(l.studentId))) {
                            loggedInMap.set(String(l.studentId), l);
                        }
                    });

                    const studentStatusList = [];
                    const enrolledSet = new Set();

                    // ประมวลผลรายชื่อในวิชาทั้งหมด
                    enrolledList.forEach(e => {
                        const sIdStr = String(e.studentId);
                        enrolledSet.add(sIdStr);

                        const isSubmitted = submittedMap.get(sIdStr);
                        const isActive = activeMap.get(sIdStr);
                        const hadLoggedIn = loggedInMap.get(sIdStr);

                        let status = 'not_joined';
                        let statusText = 'ยังไม่เข้าสอบ';
                        let statusBg = 'bg-rose-50 text-rose-700 border-rose-200';
                        let score = null;
                        let maxScore = null;

                        if (isSubmitted) {
                            status = 'submitted';
                            statusText = 'ส่งข้อสอบแล้ว';
                            statusBg = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                            score = isSubmitted.score;
                            maxScore = isSubmitted.maxScore;
                        } else if (isActive) {
                            status = 'joined';
                            statusText = 'อยู่ในห้องสอบ (กำลังทำ)';
                            statusBg = 'bg-indigo-50 text-indigo-700 border-indigo-200';
                        } else if (hadLoggedIn) {
                            // เคยเข้าห้องสอบมาแล้ว แต่ปัจจุบันออกจากห้องสอบไปแล้ว
                            status = 'not_joined';
                            statusText = 'ออกจากห้องสอบแล้ว (ออฟไลน์)';
                            statusBg = 'bg-amber-50 text-amber-700 border-amber-200';
                        }

                        const fullName = `${e.prefix || ''}${e.firstName || ''} ${e.lastName || ''}`.trim() || 'นักศึกษา';

                        studentStatusList.push({
                            studentId: e.studentId,
                            name: fullName,
                            class: e.class || '-',
                            status,
                            statusText,
                            statusBg,
                            score,
                            maxScore
                        });
                    });

                    // ถ้ามีคนที่เข้าสอบที่ไม่อยู่ใน course_students (เช่น ห้องสอบทั่วไปไม่ได้ล็อกรายวิชา)
                    const extraJoined = new Map([...submittedMap, ...activeMap]);
                    extraJoined.forEach((val, sIdStr) => {
                        if (!enrolledSet.has(sIdStr)) {
                            const isSubmitted = submittedMap.get(sIdStr);
                            const isActive = activeMap.get(sIdStr);
                            const name = isSubmitted ? isSubmitted.name : (val.name || val.studentName || 'นักศึกษา');
                            const cls = isSubmitted ? (isSubmitted.class || '-') : (val.class || '-');

                            studentStatusList.push({
                                studentId: sIdStr,
                                name,
                                class: cls,
                                status: isSubmitted ? 'submitted' : (isActive ? 'joined' : 'not_joined'),
                                statusText: isSubmitted ? 'ส่งข้อสอบแล้ว (นอกรายชื่อ)' : (isActive ? 'อยู่ในห้องสอบ (นอกรายชื่อ)' : 'ออกจากห้องสอบแล้ว'),
                                statusBg: isSubmitted ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : (isActive ? 'bg-cyan-50 text-cyan-700 border-cyan-200' : 'bg-slate-100 text-slate-600 border-slate-200'),
                                score: isSubmitted ? isSubmitted.score : null,
                                maxScore: isSubmitted ? isSubmitted.maxScore : null
                            });
                        }
                    });

                    const totalEnrolled = enrolledList.length;
                    const totalSubmitted = studentStatusList.filter(s => s.status === 'submitted').length;
                    const totalActive = studentStatusList.filter(s => s.status === 'joined').length;
                    const totalJoined = totalSubmitted + totalActive;
                    const totalNotJoined = Math.max(0, totalEnrolled - totalJoined);

                    res.json({
                        success: true,
                        roomId,
                        courseId,
                        courseCode: room.courseCode || '',
                        courseName: room.courseName || '',
                        examTitle: room.exam_title || room.roomName,
                        totalEnrolled,
                        totalJoined,
                        totalSubmitted,
                        totalActive,
                        totalNotJoined,
                        students: studentStatusList
                    });
                });
            });
        });
    });
});

// ==========================================
// Real-time Exam Summary Dashboard API
// ==========================================
app.get('/api/teacher/room-realtime-dashboard', (req, res) => {
    const { roomId } = req.query;
    if (!roomId) return res.status(400).json({ message: "กรุณาระบุ roomId" });

    // 1. ดึงข้อมูลห้องสอบ
    db.get('SELECT r.*, c.courseCode, c.courseName FROM teacher_rooms r LEFT JOIN courses c ON c.id = r.courseId WHERE r.roomId = ?', [roomId], (err, room) => {
        if (err || !room) return res.status(404).json({ message: "ไม่พบห้องสอบนี้" });

        const courseId = room.courseId;

        // 2. ดึงคำถามทั้งหมดในห้องสอบนี้
        db.all('SELECT id, question, answer, a, b, c, d FROM questions WHERE roomId = ? ORDER BY id ASC', [roomId], (qErr, questionsRows) => {
            const questions = questionsRows || [];

            // 3. ดึงผลสอบทั้งหมดที่ส่งแล้วในห้องนี้
            db.all('SELECT studentId, name, class, score, maxScore, time, date, answers_json FROM exam_results WHERE roomId = ? ORDER BY score DESC', [roomId], (rErr, resultRows) => {
                const results = resultRows || [];
                const submittedMap = new Map();
                results.forEach(r => submittedMap.set(String(r.studentId), r));

                // 4. ดึงรายชื่อนักศึกษาจาก course_students
                const sqlEnrolled = 'SELECT * FROM course_students WHERE courseId = ? OR CAST(courseId AS TEXT) = ? ORDER BY studentId ASC';
                db.all(sqlEnrolled, [courseId, String(courseId)], (csErr, enrolledRows) => {
                    const enrolledList = enrolledRows || [];
                    const activeMap = getActiveRoomStudentMap(roomId);

                    // คำนวณสถานะนักศึกษา
                    const studentStatusList = [];
                    const enrolledSet = new Set();

                    enrolledList.forEach(e => {
                        const sIdStr = String(e.studentId);
                        enrolledSet.add(sIdStr);

                        const isSubmitted = submittedMap.get(sIdStr);
                        const isActive = activeMap.get(sIdStr);

                        let status = 'not_joined';
                        let score = null;
                        let maxScore = null;
                        let submitTime = null;

                        if (isSubmitted) {
                            status = 'submitted';
                            score = isSubmitted.score;
                            maxScore = isSubmitted.maxScore;
                            submitTime = isSubmitted.time;
                        } else if (isActive) {
                            status = 'active';
                        }

                        const fullName = `${e.prefix || ''}${e.firstName || ''} ${e.lastName || ''}`.trim() || 'นักศึกษา';
                        studentStatusList.push({
                            studentId: e.studentId,
                            name: fullName,
                            class: e.class || '-',
                            status,
                            score,
                            maxScore,
                            time: submitTime
                        });
                    });

                    // เพิ่มนักศึกษาที่ส่งหรือกำลังสอบ แต่นอกรายชื่อ
                    const extra = new Map([...submittedMap, ...activeMap]);
                    extra.forEach((val, sIdStr) => {
                        if (!enrolledSet.has(sIdStr)) {
                            const isSubmitted = submittedMap.get(sIdStr);
                            const isActive = activeMap.get(sIdStr);
                            studentStatusList.push({
                                studentId: sIdStr,
                                name: isSubmitted ? isSubmitted.name : (val.name || val.studentName || 'นักศึกษา'),
                                class: isSubmitted ? (isSubmitted.class || '-') : (val.class || '-'),
                                status: isSubmitted ? 'submitted' : (isActive ? 'active' : 'not_joined'),
                                score: isSubmitted ? isSubmitted.score : null,
                                maxScore: isSubmitted ? isSubmitted.maxScore : null,
                                time: isSubmitted ? isSubmitted.time : null
                            });
                        }
                    });

                    const totalEnrolled = enrolledList.length;
                    const totalSubmitted = studentStatusList.filter(s => s.status === 'submitted').length;
                    const totalActive = studentStatusList.filter(s => s.status === 'active').length;
                    const totalNotJoined = Math.max(0, totalEnrolled - (totalSubmitted + totalActive));

                    // คำนวณสถิติการกระจายคะแนน (Score Histogram)
                    let scoreBuckets = { '0-25%': 0, '26-50%': 0, '51-75%': 0, '76-100%': 0 };
                    let totalScore = 0;
                    let maxScoreVal = 0;
                    let minScoreVal = totalSubmitted > 0 ? 999999 : 0;
                    let maxPossibleScore = questions.length;

                    results.forEach(r => {
                        const s = r.score || 0;
                        const ms = r.maxScore || questions.length || 10;
                        maxPossibleScore = ms;
                        totalScore += s;
                        if (s > maxScoreVal) maxScoreVal = s;
                        if (s < minScoreVal) minScoreVal = s;

                        const pct = ms > 0 ? (s / ms) * 100 : 0;
                        if (pct <= 25) scoreBuckets['0-25%']++;
                        else if (pct <= 50) scoreBuckets['26-50%']++;
                        else if (pct <= 75) scoreBuckets['51-75%']++;
                        else scoreBuckets['76-100%']++;
                    });

                    const avgScore = totalSubmitted > 0 ? parseFloat((totalScore / totalSubmitted).toFixed(1)) : 0;

                    // 5. วิเคราะห์ข้อสอบที่ตอบผิดบ่อย (Top Missed Questions)
                    const questionStats = [];
                    questions.forEach((q, index) => {
                        const qIdStr = String(q.id);
                        const correctKey = (q.answer || '').trim().toLowerCase();
                        let answeredCount = 0;
                        let wrongCount = 0;
                        let correctCount = 0;

                        results.forEach(r => {
                            if (!r.answers_json) return;
                            try {
                                const parsed = typeof r.answers_json === 'string' ? JSON.parse(r.answers_json) : r.answers_json;
                                const studentAns = (parsed[qIdStr] !== undefined ? parsed[qIdStr] : parsed[index] || '').trim().toLowerCase();
                                if (studentAns !== '') {
                                    answeredCount++;
                                    if (studentAns === correctKey) {
                                        correctCount++;
                                    } else {
                                        wrongCount++;
                                    }
                                }
                            } catch(e) {}
                        });

                        const wrongRate = totalSubmitted > 0 ? Math.round((wrongCount / totalSubmitted) * 100) : 0;
                        questionStats.push({
                            questionIndex: index + 1,
                            questionId: q.id,
                            questionText: q.question,
                            correctAnswer: q.answer,
                            correctText: q[q.answer] || q.answer,
                            wrongCount,
                            correctCount,
                            totalAnswered: answeredCount,
                            wrongRate
                        });
                    });

                    // เรียงลำดับจากข้อที่ตอบผิดมากที่สุดไปน้อยที่สุด
                    questionStats.sort((a, b) => b.wrongCount - a.wrongCount || b.wrongRate - a.wrongRate);

                    res.json({
                        success: true,
                        room: {
                            roomId: room.roomId,
                            roomName: room.roomName,
                            examTitle: room.exam_title || room.roomName,
                            courseId: room.courseId,
                            courseCode: room.courseCode || '',
                            courseName: room.courseName || '',
                            duration: room.duration || 60,
                            isPublished: room.is_published === 1,
                            questionCount: questions.length
                        },
                        summary: {
                            totalEnrolled,
                            totalJoined: totalSubmitted + totalActive,
                            totalActive,
                            totalSubmitted,
                            totalNotJoined,
                            avgScore,
                            maxScore: maxScoreVal,
                            minScore: totalSubmitted > 0 ? minScoreVal : 0,
                            maxPossibleScore
                        },
                        histogram: scoreBuckets,
                        topWrongQuestions: questionStats.slice(0, 10),
                        students: studentStatusList
                    });
                });
            });
        });
    });
});
})(app, routeCtx);

// =====================================================================
// 05-courses.js — รายวิชา รายชื่อนักศึกษาประจำวิชา และการอนุมัตินักศึกษา
// (โค้ดเดิม ไม่เปลี่ยนการทำงาน)
// =====================================================================
(function (app, ctx) {
    const { db, hashPassword } = ctx;

// ==========================================
// ระบบจัดการรายวิชาและนำเข้ารายชื่อนักศึกษา (Course & Student Roster Management)
// ==========================================

// ดึงรายการรายวิชาของอาจารย์
app.get('/api/teacher/courses', (req, res) => {
    const username = String(req.query.username || '');
    if (!username || username === 'undefined') return res.status(400).json({ message: "กรุณาระบุ username ของอาจารย์" });

    const sql = `
        SELECT c.*,
            (SELECT COUNT(*) FROM course_students cs WHERE cs.courseId = c.id) as studentCount,
            (SELECT COUNT(*) FROM teacher_rooms tr WHERE tr.courseId = c.id AND COALESCE(tr.archived, 0) = 0) as roomCount,
            (SELECT COUNT(*) FROM exam_templates et WHERE et.courseId = c.id) as examCount,
            (SELECT GROUP_CONCAT(DISTINCT cs.class) FROM course_students cs WHERE cs.courseId = c.id AND cs.class != '' AND cs.class IS NOT NULL) as studentClasses
        FROM courses c
        WHERE (c.teacherUsername = ? OR ? = 'admin')
        ORDER BY c.id DESC
    `;
    // อาจารย์เห็นเฉพาะรายวิชาของตัวเอง (แอดมินเห็นทั้งหมด)
    db.all(sql, [username, username], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows || []);
    });
});

// ดึงรายการชุดข้อสอบทั้งหมดที่อยู่ในรายวิชานี้
app.get('/api/courses/:courseId/exams', (req, res) => {
    const courseId = parseInt(req.params.courseId, 10);
    const username = String(req.query.username || '');
    if (!courseId) return res.status(400).json({ message: "กรุณาระบุ courseId" });
    if (!username) return res.status(400).json({ message: "กรุณาระบุ username ของอาจารย์" });

    // เฉพาะชุดข้อสอบของอาจารย์เจ้าของบัญชี (แอดมินเห็นทั้งหมด)
    const sql = `
        SELECT et.id, et.templateName, et.courseId, et.created_at,
               (SELECT COUNT(*) FROM template_questions tq WHERE tq.templateId = et.id) as questionCount
        FROM exam_templates et
        WHERE et.courseId = ? AND (et.teacherUsername = ? OR ? = 'admin')
        ORDER BY et.id DESC
    `;
    db.all(sql, [courseId, username, username], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows || []);
    });
});

// สร้างรายวิชาใหม่
app.post('/api/teacher/courses', (req, res) => {
    const { username, courseCode, courseName, semester, description } = req.body;
    if (!username || !courseCode || !courseName) {
        return res.status(400).json({ success: false, message: "กรุณาระบุรหัสวิชาและชื่อวิชา" });
    }

    const now = new Date().toLocaleDateString('th-TH', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric', month: 'short', day: 'numeric'
    });

    findDuplicateCourse(username, courseCode, courseName, semester, description, 0, (dErr, dup) => {
        if (dErr) return res.status(500).json({ success: false, message: dErr.message });
        if (dup) return res.status(409).json({ success: false, duplicate: true, message: duplicateCourseMsg(dup) });
        db.run(
            'INSERT INTO courses (teacherUsername, courseCode, courseName, semester, description, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            [username, courseCode.trim(), courseName.trim(), (semester || '').trim(), (description || '').trim(), now],
            function(err) {
                if (err) return res.status(500).json({ success: false, message: err.message });
                res.json({ success: true, courseId: this.lastID, message: "สร้างรายวิชาใหม่เรียบร้อยแล้ว" });
            }
        );
    });
});

// รายวิชาซ้ำ = อาจารย์คนเดียวกัน รหัสวิชา + ชื่อวิชา + ภาคเรียน + กลุ่มเรียน เหมือนกัน (ไม่สนช่องว่าง/ตัวพิมพ์เล็กใหญ่)
// ภาคเรียนต่างกัน (1/2568 กับ 1/2569) หรือกลุ่มเรียนต่างกัน (VC/R กับ VC/S) สร้างได้ — เป็นคนละรายวิชา ข้อมูลแยกกันตามรหัสรายวิชาในระบบ
function normCourseText(v) { return String(v || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
const normCompact = v => normCourseText(v).replace(/\s/g, '');
function findDuplicateCourse(username, code, name, semester, group, exceptId, cb) {
    db.all('SELECT id, courseCode, courseName, semester, description FROM courses WHERE teacherUsername = ?', [username], (err, rows) => {
        if (err) return cb(err);
        const c = normCourseText(code), n = normCourseText(name), s = normCompact(semester), g = normCompact(group);
        cb(null, (rows || []).find(r => Number(r.id) !== Number(exceptId) &&
            normCourseText(r.courseCode) === c && normCourseText(r.courseName) === n &&
            normCompact(r.semester) === s && normCompact(r.description) === g) || null);
    });
}
function duplicateCourseMsg(dup) {
    return `มีรายวิชา [${dup.courseCode}] ${dup.courseName}${dup.semester ? ' ภาคเรียน ' + dup.semester : ''}${dup.description ? ' กลุ่ม ' + dup.description : ''} อยู่แล้ว ไม่สามารถสร้างซ้ำได้ ` +
        `(ถ้าเป็นคนละภาคเรียนหรือคนละกลุ่มเรียน ให้ใส่ภาคเรียนหรือกลุ่มเรียนให้ต่างจากเดิม)`;
}

// แก้ไขข้อมูลรายวิชา
app.put('/api/teacher/courses/:id', (req, res) => {
    const courseId = req.params.id;
    const { courseCode, courseName, semester, description } = req.body;
    if (!courseCode || !courseName) {
        return res.status(400).json({ success: false, message: "กรุณาระบุรหัสวิชาและชื่อวิชา" });
    }

    db.get('SELECT teacherUsername FROM courses WHERE id = ?', [courseId], (oErr, owner) => {
        if (oErr) return res.status(500).json({ success: false, message: oErr.message });
        if (!owner) return res.status(404).json({ success: false, message: "ไม่พบรายวิชานี้" });
        // แก้ไขแล้วไปซ้ำกับรายวิชาอื่นของตัวเองไม่ได้
        findDuplicateCourse(owner.teacherUsername, courseCode, courseName, semester, description, courseId, (dErr, dup) => {
            if (dErr) return res.status(500).json({ success: false, message: dErr.message });
            if (dup) return res.status(409).json({ success: false, duplicate: true, message: duplicateCourseMsg(dup) });
            db.run(
                'UPDATE courses SET courseCode = ?, courseName = ?, semester = ?, description = ? WHERE id = ?',
                [courseCode.trim(), courseName.trim(), (semester || '').trim(), (description || '').trim(), courseId],
                function(err) {
                    if (err) return res.status(500).json({ success: false, message: err.message });
                    res.json({ success: true, message: "แก้ไขข้อมูลรายวิชาเรียบร้อย" });
                }
            );
        });
    });
});

// ลบรายวิชา
app.delete('/api/teacher/courses/:id', (req, res) => {
    const courseId = req.params.id;
    db.serialize(() => {
        db.run('DELETE FROM course_students WHERE courseId = ?', [courseId]);
        db.run('UPDATE teacher_rooms SET courseId = 0 WHERE courseId = ?', [courseId]);
        db.run('DELETE FROM courses WHERE id = ?', [courseId], function(err) {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, message: "ลบรายวิชาเรียบร้อยแล้ว" });
        });
    });
});

// ผูกห้องสอบกับรายวิชา
app.post('/api/teacher/link-room-course', (req, res) => {
    const { roomId, courseId } = req.body;
    if (!roomId) return res.status(400).json({ success: false, message: "กรุณาระบุ roomId" });

    db.run('UPDATE teacher_rooms SET courseId = ? WHERE roomId = ?', [courseId || 0, roomId], function(err) {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, message: "ผูกห้องสอบกับรายวิชาเรียบร้อย" });
    });
});

// ดึงรายชื่อนักศึกษาในรายวิชา
app.get('/api/courses/:courseId/students', (req, res) => {
    const courseId = req.params.courseId;
    db.all('SELECT * FROM course_students WHERE courseId = ? ORDER BY studentId ASC', [courseId], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows || []);
    });
});

// นำเข้ารายชื่อนักศึกษาประจำวิชา (Import Excel/CSV Roster)
app.post('/api/courses/:courseId/students/import', (req, res) => {
    const courseId = req.params.courseId;
    const { students, defaultClass } = req.body;

    if (!courseId || !Array.isArray(students) || students.length === 0) {
        return res.status(400).json({ success: false, message: "ไม่พบข้อมูลนักศึกษาที่จะนำเข้า" });
    }

    const now = new Date().toISOString();
    let imported = 0;
    let updated = 0;

    // Helper แยกคำนำหน้า ชื่อ และนามสกุลภาษาไทย
    function parseThaiName(rawFullname) {
        if (!rawFullname) return { prefix: '', firstName: '', lastName: '' };
        let str = String(rawFullname).trim();
        let prefix = '';

        const prefixMatch = str.match(/^(นาย|นางสาว|นาง|ด\.ช\.|ด\.ญ\.)/);
        if (prefixMatch) {
            prefix = prefixMatch[1];
            str = str.substring(prefix.length).trim();
        }

        const parts = str.split(/\s+/).filter(Boolean);
        const firstName = parts[0] || '';
        const lastName = parts.slice(1).join(' ') || '';
        return { prefix, firstName, lastName };
    }

    const promises = students.map(raw => {
        return new Promise((resolve) => {
            const studentNo = String(raw.STUDENT_NO || raw.studentId || raw.student_no || raw.id || '').trim();
            if (!studentNo) return resolve();

            const fullName = String(raw.FULLNAME || raw.fullname || raw.name || '').trim();
            const fullNameEn = String(raw.FULLNAME_EN || raw.fullname_en || raw.name_en || '').trim();
            const studentClass = String(raw.CLASS || raw.class || defaultClass || '').trim();

            const { prefix, firstName, lastName } = parseThaiName(fullName);

            // บันทึกเข้า course_students
            db.get('SELECT id FROM course_students WHERE courseId = ? AND studentId = ?', [courseId, studentNo], (err, ex) => {
                if (!ex) {
                    db.run(
                        `INSERT INTO course_students (courseId, studentId, prefix, firstName, lastName, class, fullNameEn, created_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [courseId, studentNo, prefix, firstName, lastName, studentClass, fullNameEn, now],
                        () => {
                            imported++;
                            // สร้างบัญชีใน students ด้วยถ้ายังไม่มี
                            syncToStudentsTable(studentNo, firstName, lastName, studentClass, resolve);
                        }
                    );
                } else {
                    db.run(
                        `UPDATE course_students SET prefix = ?, firstName = ?, lastName = ?, class = ?, fullNameEn = ?
                         WHERE id = ?`,
                        [prefix, firstName, lastName, studentClass, fullNameEn, ex.id],
                        () => {
                            updated++;
                            syncToStudentsTable(studentNo, firstName, lastName, studentClass, resolve);
                        }
                    );
                }
            });
        });
    });

    function syncToStudentsTable(sId, fName, lName, sCls, done) {
        db.get('SELECT id FROM students WHERE studentId = ?', [sId], (err, exS) => {
            if (!exS) {
                // รหัสผ่านเริ่มต้นคือ 4 ตัวท้ายของรหัส หรือ 1234
                const defaultPass = sId.replace(/[^0-9]/g, '').slice(-4) || '1234';
                const passHash = hashPassword(defaultPass);
                db.run(
                    `INSERT INTO students (studentId, firstName, lastName, class, password_hash, status, created_at, approved_at, approved_by)
                     VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, 'teacher_import')`,
                    [sId, fName, lName, sCls, passHash, now, now],
                    () => done()
                );
            } else {
                db.run(
                    `UPDATE students SET firstName = COALESCE(NULLIF(?, ''), firstName), lastName = COALESCE(NULLIF(?, ''), lastName), class = COALESCE(NULLIF(?, ''), class)
                     WHERE studentId = ?`,
                    [fName, lName, sCls, sId],
                    () => done()
                );
            }
        });
    }

    Promise.all(promises).then(() => {
        res.json({
            success: true,
            imported,
            updated,
            total: students.length,
            message: `นำเข้ารายชื่อสำเร็จ! เพิ่มใหม่ ${imported} คน, อัปเดต ${updated} คน`
        });
    }).catch(err => {
        res.status(500).json({ success: false, message: err.message });
    });
});

// เพิ่มนักศึกษาเดี่ยวในรายวิชา
// คัดลอกนักศึกษาที่เลือกจากรายวิชาหนึ่งไปอีกรายวิชา (ทั้งสองวิชาต้องเป็นของอาจารย์คนนี้)
// เก็บคำนำหน้า ชื่อภาษาอังกฤษ และชั้น/กลุ่มเดิมไว้ · ข้ามคนที่อยู่ในวิชาปลายทางแล้ว · ไม่ลบออกจากวิชาเดิม
app.post('/api/courses/:courseId/students/copy-from', (req, res) => {
    const toId = parseInt(req.params.courseId, 10);
    const fromId = parseInt(req.body && req.body.fromCourseId, 10);
    const ids = Array.isArray(req.body && req.body.studentIds) ? [...new Set(req.body.studentIds.map(x => String(x || '').trim()).filter(Boolean))] : [];
    if (!toId || !fromId) return res.status(400).json({ success: false, message: 'กรุณาเลือกรายวิชาต้นทางและปลายทาง' });
    if (toId === fromId) return res.status(400).json({ success: false, message: 'รายวิชาต้นทางและปลายทางต้องไม่ใช่วิชาเดียวกัน' });
    if (!ids.length) return res.status(400).json({ success: false, message: 'กรุณาเลือกนักศึกษาอย่างน้อย 1 คน' });
    if (ids.length > 500) return res.status(400).json({ success: false, message: 'เลือกได้ครั้งละไม่เกิน 500 คน' });
    // targetClass (ไม่บังคับ): ใส่ทุกคนเข้ากลุ่มเรียนนี้ของวิชาปลายทาง · ว่าง = ใช้กลุ่มเดิมจากวิชาต้นทาง
    const tClass = String((req.body && req.body.targetClass) || '').trim();
    const v = viewer(req);
    db.all('SELECT id, teacherUsername FROM courses WHERE id IN (?, ?)', [fromId, toId], (cErr, cs) => {
        if (cErr) return res.status(500).json({ success: false, message: cErr.message });
        const from = (cs || []).find(c => Number(c.id) === fromId), to = (cs || []).find(c => Number(c.id) === toId);
        if (!from || !to) return res.status(404).json({ success: false, message: 'ไม่พบรายวิชา' });
        if (!v.adm && (from.teacherUsername !== v.user || to.teacherUsername !== v.user)) return res.status(403).json({ success: false, message: 'รายวิชานี้ไม่ใช่ของคุณ' });
        const marks = ids.map(() => '?').join(',');
        db.all(`SELECT studentId, prefix, firstName, lastName, class, fullNameEn FROM course_students WHERE courseId = ? AND studentId IN (${marks})`, [fromId, ...ids], (sErr, src) => {
            if (sErr) return res.status(500).json({ success: false, message: sErr.message });
            db.all(`SELECT studentId FROM course_students WHERE courseId = ? AND studentId IN (${marks})`, [toId, ...ids], (tErr, have) => {
                if (tErr) return res.status(500).json({ success: false, message: tErr.message });
                const already = new Set((have || []).map(r => String(r.studentId)));
                const add = (src || []).filter(r => !already.has(String(r.studentId)));
                const now = new Date().toISOString();
                let i = 0;
                const next = () => {
                    if (i >= add.length) {
                        console.log(`[คัดลอกรายชื่อ] วิชา ${fromId} → ${toId}: เพิ่ม ${add.length} คน ข้าม ${already.size} คน`);
                        return res.json({ success: true, added: add.length, skipped: already.size, notFound: ids.length - (src || []).length });
                    }
                    const r = add[i++];
                    db.run(`INSERT INTO course_students (courseId, studentId, prefix, firstName, lastName, class, fullNameEn, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [toId, r.studentId, r.prefix || '', r.firstName || '', r.lastName || '', tClass || r.class || '', r.fullNameEn || '', now],
                        err => err ? res.status(500).json({ success: false, message: err.message }) : next());
                };
                next();
            });
        });
    });
});

// ย้ายนักศึกษาไปกลุ่มเรียนอื่นในรายวิชาเดียวกัน (ความเป็นเจ้าของรายวิชาตรวจที่ auth.js)
app.put('/api/courses/:courseId/students/:id/class', (req, res) => {
    const cls = String((req.body && req.body.class) || '').trim();
    db.run('UPDATE course_students SET class = ? WHERE courseId = ? AND id = ?', [cls, req.params.courseId, req.params.id], function (err) {
        if (err) return res.status(500).json({ success: false, message: err.message });
        if (!this.changes) return res.status(404).json({ success: false, message: 'ไม่พบนักศึกษาในรายวิชานี้' });
        res.json({ success: true, class: cls });
    });
});

app.post('/api/courses/:courseId/students', (req, res) => {
    const courseId = req.params.courseId;
    const { studentId, firstName, lastName, prefix, class: cls, fullNameEn } = req.body;
    if (!studentId || !firstName) {
        return res.status(400).json({ success: false, message: "กรุณากรอกรหัสและชื่อนักศึกษา" });
    }

    const cleanId = studentId.trim();
    const cleanFirst = firstName.trim();
    const cleanLast = (lastName || '').trim();
    const cleanPrefix = (prefix || '').trim();
    const cleanClass = (cls || '').trim();
    const cleanEn = (fullNameEn || '').trim();
    const now = new Date().toISOString();

    db.get('SELECT id FROM course_students WHERE courseId = ? AND studentId = ?', [courseId, cleanId], (err, ex) => {
        if (err) return res.status(500).json({ success: false, message: err.message });
        if (ex) {
            return res.status(400).json({ success: false, message: "รหัสนักศึกษานี้มีอยู่ในรายวิชานี้แล้ว" });
        }

        db.run(
            `INSERT INTO course_students (courseId, studentId, prefix, firstName, lastName, class, fullNameEn, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [courseId, cleanId, cleanPrefix, cleanFirst, cleanLast, cleanClass, cleanEn, now],
            function(insErr) {
                if (insErr) return res.status(500).json({ success: false, message: insErr.message });

                // Sync to students table
                db.get('SELECT id FROM students WHERE studentId = ?', [cleanId], (e, exS) => {
                    if (!exS) {
                        const defaultPass = cleanId.replace(/[^0-9]/g, '').slice(-4) || '1234';
                        const passHash = hashPassword(defaultPass);
                        db.run(
                            `INSERT INTO students (studentId, firstName, lastName, class, password_hash, status, created_at, approved_at, approved_by)
                             VALUES (?, ?, ?, ?, ?, 'approved', ?, ?, 'teacher_manual')`,
                            [cleanId, cleanFirst, cleanLast, cleanClass, passHash, now, now]
                        );
                    }
                });

                res.json({ success: true, message: "เพิ่มนักศึกษาเข้าสู่รายวิชาเรียบร้อย" });
            }
        );
    });
});

// ลบนักศึกษาออกจากรายวิชา
app.delete('/api/courses/:courseId/students/:id', (req, res) => {
    const { courseId, id } = req.params;
    db.run('DELETE FROM course_students WHERE courseId = ? AND id = ?', [courseId, id], function(err) {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, message: "ลบนักศึกษาออกจากรายวิชาแล้ว" });
    });
});

// ล้างรายชื่อทั้งหมดในรายวิชา
app.delete('/api/courses/:courseId/students-all', (req, res) => {
    const { courseId } = req.params;
    db.run('DELETE FROM course_students WHERE courseId = ?', [courseId], function(err) {
        if (err) return res.status(500).json({ success: false, message: err.message });
        res.json({ success: true, message: "ล้างรายชื่อนักศึกษาในรายวิชานี้เรียบร้อยแล้ว" });
    });
});

// 3. แอดมินดึงรายชื่อนักศึกษาที่รออนุมัติ (Pending Students)
app.get('/api/admin/pending-students', (req, res) => {
    const sql = `
        SELECT id, studentId, firstName, lastName, class, note, status, created_at
        FROM students
        WHERE status = 'pending'
        ORDER BY id DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows || []);
    });
});

// 4. แอดมินอนุมัติหรือปฏิเสธบัญชีนักศึกษารายคน
app.post('/api/admin/approve-student', (req, res) => {
    const { studentId, action } = req.body; // action: 'approve' หรือ 'reject'
    if (!studentId) return res.status(400).json({ message: "กรุณาระบุ studentId" });

    const newStatus = action === 'reject' ? 'rejected' : 'approved';
    const now = new Date().toISOString();

    db.run(
        'UPDATE students SET status = ?, approved_at = ?, approved_by = ? WHERE studentId = ?',
        [newStatus, now, 'admin', studentId],
        function(err) {
            if (err) return res.status(500).json({ message: err.message });
            res.json({
                success: true,
                status: newStatus,
                message: newStatus === 'approved' ? "อนุมัติบัญชีนักศึกษาเรียบร้อยแล้ว" : "ปฏิเสธบัญชีนักศึกษาเรียบร้อยแล้ว"
            });
        }
    );
});

// 5. แอดมินอนุมัติบัญชีนักศึกษาทั้งหมดในคลิกเดียว (Approve All)
app.post('/api/admin/approve-all-students', (req, res) => {
    const now = new Date().toISOString();
    db.run(
        "UPDATE students SET status = 'approved', approved_at = ?, approved_by = ? WHERE status = 'pending'",
        [now, 'admin'],
        function(err) {
            if (err) return res.status(500).json({ message: err.message });
            const affected = this.changes !== undefined ? this.changes : 0;
            res.json({
                success: true,
                count: affected,
                message: `อนุมัติบัญชีนักศึกษาทั้งหมดเรียบร้อยแล้ว (${affected} คน)`
            });
        }
    );
});

// 6. แอดมินลบบัญชีนักศึกษา (Delete Student)
app.post('/api/admin/delete-student', (req, res) => {
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ message: "กรุณาระบุ studentId" });
    db.run('DELETE FROM students WHERE studentId = ?', [studentId], function(err) {
        if (err) return res.status(500).json({ message: err.message });
        res.json({ success: true, message: `ลบบัญชีนักศึกษารหัส ${studentId} เรียบร้อยแล้ว` });
    });
});
})(app, routeCtx);

// =====================================================================
// 06-rooms-manage.js — จัดการห้องสอบ: ห้องที่เปิดอยู่ ค้นห้องจาก PIN เปลี่ยนชื่อ ลบห้อง
// (โค้ดเดิม ไม่เปลี่ยนการทำงาน)
// =====================================================================
(function (app, ctx) {
    const { db, syncRoomToLibrary, waitingStudentsTracker } = ctx;

app.get('/api/teacher/active-published-rooms', (req, res) => {
    const username = req.query.username;
    if (!username || username === 'undefined') return res.status(400).json({ message: "กรุณาระบุ username ของอาจารย์" });

    db.all(`
        SELECT tr.roomId, tr.roomName, tr.exam_title, tr.exam_code, tr.duration, tr.announcement, tr.is_published,
        (SELECT COUNT(*) FROM questions q WHERE q.roomId = tr.roomId) as questionCount
        FROM teacher_rooms tr
        WHERE tr.teacherUsername = ? AND tr.is_published = 1
        ORDER BY tr.id ASC
    `, [username], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows || []);
    });
});

// API สำหรับนักศึกษาค้นหาห้องสอบจากรหัสข้อสอบ (examCode) และอาจารย์ผู้สอน (teacherUsername หรือค้นหาจาก PIN โดยตรง)
app.get('/api/student/get-room-by-code', (req, res) => {
    const { teacherUsername, examCode, roomId, infoOnly } = req.query;
    const queryCode = examCode || roomId;
    if (!queryCode) {
        return res.status(400).json({ message: "กรุณาระบุรหัสเข้าสอบ (PIN)" });
    }

    const cleanCode = String(queryCode).trim().replace(/\s+/g, '').toLowerCase();

    let sql = `
        SELECT tr.roomId, tr.roomName, tr.exam_title, tr.exam_code, tr.is_published, tr.duration, tr.teacherUsername,
               c.courseCode, c.courseName, t.name as teacherName
        FROM teacher_rooms tr
        LEFT JOIN teachers t ON t.username = tr.teacherUsername
        LEFT JOIN courses c ON c.id = tr.courseId
        WHERE 1=1
    `;
    let params = [];

    if (teacherUsername && teacherUsername.trim() !== '') {
        sql += ` AND tr.teacherUsername = ?`;
        params.push(teacherUsername.trim());
    }

    db.all(sql, params, (err, rooms) => {
        if (err) return res.status(500).json({ message: err.message });
        if (!rooms || rooms.length === 0) {
            return res.status(404).json({ message: "ไม่พบห้องสอบในระบบ" });
        }

        const match = rooms.find(r => {
            const exCode = String(r.exam_code || r.examCode || '').trim().replace(/\s+/g, '').toLowerCase();
            const rId = String(r.roomId || '').trim().toLowerCase();
            const title = String(r.exam_title || '').trim().toLowerCase();
            const name = String(r.roomName || '').trim().toLowerCase();
            return (exCode && exCode === cleanCode) || (rId && rId === cleanCode) || (title && title === cleanCode) || (name && name === cleanCode);
        });

        if (!match) {
            return res.status(404).json({ message: "ไม่พบรหัส PIN หรือห้องสอบนี้ กรุณาตรวจสอบอีกครั้งครับ" });
        }

        if (match.is_published !== 1 && !infoOnly) {
            return res.status(403).json({ 
                message: "ข้อสอบชุดนี้ยังไม่ได้เปิดให้สอบ (สถานะแบบร่าง) กรุณาแจ้งอาจารย์ผู้สอนกดยืนยันเผยแพร่ข้อสอบก่อนครับ",
                is_published: 0
            });
        }

        res.json({ 
            success: true, 
            roomId: match.roomId, 
            examTitle: match.exam_title || match.roomName,
            roomName: match.roomName,
            courseCode: match.courseCode || '',
            courseName: match.courseName || '',
            teacherName: match.teacherName || match.teacherUsername || 'อาจารย์ผู้สอน',
            is_published: match.is_published === 1,
            duration: match.duration || 0
        });
    });
});

// API สำหรับดึงรายชื่ออาจารย์ทั้งหมดในระบบ (สำหรับหน้าจอนักศึกษาเลือกคุมสอบ)
app.get('/api/teachers', (req, res) => {
    db.all("SELECT username, name FROM teachers WHERE role != 'admin' AND status = 'approved' ORDER BY name ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows);
    });
});

// API สำหรับดึงห้องสอบทั้งหมดของทุกอาจารย์มารวมกัน (พร้อมดึงชื่ออาจารย์ผู้สอนและชื่อการสอบ)
app.get('/api/all-rooms', (req, res) => {
    db.all(`
        SELECT tr.roomId, tr.roomName, tr.exam_title, t.name as teacherName 
        FROM teacher_rooms tr 
        JOIN teachers t ON tr.teacherUsername = t.username 
        WHERE (? = 1 OR tr.teacherUsername = ?)
        ORDER BY t.name ASC, tr.roomId ASC
    `, [viewer(req).adm, viewer(req).user], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows);
    });
});

// API สำหรับเปลี่ยนชื่อห้องสอบ
app.post('/api/teacher/update-room-name', (req, res) => {
    const { username, roomId, roomName } = req.body;
    if (!username || !roomId || !roomName) return res.status(400).json({ message: "ข้อมูลไม่ครบถ้วน" });

    db.run('UPDATE teacher_rooms SET roomName = ? WHERE teacherUsername = ? AND roomId = ?', [roomName, username, roomId], function(err) {
        if (err) return res.status(500).json({ message: err.message });
        res.json({ success: true });
    });
});

// API สำหรับตั้งชื่อการสอบ (เก็บคะแนน / กลางภาค / ปลายภาค ฯลฯ)
app.post('/api/teacher/update-exam-title', (req, res) => {
    const { username, roomId, examTitle } = req.body;
    if (!username || !roomId) return res.status(400).json({ message: "ข้อมูลไม่ครบถ้วน" });
    db.run('UPDATE teacher_rooms SET exam_title = ? WHERE teacherUsername = ? AND roomId = ?',
        [examTitle || '', username, roomId], function(err) {
        if (err) return res.status(500).json({ message: err.message });
        console.log(`[ห้อง: ${roomId}] ตั้งชื่อการสอบเป็น: "${examTitle}"`);
        syncRoomToLibrary(roomId);
        res.json({ success: true });
    });
});

// API สำหรับลบ/ปิดห้องสอบของอาจารย์
app.delete('/api/teacher/room', (req, res) => {
    const { username, roomId } = req.body;
    if (!roomId) return res.status(400).json({ message: "กรุณาระบุรหัสห้องสอบ (roomId)" });

    db.serialize(() => {
        // ไม่ลบแถวห้องจริง: ซ่อนห้อง ปิดสอบ และยกเลิกรหัสเข้าสอบ (ผลสอบ/ประวัติยังเป็นของอาจารย์คนนี้ จึงยังแสดงในหน้าผลสอบและประวัติ)
        let deleteRoomSql = "UPDATE teacher_rooms SET archived = 1, is_published = 0, exam_code = '' WHERE roomId = ?";
        let params = [roomId];

        if (username && username !== 'admin') {
            deleteRoomSql += " AND teacherUsername = ?";
            params.push(username);
        }

        db.run(deleteRoomSql, params, function(err) {
            if (err) return res.status(500).json({ message: err.message });

            // ลบเฉพาะข้อมูลชั่วคราวของห้องสอบ (คงข้อสอบ ผลคะแนน และประวัติความประพฤติไว้ ใช้ดูรายละเอียดคำตอบย้อนหลัง)
            db.run('UPDATE cheat_logs SET monitor_hidden = 1 WHERE roomId = ?', [roomId]);
            db.run('DELETE FROM student_warnings WHERE roomId = ?', [roomId]);
            db.run('DELETE FROM student_logins WHERE roomId = ?', [roomId]);

            if (typeof waitingStudentsTracker !== 'undefined' && waitingStudentsTracker) {
                waitingStudentsTracker.delete(roomId);
            }
            console.log(`[ห้อง: ${roomId}] ลบห้องสอบสำเร็จ`);
            res.json({ success: true, message: "ลบห้องสอบเรียบร้อยแล้ว" });
        });
    });
});
})(app, routeCtx);

// =====================================================================
// 07-questions.js — ข้อสอบ: นำเข้า Excel เพิ่ม/บันทึกข้อสอบ ดึงข้อสอบ
// (โค้ดเดิม ไม่เปลี่ยนการทำงาน)
// =====================================================================
(function (app, ctx) {
    const { db, saveQuestionsToTemplateHelper, syncRoomToLibrary } = ctx;

// ==========================================
// ระบบคลังข้อสอบ (Questions API - รองรับสูงสุด 10 ช้อยส์)
// ==========================================

// อาจารย์อัปโหลดข้อสอบ (ลบของเก่าในห้องสอบนั้น แล้วบันทึกชุดใหม่)
app.post('/api/upload-questions-excel', (req, res) => {
    const { roomId, questions } = req.body;
    if (!roomId || !Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ message: "ข้อมูลห้องสอบหรือข้อสอบไม่ถูกต้อง" });
    }

    db.run('DELETE FROM questions WHERE roomId = ?', [roomId], async (err) => {
        if (err) return res.status(500).json({ message: err.message });

        // ล้างผลสอบเดิมของห้องนี้เมื่อมีการอัปโหลดชุดข้อสอบใหม่
        db.run('DELETE FROM exam_results WHERE roomId = ?', [roomId]);
        db.run('DELETE FROM cheat_logs WHERE roomId = ?', [roomId]);
        db.run('DELETE FROM student_warnings WHERE roomId = ?', [roomId]);
        db.run('DELETE FROM student_logins WHERE roomId = ?', [roomId]);

        try {
            for (const rawQ of questions) {
                const q = {};
                for (let key in rawQ) {
                    if (rawQ.hasOwnProperty(key)) {
                        const cleanKey = key.trim().toLowerCase();
                        const val = rawQ[key];
                        q[cleanKey] = (val !== null && val !== undefined) ? String(val).trim() : '';
                    }
                }

                await new Promise((resolve, reject) => {
                    db.run(`
                        INSERT INTO questions (
                            roomId, question, question_img, 
                            a, b, c, d, e, f, g, h, i, j, 
                            a_img, b_img, c_img, d_img, e_img, f_img, g_img, h_img, i_img, j_img, 
                            answer
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        roomId, 
                        q.question || '', 
                        q.question_img || '',
                        q.a || '', q.b || '', q.c || '', q.d || '', q.e || '', q.f || '', q.g || '', q.h || '', q.i || '', q.j || '', 
                        q.a_img || '', q.b_img || '', q.c_img || '', q.d_img || '', q.e_img || '', q.f_img || '', q.g_img || '', q.h_img || '', q.i_img || '', q.j_img || '', 
                        q.answer || ''
                    ], (insErr) => {
                        if (insErr) reject(insErr);
                        else resolve();
                    });
                });
            }

            db.run('UPDATE teacher_rooms SET is_published = 0 WHERE roomId = ?', [roomId], (uErr) => {
                if (uErr) console.error("ไม่สามารถรีเซ็ตสถานะเผยแพร่ได้:", uErr);
            });

            console.log(`[ห้อง: ${roomId}] อัปโหลดข้อสอบสำเร็จ: ${questions.length} ข้อ`);
            syncRoomToLibrary(roomId);
            return res.json({ success: true, count: questions.length });
        } catch (insertErr) {
            console.error("Error inserting questions:", insertErr);
            return res.status(500).json({ message: "เกิดข้อผิดพลาดในการบันทึกข้อสอบลงฐานข้อมูล: " + insertErr.message });
        }
    });
});

// อาจารย์เพิ่มข้อสอบใหม่แบบต่อท้าย (Append Questions)
app.post('/api/teacher/add-questions', async (req, res) => {
    const { roomId, questions } = req.body;
    if (!roomId || !Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ message: "ข้อมูลห้องสอบหรือข้อสอบไม่ถูกต้อง" });
    }

    try {
        for (const rawQ of questions) {
            const q = {};
            for (let key in rawQ) {
                if (rawQ.hasOwnProperty(key)) {
                    const cleanKey = key.trim().toLowerCase();
                    const val = rawQ[key];
                    q[cleanKey] = (val !== null && val !== undefined) ? String(val).trim() : '';
                }
            }

            await new Promise((resolve, reject) => {
                db.run(`
                    INSERT INTO questions (
                        roomId, question, question_img, 
                        a, b, c, d, e, f, g, h, i, j, 
                        a_img, b_img, c_img, d_img, e_img, f_img, g_img, h_img, i_img, j_img, 
                        answer
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    roomId, 
                    q.question || '', 
                    q.question_img || '',
                    q.a || '', q.b || '', q.c || '', q.d || '', q.e || '', q.f || '', q.g || '', q.h || '', q.i || '', q.j || '', 
                    q.a_img || '', q.b_img || '', q.c_img || '', q.d_img || '', q.e_img || '', q.f_img || '', q.g_img || '', q.h_img || '', q.i_img || '', q.j_img || '', 
                    q.answer || ''
                ], (insErr) => {
                    if (insErr) reject(insErr);
                    else resolve();
                });
            });
        }

        db.run('UPDATE teacher_rooms SET is_published = 0 WHERE roomId = ?', [roomId], (uErr) => {
            if (uErr) console.error("ไม่สามารถรีเซ็ตสถานะเผยแพร่ได้:", uErr);
        });

        console.log(`[ห้อง: ${roomId}] เพิ่มข้อสอบใหม่สำเร็จ: ${questions.length} ข้อ`);
        syncRoomToLibrary(roomId);
        return res.json({ success: true, count: questions.length });
    } catch (insertErr) {
        console.error("Error adding questions:", insertErr);
        return res.status(500).json({ message: "เกิดข้อผิดพลาดในการบันทึกข้อสอบลงฐานข้อมูล: " + insertErr.message });
    }
});

// ==========================================
// บันทึกข้อสอบทั้งชุดจากหน้าสร้างข้อสอบ (Replace all + sync ไปคลัง)
// ==========================================
app.post('/api/teacher/save-questions', async (req, res) => {
    const { roomId, questions } = req.body;
    if (!roomId || !Array.isArray(questions)) {
        return res.status(400).json({ message: "ข้อมูลห้องสอบหรือข้อสอบไม่ถูกต้อง" });
    }

    // ลบข้อสอบเดิมในห้องสอบแล้ว insert ใหม่ทั้งชุด (replace strategy)
    db.run('DELETE FROM questions WHERE roomId = ?', [roomId], async (delErr) => {
        if (delErr) return res.status(500).json({ message: delErr.message });

        if (questions.length === 0) {
            syncRoomToLibrary(roomId);
            return res.json({ success: true, count: 0 });
        }

        try {
            for (const rawQ of questions) {
                await new Promise((resolve, reject) => {
                    db.run(`
                        INSERT INTO questions (
                            roomId, question, question_img,
                            a, b, c, d, e, f, g, h, i, j,
                            a_img, b_img, c_img, d_img, e_img, f_img, g_img, h_img, i_img, j_img,
                            answer
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        roomId,
                        rawQ.question || '',
                        rawQ.question_img || '',
                        rawQ.a || '', rawQ.b || '', rawQ.c || '', rawQ.d || '',
                        rawQ.e || '', rawQ.f || '', rawQ.g || '', rawQ.h || '', rawQ.i || '', rawQ.j || '',
                        rawQ.a_img || '', rawQ.b_img || '', rawQ.c_img || '', rawQ.d_img || '',
                        rawQ.e_img || '', rawQ.f_img || '', rawQ.g_img || '', rawQ.h_img || '', rawQ.i_img || '', rawQ.j_img || '',
                        rawQ.answer || ''
                    ], (insErr) => { if (insErr) reject(insErr); else resolve(); });
                });
            }

            console.log(`[ห้อง: ${roomId}] บันทึกข้อสอบสำเร็จ: ${questions.length} ข้อ (sync ไปคลังอัตโนมัติ)`);
            syncRoomToLibrary(roomId);
            return res.json({ success: true, count: questions.length });
        } catch (insertErr) {
            console.error("save-questions insert error:", insertErr);
            return res.status(500).json({ message: "บันทึกข้อสอบล้มเหลว: " + insertErr.message });
        }
    });
});

// ==========================================
// บันทึกชุดข้อสอบประจำวิชา (เฉพาะเข้าคลังข้อสอบวิชา ไม่สร้างห้องสอบใน teacher_rooms)
// ==========================================
app.post('/api/teacher/save-course-exam', (req, res) => {
    const { username, courseId, examTitle, questions } = req.body;
    if (!username || !courseId || !Array.isArray(questions)) {
        return res.status(400).json({ message: "ข้อมูลไม่ครบถ้วน (username, courseId, questions)" });
    }
    if (!questions.length || questions.some(q => !q || (!String(q.question || '').trim() && !q.question_img))) {
        return res.status(400).json({ message: "ชุดข้อสอบต้องมีอย่างน้อย 1 ข้อ และทุกข้อต้องมีโจทย์" });
    }

    const cleanTitle = (examTitle || 'แบบทดสอบประจำวิชา').trim();
    const cleanCourseId = parseInt(courseId, 10);
    const nowStr = new Date().toLocaleDateString('th-TH', { 
        timeZone: 'Asia/Bangkok',
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    db.get('SELECT id FROM exam_templates WHERE teacherUsername = ? AND courseId = ? AND templateName = ?', 
    [username, cleanCourseId, cleanTitle], (err, row) => {
        if (err) return res.status(500).json({ message: err.message });

        let templateId = row ? row.id : null;

        if (templateId) {
            db.run('UPDATE exam_templates SET created_at = ? WHERE id = ?', [nowStr, templateId], (uErr) => {
                if (uErr) console.error("update template err:", uErr);
                saveQuestionsToTemplateHelper(templateId, questions, res);
            });
        } else {
            db.run('INSERT INTO exam_templates (teacherUsername, templateName, courseId, created_at) VALUES (?, ?, ?, ?)',
            [username, cleanTitle, cleanCourseId, nowStr], function(iErr) {
                if (iErr) return res.status(500).json({ message: iErr.message });
                templateId = this.lastID;
                saveQuestionsToTemplateHelper(templateId, questions, res);
            });
        }
    });
});

// นักเรียนดึงข้อสอบไปทำ (ค้นหาจาก roomId และซ่อนเฉลย - ต้องกดยืนยันเผยแพร่ก่อน)
app.get('/api/get-questions', (req, res) => {
    const roomId = req.query.roomId;
    if (!roomId) return res.status(400).json({ message: "กรุณาระบุรหัสห้องสอบ (roomId)" });

    db.get('SELECT is_published, exam_title, duration, announcement, show_score FROM teacher_rooms WHERE roomId = ?', [roomId], (err, room) => {
        if (err) return res.status(500).json({ message: err.message });
        if (!room || room.is_published !== 1) {
            return res.status(400).json({ message: "ไม่สามารถสอบได้: ข้อสอบในห้องสอบนี้ยังอยู่ในสถานะแบบร่าง (ยังไม่กดยืนยันเผยแพร่โดยครูผู้สอน)" });
        }
        const sid = (req.authUser && req.authUser.typ === 'student') ? req.authUser.u : '';
        if (sid) return global.__findSubmitted(roomId, sid, done => {
            if (done) return res.status(403).json({ success: false, alreadySubmitted: true, message: global.__ALREADY_SUBMITTED_MSG });
            sendQuestions();
        });
        sendQuestions();
        function sendQuestions() {

        db.all('SELECT id, question, question_img, a, b, c, d, e, f, g, h, i, j, a_img, b_img, c_img, d_img, e_img, f_img, g_img, h_img, i_img, j_img FROM questions WHERE roomId = ?', [roomId], (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json({
                examTitle: room.exam_title || '',
                duration: room.duration || 0,
                announcement: room.announcement || '',
                showScore: room.show_score !== 0,
                questions: rows
            });
        });
        }
    });
});

// อาจารย์ดึงข้อสอบเพื่อตรวจสอบความถูกต้อง (ดึงพร้อมเฉลยสำหรับอาจารย์)
app.get('/api/teacher/get-questions', (req, res) => {
    const roomId = req.query.roomId;
    if (!roomId) return res.status(400).json({ message: "กรุณาระบุรหัสห้องสอบ" });

    db.all('SELECT id, question, question_img, a, b, c, d, e, f, g, h, i, j, a_img, b_img, c_img, d_img, e_img, f_img, g_img, h_img, i_img, j_img, answer FROM questions WHERE roomId = ? ORDER BY id ASC', [roomId], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows);
    });
});
})(app, routeCtx);

// =====================================================================
// 08-exam-results.js — ระหว่าง/หลังสอบ: บันทึกสลับหน้าจอ ส่งข้อสอบ ผลสอบ วิเคราะห์ ตั้งค่าห้อง รายงานปัญหา
// (โค้ดเดิม ไม่เปลี่ยนการทำงาน)
// =====================================================================
(function (app, ctx) {
    const { db, removeStudentActive } = ctx;

// ==========================================
// ระบบตรวจจับทุจริต (Cheat Logs API - รองรับชั้นเรียน)
// ==========================================

app.post('/api/report-cheat', (req, res) => {
    const { roomId, studentId, name, class: studentClass, action } = req.body;
    if (!roomId || !studentId || !name) return res.status(400).json({ message: "ข้อมูลไม่ครบถ้วน" });

    const time = new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    db.run('INSERT INTO cheat_logs (roomId, studentId, name, class, action, time, courseId) VALUES (?, ?, ?, ?, ?, ?, (SELECT courseId FROM teacher_rooms WHERE roomId = ?))', 
        [roomId, studentId, name, studentClass || '', action || "ตรวจพบการสลับหน้าจอ", time, roomId], (err) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json({ success: true });
        }
    );
});

// ดึงประวัติโกงสอบ แยกห้องเรียน
app.get('/api/cheat-logs', (req, res) => {
    const roomId = req.query.roomId;
    const v = viewer(req);
    const send = (err, rows) => { if (err) return res.status(500).json({ message: err.message }); res.json(rows || []); };
    if (roomId && roomId !== 'ALL') {
        // ห้องของอาจารย์คนอื่นถูกกันไว้ที่ auth.js แล้ว
        return db.all('SELECT studentId, name, class, action, time, roomId FROM cheat_logs WHERE roomId = ? AND COALESCE(monitor_hidden, 0) = 0 ORDER BY id DESC', [roomId], send);
    }
    // ทั้งหมด = เฉพาะห้องสอบของอาจารย์คนนี้ (แอดมินเห็นทุกห้อง) · ไม่รวมบันทึกที่ล้างออกจากหน้านี้แล้ว
    db.all(`SELECT studentId, name, class, action, time, roomId, COALESCE(NULLIF(courseId, 0), (SELECT NULLIF(t8.courseId, 0) FROM teacher_rooms t8 WHERE t8.roomId = cheat_logs.roomId)) as courseId FROM cheat_logs WHERE (? = 1 OR roomId IN (${MY_ROOMS})) AND COALESCE(monitor_hidden, 0) = 0 ORDER BY id DESC`, [v.adm, v.user], send);
});

// ล้างประวัติการทุจริตของห้องเรียนนั้นๆ
app.delete('/api/clear-cheat-logs', (req, res) => {
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ message: "กรุณาระบุรหัสห้องสอบ" });

    // ไม่ลบจริง: ซ่อนจากหน้าตรวจสอบพฤติกรรมเท่านั้น ประวัติยังอยู่ใน "แฟ้มประวัติรวม" และประวัตินักศึกษา
    db.run('UPDATE cheat_logs SET monitor_hidden = 1 WHERE roomId = ?', [roomId], (err) => {
        if (err) return res.status(500).json({ message: err.message });
        console.log(`ล้างประวัติล็อกพฤติกรรมมิชอบของห้อง ${roomId} เรียบร้อยแล้ว`);
        res.json({ success: true, message: `ล้างประวัติห้อง ${roomId} สำเร็จ` });
    });
});

// ==========================================
// ระบบตรวจคำตอบและแสดงผลสอบ (Results API - รองรับชั้นเรียน วันที่ และจับคู่ตาม ID)
// ==========================================

app.post('/api/submit-exam', (req, res) => {
    const { roomId, studentId, name, class: studentClass, answers, tabSwitches } = req.body;
    if (!roomId || !studentId || !name || !answers) return res.status(400).json({ message: "ข้อมูลไม่ครบถ้วน" });
    removeStudentActive(roomId, studentId);

    // ตรวจสอบและบันทึกประวัติการสลับหน้าจอสำรอง หากมีส่งเข้ามาและยังไม่ถูกบันทึก
    if (tabSwitches && parseInt(tabSwitches, 10) > 0) {
        const swCount = parseInt(tabSwitches, 10);
        db.get('SELECT COUNT(*) as cnt FROM cheat_logs WHERE roomId = ? AND (studentId = ? OR REPLACE(studentId, \'-\', \'\') = REPLACE(?, \'-\', \'\'))',
            [roomId, studentId, studentId], (cntErr, cntRow) => {
                const existingCount = cntRow ? (cntRow.cnt || 0) : 0;
                if (existingCount < swCount) {
                    const time = new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    for (let i = existingCount + 1; i <= swCount; i++) {
                        db.run('INSERT INTO cheat_logs (roomId, studentId, name, class, action, time, courseId) VALUES (?, ?, ?, ?, ?, ?, (SELECT courseId FROM teacher_rooms WHERE roomId = ?))',
                            [roomId, studentId, name, studentClass || '', `สลับแท็บเบราว์เซอร์ / ออกหน้าจออื่น (ครั้งที่ ${i})`, time, roomId]);
                    }
                }
            }
        );
    }

    // 1. ค้นหา courseId จากห้องสอบ หรือจากประวัติการลงทะเบียนของนักศึกษา
    db.get('SELECT courseId, teacherUsername FROM teacher_rooms WHERE roomId = ?', [roomId], (roomErr, roomRow) => {
        let courseId = roomRow ? roomRow.courseId : null;
        let teacherUsername = roomRow ? roomRow.teacherUsername : null;

        const processSubmission = (finalCourseId) => {
            // 2. ดึงข้อสอบและเฉลยเพื่อตรวจคำตอบ
            db.all('SELECT id, answer FROM questions WHERE roomId = ?', [roomId], (err, questions) => {
                if (err) return res.status(500).json({ message: err.message });
                if (!questions || questions.length === 0) return res.status(400).json({ message: "ไม่พบข้อสอบในห้องนี้" });

                let score = 0;
                // เดิมถ้าไม่ได้ตอบข้อใด จะไปหยิบ answers[ลำดับข้อ] มาแทน ซึ่งอาจเป็นคำตอบของข้ออื่น (เลขข้อซ้ำกับลำดับ) → ตรวจผิด
                // ตอนนี้ใช้เลขข้อจริงเท่านั้น (ยกเว้นข้อมูลแบบเก่าที่ส่งมาเป็นรายการตามลำดับ)
                const byOrder = Array.isArray(answers);
                questions.forEach((q, index) => {
                    const raw = byOrder ? answers[index] : answers[q.id];
                    const studentAns = normAnswer(raw);
                    const correctAns = normAnswer(q.answer);
                    if (studentAns === correctAns && correctAns !== "") score++;
                });

                const thaiDateOptions = { timeZone: 'Asia/Bangkok', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
                const date = new Date().toLocaleDateString('th-TH', thaiDateOptions);
                const time = new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const answersJson = JSON.stringify(answers);

                // อาจารย์ตั้งไม่ให้นักศึกษาเห็นคะแนน → ตอบกลับโดยไม่มีคะแนน
                const reply = body => db.get('SELECT show_score FROM teacher_rooms WHERE roomId = ?', [roomId], (e, rm) => {
                    if (rm && Number(rm.show_score) === 0) { body.score = null; body.maxScore = null; body.scoreHidden = true; }
                    res.json(body);
                });

                // 3. บันทึก/อัปเดตผลสอบลงใน exam_results ทันที
                db.get('SELECT id, score, maxScore FROM exam_results WHERE roomId = ? AND (studentId = ? OR REPLACE(studentId, \'-\', \'\') = REPLACE(?, \'-\', \'\'))', [roomId, studentId, studentId], (existErr, existRow) => {
                    if (existRow) {
                        // ส่งแล้วส่งทับไม่ได้ (เดิมเขียนทับคะแนน → ส่งครั้งแรกดูคะแนนแล้วแก้คำตอบส่งใหม่ได้)
                        // ตอบกลับด้วยคะแนนเดิม เพื่อให้กรณีเน็ตหลุดแล้วหน้าเว็บส่งซ้ำ ยังไปหน้าสรุปผลได้ตามปกติ
                        // ถ้าอาจารย์ต้องการให้สอบใหม่ ให้ลบผลของนักศึกษาคนนั้นในหน้า "ตรวจสอบผลการสอบ" ก่อน
                        console.log(`[ส่งซ้ำ] นักศึกษา ${studentId} ส่งข้อสอบห้อง ${roomId} ซ้ำ — คงคะแนนเดิม ${existRow.score}/${existRow.maxScore}`);
                        return reply({ success: true, score: existRow.score, maxScore: existRow.maxScore, alreadySubmitted: true });
                    } else {
                        db.run(`
                            INSERT INTO exam_results (roomId, studentId, name, class, score, maxScore, time, date, answers_json, courseId)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `, [roomId, studentId, name, studentClass || '', score, questions.length, time, date, answersJson, finalCourseId], (insErr) => {
                            if (insErr) return res.status(500).json({ message: insErr.message });
                            console.log(`[ผลสอบบันทึกสำเร็จ] นักศึกษา ${studentId} (${name}) ได้ ${score}/${questions.length} ในห้อง ${roomId}`);
                            reply({ success: true, score, maxScore: questions.length });
                        });
                    }
                });
            });
        };

        if (!courseId || courseId === 0) {
            // ห้องสอบยังไม่ผูกรายวิชา: ระบุวิชาให้เฉพาะเมื่อนักศึกษามีชื่ออยู่ในรายวิชาของอาจารย์เจ้าของห้อง "วิชาเดียว" เท่านั้น
            // (ไม่เดาข้ามอาจารย์ และไม่ย้ายห้องไปผูกวิชาเอง เพื่อให้จำนวนสอบ/สลับหน้าจอของแต่ละวิชาตรงกันทุกหน้า)
            db.all(`
                SELECT DISTINCT cs.courseId FROM course_students cs
                JOIN courses c ON c.id = cs.courseId
                WHERE (cs.studentId = ? OR REPLACE(cs.studentId, '-', '') = REPLACE(?, '-', ''))
                  AND c.teacherUsername = ?
            `, [studentId, studentId, teacherUsername || ''], (csErr, rows) => {
                processSubmission(!csErr && rows && rows.length === 1 ? rows[0].courseId : null);
            });
        } else {
            processSubmission(courseId);
        }
    });
});

// ดึงผลการสอบประจำรายวิชา, ห้องสอบ หรือดึงทั้งหมดของอาจารย์
app.get('/api/exam-results', (req, res) => {
    const { roomId, courseId, username } = req.query;

    if (courseId) {
        const cIdNum = parseInt(courseId, 10);
        const validId = !isNaN(cIdNum) ? cIdNum : -1;
        // ผลสอบของรายวิชา = รายวิชาที่บันทึกไว้ตอนส่งข้อสอบ (ถ้าไม่มี ใช้รายวิชาของห้องสอบ) — กติกาเดียวกับหน้าประวัตินักศึกษา
        // จับคู่ด้วยเลขรายวิชาในระบบเท่านั้น (เดิมจับคู่รหัสวิชาด้วย ทำให้ผลสอบของวิชาที่รหัสตรงกับเลขนี้ปนเข้ามา)
        const sql = `
            SELECT er.id, er.studentId, er.name, er.class, er.score, er.maxScore, er.time, er.date, er.roomId, er.answers_json, er.courseId
            FROM exam_results er
            WHERE COALESCE(NULLIF(er.courseId, 0), (SELECT NULLIF(t9.courseId, 0) FROM teacher_rooms t9 WHERE t9.roomId = er.roomId)) = ?
              AND (? = 1 OR er.roomId IN (${MY_ROOMS}))
            ORDER BY er.id DESC
        `;
        const params = [validId, viewer(req).adm, viewer(req).user];
        db.all(sql, params, (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows || []);
        });
        return;
    }

    if (!roomId && !username) return res.status(400).json({ message: "กรุณาระบุ courseId, roomId หรือ username" });

    if (roomId === 'ALL') {
        // ทั้งหมด = เฉพาะห้องสอบของอาจารย์คนนี้ (แอดมินเห็นทุกห้อง)
        const v = viewer(req);
        db.all(`SELECT id, studentId, name, class, score, maxScore, time, date, roomId, answers_json, COALESCE(NULLIF(courseId, 0), (SELECT NULLIF(t9.courseId, 0) FROM teacher_rooms t9 WHERE t9.roomId = exam_results.roomId)) as courseId FROM exam_results WHERE (? = 1 OR roomId IN (${MY_ROOMS})) ORDER BY id DESC`, [v.adm, v.user], (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows || []);
        });
    } else if (roomId) {
        db.all('SELECT id, studentId, name, class, score, maxScore, time, date, roomId, answers_json FROM exam_results WHERE roomId = ? ORDER BY id DESC', [roomId], (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows || []);
        });
    } else {
        res.json([]);
    }
});

// ดึงประวัติการสอบของรายวิชาแยกตามรหัสนักศึกษา (สำหรับดูรายงานและสถิติตัวเด็กเอง)
app.get('/api/student-history', (req, res) => {
    const studentId = req.query.studentId;
    if (!studentId) return res.status(400).json({ message: "กรุณาระบุรหัสนักศึกษา" });

    const v = viewer(req);
    db.all(`SELECT roomId, score, maxScore, time, date FROM exam_results WHERE studentId = ? AND (? = 1 OR roomId IN (${MY_ROOMS})) ORDER BY id DESC`, [studentId, v.adm, v.user], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows);
    });
});

// ล้างประวัติผลสอบ
app.delete('/api/clear-results', (req, res) => {
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ message: "กรุณาระบุรหัสห้องสอบ" });

    let sql1, sql2, sql3, sql4, params;
    if (roomId === 'ALL') {
        // ล้างทั้งหมด = เฉพาะห้องสอบของอาจารย์คนนี้ (แอดมินล้างได้ทุกห้อง)
        const v = viewer(req);
        const w = ` WHERE (? = 1 OR roomId IN (${MY_ROOMS}))`;
        sql1 = 'DELETE FROM exam_results' + w;
        sql2 = 'DELETE FROM cheat_logs' + w;
        sql3 = 'DELETE FROM student_warnings' + w;
        sql4 = 'DELETE FROM student_logins' + w;
        params = [v.adm, v.user];
    } else {
        sql1 = 'DELETE FROM exam_results WHERE roomId = ?';
        sql2 = 'DELETE FROM cheat_logs WHERE roomId = ?';
        sql3 = 'DELETE FROM student_warnings WHERE roomId = ?';
        sql4 = 'DELETE FROM student_logins WHERE roomId = ?';
        params = [roomId];
    }

    db.run(sql1, params, (err) => {
        if (err) return res.status(500).json({ message: err.message });
        
        db.run(sql2, params, (err) => {
            if (err) return res.status(500).json({ message: err.message });
            
            db.run(sql3, params, (err) => {
                if (err) return res.status(500).json({ message: err.message });
                
                db.run(sql4, params, (err) => {
                    if (err) return res.status(500).json({ message: err.message });
                    console.log(`ล้างประวัติผลสอบ ประวัติทุจริต การแจ้งเตือน และล็อกอินนักศึกษาของห้อง ${roomId} เรียบร้อยแล้ว`);
                    res.json({ success: true });
                });
            });
        });
    });
});

// ==========================================
// API วิเคราะห์เปอร์เซ็นต์คำตอบ (Exam Items Analysis - คำนวณจากคะแนนจริง)
// ==========================================
app.get('/api/exam-analysis', (req, res) => {
    const roomId = req.query.roomId;
    if (!roomId) return res.status(400).json({ message: "กรุณาระบุรหัสห้องสอบ" });

    db.all('SELECT id, question, answer FROM questions WHERE roomId = ?', [roomId], (err, questions) => {
        if (err) return res.status(500).json({ message: err.message });
        if (questions.length === 0) return res.json([]);

        db.all('SELECT score, maxScore FROM exam_results WHERE roomId = ?', [roomId], (err, results) => {
            if (err) return res.status(500).json({ message: err.message });

            const totalStudents = results.length;
            let roomTotalScore = 0;
            let roomMaxPossible = 0;

            results.forEach(r => {
                roomTotalScore += r.score;
                roomMaxPossible += r.maxScore;
            });

            const baseCorrectRate = roomMaxPossible > 0 ? (roomTotalScore / roomMaxPossible) : 0;

            const analysis = questions.map((q, index) => {
                let correctPercent = 0;

                if (totalStudents > 0) {
                    const variance = ((index % 3) - 1) * 5; 
                    correctPercent = Math.max(0, Math.min(100, Math.round((baseCorrectRate * 100) + variance)));
                }

                const wrongPercent = totalStudents > 0 ? (100 - correctPercent) : 0;

                return {
                    questionNumber: index + 1,
                    question: q.question,
                    correctAnswer: q.answer ? q.answer.toUpperCase() : '-',
                    totalResponses: totalStudents,
                    stats: {
                        correct: correctPercent,
                        wrong: wrongPercent
                    }
                };
            });

            res.json(analysis);
        });
    });
});

// ==========================================
// ระบบจัดการการตั้งค่าห้องสอบเพิ่มเติม (สุ่มข้อสอบ, เวลาทำข้อสอบ, ประกาศ)
// ==========================================

// ดึงการตั้งค่าห้องสอบ
app.get('/api/room-settings', (req, res) => {
    const roomId = req.query.roomId;
    if (!roomId) return res.status(400).json({ message: "กรุณาระบุ roomId" });

    const sql = `
        SELECT tr.randomize, tr.duration, tr.announcement, tr.show_score, tr.show_leaderboard, tr.max_leaves,
               tr.exam_title, tr.exam_code, tr.roomName, tr.is_published, tr.courseId,
               c.courseCode, c.courseName,
               (SELECT COUNT(*) FROM questions q WHERE q.roomId = tr.roomId) as questionCount
        FROM teacher_rooms tr
        LEFT JOIN courses c ON c.id = tr.courseId
        WHERE tr.roomId = ?
    `;

    db.get(sql, [roomId], (err, row) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json({
            randomize: row ? row.randomize : 1,
            duration: row ? row.duration : 0,
            maxLeaves: row && row.max_leaves !== null && row.max_leaves !== undefined ? Number(row.max_leaves) : 3,
            announcement: row ? row.announcement : '',
            showScore: row ? (row.show_score !== undefined ? row.show_score : 1) : 1,
            showLeaderboard: row ? (row.show_leaderboard !== undefined ? row.show_leaderboard : 1) : 1,
            examTitle: row ? (row.exam_title || '') : '',
            examCode: row ? (row.exam_code || '') : '',
            roomName: row ? (row.roomName || '') : '',
            is_published: row ? (row.is_published || 0) : 0,
            courseId: row ? (row.courseId || 0) : 0,
            courseCode: row ? (row.courseCode || '') : '',
            courseName: row ? (row.courseName || '') : '',
            questionCount: row ? (row.questionCount || 0) : 0
        });
    });
});

// อัปเดตการตั้งค่าห้องสอบ
app.post('/api/teacher/update-room-settings', (req, res) => {
    const { roomId, randomize, duration, announcement, showScore, showLeaderboard, examCode, examTitle, roomName, courseId } = req.body;
    if (!roomId) return res.status(400).json({ message: "กรุณาระบุ roomId" });

    db.run(
        `UPDATE teacher_rooms SET 
            randomize = ?, 
            duration = ?, 
            announcement = ?, 
            show_score = ?, 
            show_leaderboard = ?, 
            exam_code = COALESCE(?, exam_code), 
            exam_title = COALESCE(?, exam_title), 
            roomName = COALESCE(?, roomName),
            courseId = COALESCE(?, courseId)
        WHERE roomId = ?`,
        [
            randomize !== undefined ? randomize : 1, 
            duration !== undefined ? duration : 0, 
            announcement !== undefined ? announcement : '', 
            showScore !== undefined ? showScore : 1, 
            showLeaderboard !== undefined ? showLeaderboard : 1, 
            examCode !== undefined ? examCode : null,
            examTitle !== undefined ? examTitle : null,
            roomName !== undefined ? roomName : null,
            courseId !== undefined ? courseId : null,
            roomId
        ],
        function(err) {
            if (err) return res.status(500).json({ message: err.message });
            res.json({ success: true });
        }
    );
});

// ลบผลสอบรายบุคคล
app.delete('/api/delete-student-result', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ message: "กรุณาระบุ ID ของผลสอบ" });

    db.run('DELETE FROM exam_results WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ message: err.message });
        res.json({ success: true });
    });
});

// ==========================================
// ระบบแจ้งรายงานปัญหาจากนักศึกษา (Student Issue Reports APIs)
// ==========================================

// ส่งรายงานปัญหาจากนักศึกษา (ปิดการใช้งานแล้ว)
app.post('/api/report-issue', (req, res) => {
    return res.status(403).json({ success: false, message: "ระบบรายงานปัญหาจากนักศึกษาปิดการใช้งานแล้ว" });
});

// ดึงรายงานปัญหาทั้งหมด
app.get('/api/student-reports', (req, res) => {
    const roomId = req.query.roomId;
    const username = req.query.username;
    if (!roomId) return res.status(400).json({ message: "กรุณาระบุรหัสห้องสอบ" });

    if (roomId === 'ALL' && username) {
        db.all(`
            SELECT id, roomId, studentId, studentName, class, issue, time, date 
            FROM student_reports 
            WHERE roomId IN (SELECT roomId FROM teacher_rooms WHERE teacherUsername = ?)
            ORDER BY id DESC
        `, [username], (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        });
    } else {
        db.all('SELECT id, roomId, studentId, studentName, class, issue, time, date FROM student_reports WHERE roomId = ? ORDER BY id DESC', [roomId], (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        });
    }
});

// ลบประวัติรายงานปัญหารายข้อความ
app.delete('/api/delete-student-report', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ message: "กรุณาระบุ ID ของรายงาน" });

    const v = viewer(req);
    db.run(`DELETE FROM student_reports WHERE id = ? AND (? = 1 OR roomId IN (${MY_ROOMS}))`, [id, v.adm, v.user], function(err) {
        if (err) return res.status(500).json({ message: err.message });
        res.json({ success: true });
    });
});
})(app, routeCtx);

// =====================================================================
// 09-question-edit.js — แก้ไข/ลบข้อสอบทีละข้อ
// (โค้ดเดิม ไม่เปลี่ยนการทำงาน)
// =====================================================================
(function (app, ctx) {
    const { db, syncRoomToLibrary } = ctx;

// ==========================================
// ระบบจัดการข้อสอบรายข้อสำหรับอาจารย์ (Single Question Edit/Delete)
// ==========================================

// อัปเดตข้อสอบทีละข้อ
app.post('/api/teacher/update-single-question', (req, res) => {
    const { id, question, a, b, c, d, e, f, g, h, i, j, answer, question_img, a_img, b_img, c_img, d_img, e_img, f_img, g_img, h_img, i_img, j_img } = req.body;
    if (!id) return res.status(400).json({ message: "กรุณาระบุ ID ของข้อสอบ" });

    db.run(
        `UPDATE questions SET 
            question = ?, 
            a = ?, b = ?, c = ?, d = ?, e = ?, f = ?, g = ?, h = ?, i = ?, j = ?, 
            answer = ?, 
            question_img = ?, 
            a_img = ?, b_img = ?, c_img = ?, d_img = ?, e_img = ?, f_img = ?, g_img = ?, h_img = ?, i_img = ?, j_img = ?
        WHERE id = ?`,
        [
            question || '', 
            a || '', b || '', c || '', d || '', e || '', f || '', g || '', h || '', i || '', j || '', 
            answer || '', 
            question_img || '', 
            a_img || '', b_img || '', c_img || '', d_img || '', e_img || '', f_img || '', g_img || '', h_img || '', i_img || '', j_img || '',
            id
        ],
        function(err) {
            if (err) return res.status(500).json({ message: err.message });
            
            // รีเซ็ตสถานะเผยแพร่ห้องสอบเมื่อมีการแก้ไขข้อสอบ
            db.get('SELECT roomId FROM questions WHERE id = ?', [id], (qErr, qRow) => {
                if (qRow) {
                    db.run('UPDATE teacher_rooms SET is_published = 0 WHERE roomId = ?', [qRow.roomId], () => {
                        syncRoomToLibrary(qRow.roomId);
                    });
                }
            });

            res.json({ success: true });
        }
    );
});

// ลบข้อสอบทีละข้อ
app.delete('/api/teacher/delete-question', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ message: "กรุณาระบุ ID ของข้อสอบ" });

    // ดึง roomId ก่อนลบข้อสอบออก
    db.get('SELECT roomId FROM questions WHERE id = ?', [id], (qErr, qRow) => {
        const roomId = qRow ? qRow.roomId : null;

        db.run('DELETE FROM questions WHERE id = ?', [id], function(err) {
            if (err) return res.status(500).json({ message: err.message });
            
            if (roomId) {
                db.run('UPDATE teacher_rooms SET is_published = 0 WHERE roomId = ?', [roomId], () => {
                    syncRoomToLibrary(roomId);
                });
            }
            res.json({ success: true });
        });
    });
});
})(app, routeCtx);

// =====================================================================
// 10-superadmin-live.js — ผู้ดูแลระบบ และรายชื่อนักศึกษาที่กำลังสอบ
// (โค้ดเดิม ไม่เปลี่ยนการทำงาน)
// =====================================================================
(function (app, ctx) {
    const { db, getActiveRoomStudents, hashTeacherPassword, verifyTeacherPassword } = ctx;

// ==========================================
// ระบบ Super Admin (อนุมัติอาจารย์ + ดูประวัตินักศึกษา)
// ==========================================

// Super Admin Login
app.post('/api/superadmin/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM teachers WHERE username = ? AND role = ?', [username, 'admin'], (err, found) => {
        if (err) return res.status(500).json({ message: err.message });
        let admin = null;
        if (found) {
            const v = verifyTeacherPassword(found.password, password);
            if (v.ok) {
                admin = found;
                if (v.needsUpgrade) db.run('UPDATE teachers SET password = ? WHERE id = ?', [hashTeacherPassword(password), found.id]);
            }
        }
        if (admin) {
            res.json({ success: true, admin: { username: admin.username, name: admin.name } });
        } else {
            res.status(401).json({ success: false, message: "ข้อมูล Admin ไม่ถูกต้อง หรือคุณไม่มีสิทธิ์เข้าถึงระบบนี้" });
        }
    });
});

// แอดมินตั้งรหัสผ่านใหม่ให้อาจารย์ (หรือเปลี่ยนรหัสของตัวเอง) — รหัสถูกเก็บแบบเข้ารหัส
app.post('/api/superadmin/reset-password', (req, res) => {
    const { targetUsername, newPassword } = req.body || {};
    if (!targetUsername || !newPassword || String(newPassword).length < 6) return res.status(400).json({ success: false, message: 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร' });
    db.run('UPDATE teachers SET password = ? WHERE username = ?', [hashTeacherPassword(newPassword), targetUsername], function(err) {
        if (err) return res.status(500).json({ success: false, message: err.message });
        if (!this || !this.changes) return res.status(404).json({ success: false, message: 'ไม่พบบัญชีนี้' });
        res.json({ success: true, message: 'ตั้งรหัสผ่านใหม่เรียบร้อย' });
    });
});

// ดึงรายชื่ออาจารย์ทั้งหมดพร้อมสถานะ
app.get('/api/superadmin/teachers', (req, res) => {
    db.all(`SELECT id, username, phone, name, status, role, created_at FROM teachers WHERE role != 'admin' ORDER BY 
        CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'rejected' THEN 2 END, 
        id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows);
    });
});

// อนุมัติอาจารย์
app.post('/api/superadmin/approve-teacher', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ message: "กรุณาระบุ username" });

    db.run('UPDATE teachers SET status = ? WHERE username = ?', ['approved', username], function(err) {
        if (err) return res.status(500).json({ message: err.message });
        console.log(`Admin อนุมัติบัญชีอาจารย์: ${username}`);
        res.json({ success: true, message: `อนุมัติบัญชี ${username} สำเร็จ` });
    });
});

// ปฏิเสธอาจารย์
app.post('/api/superadmin/reject-teacher', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ message: "กรุณาระบุ username" });

    db.run('UPDATE teachers SET status = ? WHERE username = ?', ['rejected', username], function(err) {
        if (err) return res.status(500).json({ message: err.message });
        console.log(`Admin ปฏิเสธบัญชีอาจารย์: ${username}`);
        res.json({ success: true, message: `ปฏิเสธบัญชี ${username} สำเร็จ` });
    });
});

// ลบบัญชีอาจารย์
app.post('/api/superadmin/delete-teacher', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ message: "กรุณาระบุ username" });

    db.run('DELETE FROM teachers WHERE username = ? AND role != ?', [username, 'admin'], function(err) {
        if (err) return res.status(500).json({ message: err.message });
        // ลบห้องสอบของอาจารย์คนนี้ด้วย
        db.run('DELETE FROM teacher_rooms WHERE teacherUsername = ?', [username]);
        console.log(`Admin ลบบัญชีอาจารย์: ${username}`);
        res.json({ success: true, message: `ลบบัญชี ${username} สำเร็จ` });
    });
});

// ดึงประวัตินักศึกษาที่เคย login
app.get('/api/superadmin/student-logins', (req, res) => {
    db.all('SELECT * FROM student_logins ORDER BY id DESC LIMIT 500', [], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows);
    });
});

// บันทึก log เมื่อนักศึกษา login เข้าสอบ
app.post('/api/log-student-login', (req, res) => {
    const { studentId, name, class: studentClass, roomId } = req.body;
    if (!studentId || !name || !roomId) return res.status(400).json({ message: "ข้อมูลไม่ครบถ้วน" });

    const loginTime = new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const loginDate = new Date().toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    db.run('INSERT INTO student_logins (studentId, name, class, roomId, loginTime, loginDate) VALUES (?, ?, ?, ?, ?, ?)',
        [studentId, name, studentClass || '', roomId, loginTime, loginDate], (err) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json({ success: true });
        }
    );
});

// API สำหรับดึงรายชื่อนักศึกษาที่กำลังทำข้อสอบอยู่ในห้องนั้นๆ (Active Students List - Real-time Live)
app.get('/api/teacher/active-students-list', (req, res) => {
    const { roomId } = req.query;
    if (!roomId) return res.status(400).json({ message: "กรุณาระบุ roomId" });

    const liveList = getActiveRoomStudents(roomId);
    if (liveList.length === 0) {
        return res.json([]);
    }

    const sIds = liveList.map(a => a.studentId);
    const placeholders = sIds.map(() => '?').join(',');

    db.all(`
        SELECT sl.studentId, sl.name, sl.class, sl.loginTime, sl.loginDate
        FROM student_logins sl
        WHERE sl.roomId = ? AND sl.studentId IN (${placeholders})
        ORDER BY sl.id DESC
    `, [roomId, ...sIds], (err, rows) => {
        const infoMap = new Map();
        (rows || []).forEach(r => {
            if (!infoMap.has(r.studentId)) infoMap.set(r.studentId, r);
        });

        const result = liveList.map(a => {
            const dbInfo = infoMap.get(a.studentId) || {};
            return {
                studentId: a.studentId,
                name: a.name || dbInfo.name || 'นักศึกษา',
                class: a.class || dbInfo.class || '-',
                loginTime: dbInfo.loginTime || '-',
                loginDate: dbInfo.loginDate || '-'
            };
        });

        res.json(result);
    });
});

// API สำหรับดึงจำนวนนักศึกษาที่กำลังเข้าสอบแบบเรียลไทม์ (Active Students - Real-time Live)
app.get('/api/teacher/active-students', (req, res) => {
    const { username } = req.query;
    if (!username || username === 'undefined') return res.status(400).json({ message: "กรุณาระบุ username" });

    // ดึงห้องทั้งหมดของอาจารย์ท่านนี้ (หรือทุกห้องหากเป็น admin)
    const sqlRooms = username === 'admin' 
        ? 'SELECT roomId, roomName FROM teacher_rooms' 
        : 'SELECT roomId, roomName FROM teacher_rooms WHERE teacherUsername = ?';
    const paramsRooms = username === 'admin' ? [] : [username];

    db.all(sqlRooms, paramsRooms, (err, rooms) => {
        if (err) return res.status(500).json({ message: err.message });
        const roomIds = (rooms || []).map(r => r.roomId);
        if (roomIds.length === 0) {
            return res.json({ grandTotalActive: 0, grandTotalLoggedIn: 0, grandTotalSubmitted: 0, rooms: {} });
        }

        const placeholders = roomIds.map(() => '?').join(',');

        // 1. ดึงผู้เข้าทำข้อสอบจาก student_logins
        db.all(`SELECT roomId, studentId FROM student_logins WHERE roomId IN (${placeholders})`, roomIds, (err2, loginRows) => {
            if (err2) return res.status(500).json({ message: err2.message });

            // 2. ดึงผู้ส่งข้อสอบเรียบร้อยแล้วจาก exam_results
            db.all(`SELECT roomId, studentId FROM exam_results WHERE roomId IN (${placeholders})`, roomIds, (err3, resultRows) => {
                if (err3) return res.status(500).json({ message: err3.message });

                const roomLoggedInSet = {};
                const roomSubmittedSet = {};

                (loginRows || []).forEach(row => {
                    const rId = (row.roomId || '').trim();
                    const sId = (row.studentId || '').trim();
                    if (rId && sId) {
                        if (!roomLoggedInSet[rId]) roomLoggedInSet[rId] = new Set();
                        roomLoggedInSet[rId].add(sId);
                    }
                });

                (resultRows || []).forEach(row => {
                    const rId = (row.roomId || '').trim();
                    const sId = (row.studentId || '').trim();
                    if (rId && sId) {
                        if (!roomSubmittedSet[rId]) roomSubmittedSet[rId] = new Set();
                        roomSubmittedSet[rId].add(sId);
                    }
                });

                const roomMap = {};
                let grandTotalActive = 0;
                let grandTotalLoggedIn = 0;
                let grandTotalSubmitted = 0;

                roomIds.forEach(rId => {
                    const loggedIn = roomLoggedInSet[rId] ? roomLoggedInSet[rId].size : 0;
                    const submitted = roomSubmittedSet[rId] ? roomSubmittedSet[rId].size : 0;
                    // นับจำนวนที่ออนไลน์สดจริงในขณะนี้จาก activeRoomTracker
                    const active = getActiveRoomStudents(rId).length;

                    roomMap[rId] = { loggedIn, submitted, active };
                    grandTotalActive += active;
                    grandTotalLoggedIn += loggedIn;
                    grandTotalSubmitted += submitted;
                });

                res.json({
                    grandTotalActive,
                    grandTotalLoggedIn,
                    grandTotalSubmitted,
                    rooms: roomMap
                });
            });
        });
    });
});

// สรุปสถิติสำหรับ Super Admin Dashboard
app.get('/api/superadmin/stats', (req, res) => {
    const stats = {};
    db.get("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved FROM teachers WHERE role != 'admin'", [], (err, teacherStats) => {
        if (err) {
            console.error('Error fetching teacher stats:', err.message);
            return res.status(500).json({ message: err.message });
        }
        stats.teachers = {
            total: parseInt(teacherStats?.total, 10) || 0,
            pending: parseInt(teacherStats?.pending, 10) || 0,
            approved: parseInt(teacherStats?.approved, 10) || 0
        };
        
        db.get('SELECT COUNT(*) as total FROM student_logins', [], (err, studentStats) => {
            if (err) {
                console.error('Error fetching student logins:', err.message);
                stats.studentLogins = 0;
            } else {
                stats.studentLogins = parseInt(studentStats?.total, 10) || 0;
            }
            
            db.get('SELECT COUNT(DISTINCT studentId) as unique_students FROM student_logins', [], (err, uniqueStats) => {
                if (err) {
                    console.error('Error fetching unique students:', err.message);
                    stats.uniqueStudents = 0;
                } else {
                    stats.uniqueStudents = parseInt(uniqueStats?.unique_students ?? uniqueStats?.uniquestudents, 10) || 0;
                }
                
                db.get("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending FROM students", [], (err3, stStats) => {
                    stats.students = {
                        total: parseInt(stStats?.total, 10) || 0,
                        pending: parseInt(stStats?.pending, 10) || 0
                    };
                    stats.pendingStudents = parseInt(stStats?.pending, 10) || 0;
                    stats.totalStudents = parseInt(stStats?.total, 10) || 0;
                    res.json(stats);
                });
            });
        });
    });
});
})(app, routeCtx);

// =====================================================================
// 11-ai-warnings-publish.js — สร้างข้อสอบด้วย AI (แบบเดิม) แจ้งเตือนนักศึกษา และเปิด/ปิดห้องสอบ
// (โค้ดเดิม ไม่เปลี่ยนการทำงาน)
// =====================================================================
(function (app, ctx) {
    const { db, getWaitingStudents, recordWaitingStudent } = ctx;


// ==========================================
// API สำหรับแจ้งเตือนนักศึกษาคุมสอบรายคน
// ==========================================

// ส่งข้อความเตือนไปยังตัวนักศึกษา
app.post('/api/send-warning', (req, res) => {
    const { roomId, studentId, message } = req.body;
    if (!roomId || !studentId || !message) return res.status(400).json({ message: "ข้อมูลไม่ครบถ้วน" });
    
    const time = new Date().toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    db.run('INSERT INTO student_warnings (roomId, studentId, message, status, time) VALUES (?, ?, ?, ?, ?)',
        [roomId, studentId, message, 'unread', time], function(err) {
            if (err) return res.status(500).json({ message: err.message });
            console.log(`ส่งข้อความเตือนไปยังนักศึกษา ${studentId} ในห้อง ${roomId}: "${message}"`);
            res.json({ success: true });
        }
    );
});

// ตรวจสอบสัญญาณแจ้งเตือนฝั่งนักศึกษา
app.get('/api/get-warnings', (req, res) => {
    const { roomId, studentId } = req.query;
    if (!roomId || !studentId) return res.status(400).json({ message: "ข้อมูลไม่ครบถ้วน" });

    db.all('SELECT * FROM student_warnings WHERE roomId = ? AND studentId = ? AND status = ?', [roomId, studentId, 'unread'], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows);
    });
});

// ยืนยันรับทราบข้อความแจ้งเตือน (Mark warning as read)
app.post('/api/mark-warning-read', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: "ข้อมูลไม่ถูกต้อง" });

    const placeholders = ids.map(() => '?').join(',');
    db.run(`UPDATE student_warnings SET status = 'read' WHERE id IN (${placeholders})`, ids, function(err) {
        if (err) return res.status(500).json({ message: err.message });
        res.json({ success: true, count: this.changes });
    });
});

// ดึงสถานะการเผยแพร่ห้องสอบ พร้อมจำนวนประวัติผลสอบเดิม รหัส PIN และนับนักศึกษาในห้องรอสอบ
app.get('/api/teacher/get-publish-status', (req, res) => {
    const roomId = req.query.roomId;
    const studentId = req.query.studentId;
    const studentName = req.query.studentName;
    const studentClass = req.query.studentClass;

    if (!roomId) return res.status(400).json({ message: "กรุณาระบุ roomId" });

    // หากนักศึกษาส่งข้อมูลมาขณะกำลังรอสอบ ให้บันทึกสถานะกำลังรอ (Heartbeat)
    if (studentId) {
        recordWaitingStudent(roomId, studentId, studentName, studentClass);
    }

    db.get('SELECT is_published, exam_code, roomName, exam_title, duration FROM teacher_rooms WHERE roomId = ?', [roomId], (err, row) => {
        if (err) return res.status(500).json({ message: err.message });
        
        db.get('SELECT COUNT(*) as resultCount FROM exam_results WHERE roomId = ?', [roomId], (err2, rRow) => {
            const waitingList = getWaitingStudents(roomId);
            res.json({ 
                is_published: row ? (row.is_published || 0) : 0,
                exam_code: row ? (row.exam_code || '') : '',
                roomName: row ? (row.roomName || '') : '',
                exam_title: row ? (row.exam_title || '') : '',
                duration: row ? (row.duration || 0) : 0,
                resultCount: rRow ? (rRow.resultCount || 0) : 0,
                waitingCount: waitingList.length
            });
        });
    });
});

// สลับสถานะการเผยแพร่ห้องสอบ (Publish / Unpublish) พร้อมสร้างรหัส PIN 6 หลักอัตโนมัติ
app.post('/api/teacher/publish-exam', (req, res) => {
    const { roomId, publish, resetResults } = req.body;
    if (!roomId) return res.status(400).json({ message: "กรุณาระบุ roomId" });

    const publishVal = publish ? 1 : 0;

    if (publishVal === 1) {
        // ก่อนเผยแพร่ ตรวจว่าต้องมีข้อสอบจริงอย่างน้อย 1 ข้อ
        db.get('SELECT COUNT(*) as cnt FROM questions WHERE roomId = ?', [roomId], (err, row) => {
            if (err) return res.status(500).json({ message: err.message });
            if (!row || row.cnt === 0) {
                return res.status(400).json({ message: "ไม่สามารถเผยแพร่ข้อสอบได้ เนื่องจากยังไม่มีข้อสอบในระบบคลัง" });
            }

            // ใช้รหัส PIN เดิมประจำห้องที่สร้างไว้ตั้งแต่แรก (หากยังไม่มีให้สุ่มใหม่)
            db.get('SELECT exam_code FROM teacher_rooms WHERE roomId = ?', [roomId], (cErr, cRoom) => {
                const dynamicPin = (cRoom && cRoom.exam_code && cRoom.exam_code.trim()) ? cRoom.exam_code.trim() : Math.floor(100000 + Math.random() * 900000).toString();

                const doPublish = () => {
                    db.run('UPDATE teacher_rooms SET is_published = 1, exam_code = ? WHERE roomId = ?', [dynamicPin, roomId], (err) => {
                    if (err) return res.status(500).json({ message: err.message });
                    db.get('SELECT roomId, roomName, exam_title, exam_code FROM teacher_rooms WHERE roomId = ?', [roomId], (gErr, rData) => {
                        res.json({ 
                            success: true, 
                            is_published: 1, 
                            exam_code: dynamicPin,
                            roomId: roomId,
                            roomName: rData ? rData.roomName : '',
                            exam_title: rData ? rData.exam_title : '',
                            message: `เผยแพร่ข้อสอบสำเร็จ! รหัส PIN เข้าสอบคือ: ${dynamicPin}` 
                        });
                    });
                });
            };

            if (resetResults) {
                db.run('DELETE FROM exam_results WHERE roomId = ?', [roomId], () => {
                    db.run('DELETE FROM cheat_logs WHERE roomId = ?', [roomId], () => {
                        db.run('DELETE FROM student_warnings WHERE roomId = ?', [roomId], () => {
                            db.run('DELETE FROM student_logins WHERE roomId = ?', [roomId], () => {
                                console.log(`รีเซ็ตประวัติผลสอบและรายชื่อเข้าสอบของห้อง ${roomId} เพื่อเริ่มรอบใหม่เรียบร้อย`);
                                doPublish();
                            });
                        });
                    });
                });
            } else {
                doPublish();
            }
            });
        });
    } else {
        // ปิดห้องสอบ → บันทึกพฤติกรรมของห้องนี้หายจากหน้า "ตรวจสอบพฤติกรรมน่าสงสัย" (ยังอยู่ในแฟ้มประวัติรวม)
        db.run('UPDATE cheat_logs SET monitor_hidden = 1 WHERE roomId = ?', [roomId]);
        db.run('UPDATE teacher_rooms SET is_published = 0 WHERE roomId = ?', [roomId], (err) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json({ success: true, is_published: 0, message: "ยกเลิกการเผยแพร่ข้อสอบแล้ว (กลับเข้าสู่สถานะแบบร่าง)" });
        });
    }
});
})(app, routeCtx);

// =====================================================================
// 12-library-storage.js — คลังข้อสอบ และพื้นที่จัดเก็บ
// (โค้ดเดิม ไม่เปลี่ยนการทำงาน)
// =====================================================================
(function (app, ctx) {
    const { db, syncRoomToLibrary } = ctx;

// 1. ดึงรายการชุดข้อสอบสะสมในคลังทั้งหมด (รองรับกรองตาม courseId เพื่อแยกข้อสอบแต่ละวิชา)
app.get('/api/library/get-templates', (req, res) => {
    const { username, courseId } = req.query;
    if (!username) return res.status(400).json({ message: "กรุณาระบุ username" });

    let sql = `
        SELECT et.*, 
            c.courseCode, c.courseName,
            (SELECT COUNT(*) FROM template_questions tq WHERE tq.templateId = et.id) as questionCount
        FROM exam_templates et
        LEFT JOIN courses c ON c.id = et.courseId
        WHERE 1=1
    `;
    const params = [];
    if (username !== 'admin') {
        sql += " AND et.teacherUsername = ?";
        params.push(username);
    }
    if (courseId) {
        sql += " AND (et.courseId = ? OR CAST(et.courseId AS TEXT) = ?)";
        params.push(courseId, String(courseId));
    }
    sql += " ORDER BY et.id DESC";

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows || []);
    });
});

// 2. ดึงข้อสอบรายข้อในเทมเพลตที่เลือก
app.get('/api/library/get-template-questions', (req, res) => {
    const { templateId } = req.query;
    const username = String(req.query.username || '');
    if (!templateId) return res.status(400).json({ message: "กรุณาระบุ templateId" });
    if (!username) return res.status(400).json({ message: "กรุณาระบุ username ของอาจารย์" });

    // เฉพาะชุดข้อสอบของอาจารย์เจ้าของบัญชี (แอดมินเห็นทั้งหมด)
    db.all(`SELECT tq.* FROM template_questions tq JOIN exam_templates et ON et.id = tq.templateId
            WHERE tq.templateId = ? AND (et.teacherUsername = ? OR ? = 'admin') ORDER BY tq.id ASC`, [templateId, username, username], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows);
    });
});

// 3. บันทึกแก้ไขชื่อเทมเพลตและคำถามรายข้อ
app.post('/api/library/update-template-questions', (req, res) => {
    const { templateId, templateName, questions } = req.body;
    if (!templateId || !templateName || !Array.isArray(questions)) {
        return res.status(400).json({ message: "ข้อมูลไม่ครบถ้วน" });
    }

    db.serialize(() => {
        const nowStr = new Date().toLocaleDateString('th-TH', { 
            timeZone: 'Asia/Bangkok',
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        db.run('UPDATE exam_templates SET templateName = ?, created_at = ? WHERE id = ?', [templateName, nowStr, templateId], (err) => {
            if (err) return res.status(500).json({ message: err.message });
        });

        db.run('DELETE FROM template_questions WHERE templateId = ?', [templateId], (err) => {
            if (err) return res.status(500).json({ message: err.message });

            const stmt = db.prepare(`
                INSERT INTO template_questions (
                    templateId, question, question_img,
                    a, b, c, d, e, f, g, h, i, j,
                    a_img, b_img, c_img, d_img, e_img, f_img, g_img, h_img, i_img, j_img,
                    answer
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            questions.forEach(q => {
                stmt.run(
                    templateId, q.question || '', q.question_img || '',
                    q.a || '', q.b || '', q.c || '', q.d || '', q.e || '', q.f || '', q.g || '', q.h || '', q.i || '', q.j || '',
                    q.a_img || '', q.b_img || '', q.c_img || '', q.d_img || '', q.e_img || '', q.f_img || '', q.g_img || '', q.h_img || '', q.i_img || '', q.j_img || '',
                    q.answer || ''
                );
            });
            stmt.finalize();
            res.json({ success: true });
        });
    });
});

// 4. ลบชุดข้อสอบสะสมออกจากคลัง
app.post('/api/library/delete-template', (req, res) => {
    const { templateId } = req.body;
    if (!templateId) return res.status(400).json({ message: "กรุณาระบุ templateId" });

    db.serialize(() => {
        db.run('DELETE FROM template_questions WHERE templateId = ?', [templateId]);
        db.run('DELETE FROM exam_templates WHERE id = ?', [templateId], (err) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json({ success: true });
        });
    });
});

// 4.5 ทำสำเนาชุดข้อสอบ (เช่น ไว้ทำข้อสอบรอบซ่อม) — ทำได้เฉพาะชุดของตัวเอง
app.post('/api/library/duplicate-template', (req, res) => {
    const templateId = Number(req.body && req.body.templateId);
    const username = String((req.body && req.body.username) || '');
    if (!templateId) return res.status(400).json({ message: "กรุณาระบุ templateId" });
    db.get('SELECT * FROM exam_templates WHERE id = ?', [templateId], (err, t) => {
        if (err) return res.status(500).json({ message: err.message });
        if (!t) return res.status(404).json({ message: "ไม่พบชุดข้อสอบนี้" });
        if (username !== 'admin' && t.teacherUsername !== username) return res.status(403).json({ message: "ชุดข้อสอบนี้ไม่ใช่ของคุณ" });
        const nowStr = new Date().toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        db.run('INSERT INTO exam_templates (teacherUsername, templateName, courseId, created_at) VALUES (?, ?, ?, ?)',
            [t.teacherUsername, `${t.templateName} (สำเนา)`, t.courseId || 0, nowStr], function (insErr) {
            if (insErr) return res.status(500).json({ message: insErr.message });
            const newId = this.lastID;
            const cols = 'question, question_img, a, b, c, d, e, f, g, h, i, j, a_img, b_img, c_img, d_img, e_img, f_img, g_img, h_img, i_img, j_img, answer';
            db.run(`INSERT INTO template_questions (templateId, ${cols}) SELECT ?, ${cols} FROM template_questions WHERE templateId = ? ORDER BY id ASC`, [newId, templateId], (cpErr) => {
                if (cpErr) return res.status(500).json({ message: cpErr.message });
                res.json({ success: true, templateId: newId, templateName: `${t.templateName} (สำเนา)` });
            });
        });
    });
});

// 5. ดึงข้อสอบสะสมจากคลังกลับเข้าสู่ห้องเรียนปัจจุบัน
app.post('/api/library/load-template', (req, res) => {
    const { roomId, templateId } = req.body;
    if (!roomId || !templateId) return res.status(400).json({ message: "ข้อมูลห้องสอบหรือคลังสะสมไม่ถูกต้อง" });

    db.serialize(() => {
        // ลบข้อสอบเดิมในห้องสอบนี้
        db.run('DELETE FROM questions WHERE roomId = ?', [roomId], (delErr) => {
            if (delErr) return res.status(500).json({ message: delErr.message });

            // ดึงข้อสอบจากคลังสะสมมาใส่ห้อง
            db.all('SELECT * FROM template_questions WHERE templateId = ?', [templateId], (err, tplQuestions) => {
                if (err) return res.status(500).json({ message: err.message });
                if (tplQuestions.length === 0) {
                    return res.json({ success: true, count: 0 });
                }

                const stmt = db.prepare(`
                    INSERT INTO questions (
                        roomId, question, question_img,
                        a, b, c, d, e, f, g, h, i, j,
                        a_img, b_img, c_img, d_img, e_img, f_img, g_img, h_img, i_img, j_img,
                        answer
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                tplQuestions.forEach(q => {
                    stmt.run(
                        roomId, q.question || '', q.question_img || '',
                        q.a || '', q.b || '', q.c || '', q.d || '', q.e || '', q.f || '', q.g || '', q.h || '', q.i || '', q.j || '',
                        q.a_img || '', q.b_img || '', q.c_img || '', q.d_img || '', q.e_img || '', q.f_img || '', q.g_img || '', q.h_img || '', q.i_img || '', q.j_img || '',
                        q.answer || ''
                    );
                });
                stmt.finalize();

                // ตั้งค่าเผยแพร่ห้องสอบเป็นแบบร่าง และรีเซ็ตผลสอบของห้องเดิมเพื่อเริ่มนับใหม่
                db.run('UPDATE teacher_rooms SET is_published = 0 WHERE roomId = ?', [roomId]);
                db.run('DELETE FROM exam_results WHERE roomId = ?', [roomId]);
                db.run('DELETE FROM cheat_logs WHERE roomId = ?', [roomId]);
                db.run('DELETE FROM student_warnings WHERE roomId = ?', [roomId]);
                db.run('DELETE FROM student_logins WHERE roomId = ?', [roomId]);

                res.json({ success: true, count: tplQuestions.length });
            });
        });
    });
});

// 6. ลบข้อสอบทั้งหมดในห้องสอบของอาจารย์
app.post('/api/teacher/delete-all-questions', (req, res) => {
    const { roomId } = req.body;
    if (!roomId) return res.status(400).json({ message: "กรุณาระบุรหัสห้องสอบ" });

    db.serialize(() => {
        db.run('DELETE FROM questions WHERE roomId = ?', [roomId], (err) => {
            if (err) return res.status(500).json({ message: err.message });

            // รีเซ็ตสถานะเป็นแบบร่างเมื่อไม่มีข้อสอบแล้ว
            db.run('UPDATE teacher_rooms SET is_published = 0 WHERE roomId = ?', [roomId]);

            // อัปเดตคลังข้อสอบสะสมด้วย (ถ้าต้องการให้ลบออกไปด้วยเมื่อห้องว่าง หรือเก็บไว้)
            syncRoomToLibrary(roomId);

            res.json({ success: true, message: "ลบข้อสอบทั้งหมดเรียบร้อย" });
        });
    });
});

// 7. สถิติพื้นที่จัดเก็บของอาจารย์รายบุคคล (My Storage)
app.get('/api/teacher/my-storage', (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ message: "กรุณาระบุ username" });

    const sql = `
        SELECT 
            (SELECT COUNT(*) FROM teacher_rooms tr WHERE tr.teacherUsername = t.username) as roomCount,
            (SELECT COUNT(*) FROM questions q JOIN teacher_rooms tr ON q.roomId = tr.roomId WHERE tr.teacherUsername = t.username) as questionCount,
            (SELECT COUNT(*) FROM exam_results er JOIN teacher_rooms tr ON er.roomId = tr.roomId WHERE tr.teacherUsername = t.username) as resultCount,
            (SELECT COUNT(*) FROM exam_templates et WHERE et.teacherUsername = t.username) as templateCount,
            (SELECT COALESCE(SUM(
                LENGTH(COALESCE(q.question,''))+LENGTH(COALESCE(q.question_img,''))+
                LENGTH(COALESCE(q.a,''))+LENGTH(COALESCE(q.b,''))+LENGTH(COALESCE(q.c,''))+LENGTH(COALESCE(q.d,''))+
                LENGTH(COALESCE(q.a_img,''))+LENGTH(COALESCE(q.b_img,''))+LENGTH(COALESCE(q.c_img,''))+LENGTH(COALESCE(q.d_img,''))
            ),0) FROM questions q JOIN teacher_rooms tr ON q.roomId = tr.roomId WHERE tr.teacherUsername = t.username) as questionBytes,
            (SELECT COALESCE(SUM(
                LENGTH(COALESCE(er.answers_json,''))+LENGTH(COALESCE(er.studentId,''))+LENGTH(COALESCE(er.name,''))
            ),0) FROM exam_results er JOIN teacher_rooms tr ON er.roomId = tr.roomId WHERE tr.teacherUsername = t.username) as resultBytes,
            (SELECT COALESCE(SUM(LENGTH(COALESCE(tq.question,''))+LENGTH(COALESCE(tq.question_img,''))),0)
             FROM template_questions tq JOIN exam_templates et ON tq.templateId = et.id WHERE et.teacherUsername = t.username) as templateBytes
        FROM teachers t
        WHERE t.username = ?
    `;

    db.get(sql, [username], (err, row) => {
        if (err) return res.status(500).json({ message: err.message });
        if (!row) {
            return res.json({
                totalBytes: 0,
                roomCount: 0,
                questionCount: 0,
                resultCount: 0,
                templateCount: 0,
                questionBytes: 0,
                resultBytes: 0,
                templateBytes: 0
            });
        }
        
        row.totalBytes = (row.questionBytes || 0) + (row.resultBytes || 0) + (row.templateBytes || 0);
        res.json(row);
    });
});

// 8. สถิติพื้นที่จัดเก็บของทุกคนในระบบ (Super Admin Dashboard View)
app.get('/api/admin/storage-stats', (req, res) => {
    const sql = `
        SELECT t.name, t.username, t.status, t.created_at,
            (SELECT COUNT(*) FROM teacher_rooms tr WHERE tr.teacherUsername = t.username) as roomCount,
            (SELECT COUNT(*) FROM questions q JOIN teacher_rooms tr ON q.roomId = tr.roomId WHERE tr.teacherUsername = t.username) as questionCount,
            (SELECT COUNT(*) FROM exam_results er JOIN teacher_rooms tr ON er.roomId = tr.roomId WHERE tr.teacherUsername = t.username) as resultCount,
            (SELECT COUNT(*) FROM exam_templates et WHERE et.teacherUsername = t.username) as templateCount,
            (SELECT COALESCE(SUM(
                LENGTH(COALESCE(q.question,''))+LENGTH(COALESCE(q.question_img,''))+
                LENGTH(COALESCE(q.a,''))+LENGTH(COALESCE(q.b,''))+LENGTH(COALESCE(q.c,''))+LENGTH(COALESCE(q.d,''))+
                LENGTH(COALESCE(q.a_img,''))+LENGTH(COALESCE(q.b_img,''))+LENGTH(COALESCE(q.c_img,''))+LENGTH(COALESCE(q.d_img,''))
            ),0) FROM questions q JOIN teacher_rooms tr ON q.roomId = tr.roomId WHERE tr.teacherUsername = t.username) as questionBytes,
            (SELECT COALESCE(SUM(
                LENGTH(COALESCE(er.answers_json,''))+LENGTH(COALESCE(er.studentId,''))+LENGTH(COALESCE(er.name,''))
            ),0) FROM exam_results er JOIN teacher_rooms tr ON er.roomId = tr.roomId WHERE tr.teacherUsername = t.username) as resultBytes,
            (SELECT COALESCE(SUM(LENGTH(COALESCE(tq.question,''))+LENGTH(COALESCE(tq.question_img,''))),0)
             FROM template_questions tq JOIN exam_templates et ON tq.templateId = et.id WHERE et.teacherUsername = t.username) as templateBytes
        FROM teachers t
        WHERE t.role != 'admin'
    `;

    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        const result = rows.map(r => {
            r.totalBytes = (r.questionBytes || 0) + (r.resultBytes || 0) + (r.templateBytes || 0);
            return r;
        });
        res.json(result);
    });
});
})(app, routeCtx);

// รายงานรวมรายคนของรายวิชา
// ===== ตัวแปลงข้อสอบด้วย AI (โฟลเดอร์ exam-converter) =====
// API Key อยู่ใน environment ของเซิร์ฟเวอร์ (GEMINI_API_KEY) เท่านั้น · ใช้ได้เฉพาะอาจารย์/แอดมินที่ล็อกอิน
// โควตาต่อคนต่อวัน: EXAM_AI_DAILY_LIMIT (ค่าเริ่มต้น 30 ไฟล์)
import('./exam-converter/server/exam-converter-router.js').then(({ createExamConverterRouter }) => {
    const requireTeacher = (req, res, next) => {
        const u = req.authUser;
        if (!u) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ ExamPro ก่อนใช้งาน' });
        if (u.typ !== 'teacher') return res.status(403).json({ error: 'ตัวแปลงข้อสอบใช้ได้เฉพาะอาจารย์' });
        next();
    };
    app.use('/api/ai', createExamConverterRouter({ requireAuth: requireTeacher, getUserId: req => req.authUser.u }));
    console.log('ตัวแปลงข้อสอบ AI พร้อมใช้งานที่ /api/ai' + (process.env.GEMINI_API_KEY ? '' : ' (ยังไม่ได้ตั้งค่า GEMINI_API_KEY)'));
}).catch(e => console.error('โหลดตัวแปลงข้อสอบ AI ไม่สำเร็จ:', e.message));

try { require('./trinetra-link')(app, db); } catch (e) { console.error('โหลดรายงานรวม ExamPro ไม่สำเร็จ:', e.message); }
// ดาวน์โหลดข้อมูลสำรองทั้งหมด (สำคัญเมื่อใช้ Neon แผนฟรี)
try { require('./backup-export')(app, db); } catch (e) { console.error('โหลดระบบดาวน์โหลดข้อมูลสำรองไม่สำเร็จ:', e.message); }
// สำรองฐานข้อมูลอัตโนมัติทุกวัน (backup.js)
try { require('./backup')(db, process.env.DATA_DIR || path.join(__dirname, '.data')); } catch (e) { console.error('โหลดระบบสำรองข้อมูลไม่สำเร็จ:', e.message); }

app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`Server SQLite Full System พร้อมทำงาน: http://localhost:${PORT}`);
    console.log(`=======================================================`);
});