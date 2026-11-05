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
// 🔒 กันไม่ให้ดาวน์โหลดไฟล์ฝั่งเซิร์ฟเวอร์ (ฐานข้อมูล, โค้ด, สคริปต์) ผ่านเว็บ
app.use((req, res, next) => {
    const p = decodeURIComponent(req.path).toLowerCase();
    if (/\.(db|db-journal|sqlite|bat|env|log|md)$/.test(p) || /^\/(server|auth|essay-grader|ai-quiz|backup|check_storage|make_pdf|exam-guard|trinetra-link|backup-export)\.js$/.test(p) || /^\/(package(-lock)?\.json|\.npmrc|\.gitignore)$/.test(p) || p.startsWith('/_backup') || p.startsWith('/routes/') || p.startsWith('/node_modules') || p.startsWith('/.')) {
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
    console.log('🐘 กำลังเชื่อมต่อฐานข้อมูล Neon PostgreSQL...');
    let connStr = process.env.DATABASE_URL;
    if (connStr) {
        connStr = connStr.replace(/sslmode=(require|prefer|verify-ca)/gi, 'sslmode=verify-full');
    }
    // 🔢 PostgreSQL คืนผล COUNT()/SUM() (bigint) และ numeric เป็นตัวอักษร เช่น "5" ต่างจาก SQLite ที่เป็นตัวเลข
    //    แปลงเป็นตัวเลขให้เหมือนกัน (เดิมบน Neon ตัวเลขบางช่องต่อกันเป็นข้อความ หรือเทียบ === 0 ไม่ผ่าน)
    try {
        const { types } = require('pg');
        types.setTypeParser(20, v => { const n = Number(v); return Number.isSafeInteger(n) ? n : v; });
        types.setTypeParser(1700, v => Number(v));
    } catch (e) { console.error('⚠️ ตั้งค่าการแปลงตัวเลขของ PostgreSQL ไม่สำเร็จ:', e.message); }
    const pool = new Pool({
        connectionString: connStr,
        ssl: { rejectUnauthorized: false }
    });

    // 🔄 PostgreSQL คืน column names เป็นตัวพิมพ์เล็กทั้งหมด (roomid แทน roomId)
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
        .then(() => console.log('🟢 เชื่อมต่อฐานข้อมูล Neon PostgreSQL สำเร็จ! (Cloud DB Active)'))
        .catch(err => console.error('❌ เชื่อมต่อ Neon PostgreSQL ล้มเหลว:', err.message));

} else {
    const dbDir = process.env.DATA_DIR || path.join(__dirname, '.data');
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir);
    }
    const dbPath = path.join(dbDir, 'exam_system.db');

    db = new sqlite3.Database(dbPath, (err) => {
        if (err) console.error('❌ เชื่อมต่อ SQLite ล้มเหลว:', err.message);
        else console.log('🟢 เชื่อมต่อฐานข้อมูล SQLite สำเร็จ (ไฟล์: .data/exam_system.db)');
    });
}

// 🔐 ระบบยืนยันตัวตนด้วย token (auth.js) — ต้องลงทะเบียนก่อน API ทั้งหมด
const { hashTeacherPassword, verifyTeacherPassword } = require('./auth');
require('./auth').register(app, db, process.env.DATA_DIR || path.join(__dirname, '.data'));
// 🤖 สร้าง/แปลงข้อสอบด้วย Claude (ai-quiz.js) — ถ้าไม่มี API key จะใช้คลังข้อสอบเดิม
try { require('./ai-quiz')(app, db); } catch (e) { console.error('⚠️ โหลด AI Quiz ไม่สำเร็จ:', e.message); }
// 🛡️ บันทึกคำตอบระหว่างสอบ + บล็อกเบราว์เซอร์ในแอป + จับสัญญาณขาดหาย (ต้องอยู่ก่อนเส้นทาง API ของการสอบ)
try { require('./exam-guard')(app, db); } catch (e) { console.error('⚠️ โหลด Exam Guard ไม่สำเร็จ:', e.message); }

// 🛠️ สร้างตารางข้อมูลทั้งหมด และทำการ Migration ตารางเดิมอย่างปลอดภัย
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
    // ⚙️ ระบบ Auto-Migrations (เพิ่มคอลัมน์ใหม่สำหรับตารางเดิมที่มีอยู่แล้ว)
    // ==========================================
    
    // ผูกห้องสอบกับรายวิชา (courseId)
    db.run("ALTER TABLE teacher_rooms ADD COLUMN courseId INTEGER DEFAULT 0", (err) => {
        if (!err) console.log("✔ Added column 'courseId' to teacher_rooms table");
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

    // 🛡️ Seed บัญชี Super Admin เริ่มต้น: ใช้ ADMIN_PASSWORD จาก .env ถ้ามี ไม่งั้นใช้ admin123 แล้วบังคับเปลี่ยนตอนเข้าสู่ระบบครั้งแรก
    const seedAdminPw = (process.env.ADMIN_PASSWORD || '').trim() || 'admin123';
    db.run(`INSERT OR IGNORE INTO teachers (username, password, name, status, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        ['admin', hashTeacherPassword(seedAdminPw), 'ผู้ดูแลระบบ (Super Admin)', 'approved', 'admin', new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })],
        function (err) {
            if (err || !this || !this.changes) return;
            console.log(seedAdminPw === 'admin123'
                ? '🛡️ สร้างบัญชี Super Admin แล้ว (admin / admin123) ระบบจะบังคับตั้งรหัสใหม่ตอนเข้าสู่ระบบครั้งแรก'
                : '🛡️ สร้างบัญชี Super Admin แล้ว (admin / รหัสจาก ADMIN_PASSWORD)');
        }
    );
    // 📱 สุ่มสร้างรหัส PIN 6 หลักสำหรับห้องสอบที่ยังไม่มีรหัส PIN ให้ทันที
    db.all("SELECT id, roomId FROM teacher_rooms WHERE exam_code IS NULL OR exam_code = ''", [], (err, rows) => {
        if (!err && rows && rows.length > 0) {
            rows.forEach(r => {
                const autoPin = Math.floor(100000 + Math.random() * 900000).toString();
                db.run("UPDATE teacher_rooms SET exam_code = ? WHERE id = ?", [autoPin, r.id]);
            });
            console.log(`📱 สุ่มสร้างรหัส PIN 6 หลักให้ห้องสอบเริ่มต้น ${rows.length} ห้องเรียบร้อย`);
        }
    });
});

// ⏳ ระบบจัดการนักศึกษาที่อยู่ในห้องสอบ / รอสอบแบบเรียลไทม์ (Real-time Live Room Tracker)
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
// 📚 ระบบคลังข้อสอบสะสม (My Exam Library) & 💾 ข้อมูลพื้นที่จัดเก็บ (Storage stats)
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

// 🧩 เส้นทาง API หลักแยกไว้ในโฟลเดอร์ routes/ (ลงทะเบียนตามลำดับเดิม หลังประกาศฟังก์ชันช่วยทั้งหมด)
const routeCtx = { db, getActiveRoomStudentMap, getActiveRoomStudents, getWaitingStudents, hashPassword, hashTeacherPassword, recordStudentActive, recordWaitingStudent, removeStudentActive, saveQuestionsToTemplateHelper, syncRoomToLibrary, verifyTeacherPassword, waitingStudentsTracker };
['01-teachers-rooms', '02-student-records', '03-student-account', '04-live-dashboard', '05-courses', '06-rooms-manage', '07-questions', '08-exam-results', '09-question-edit', '10-superadmin-live', '11-ai-warnings-publish', '12-library-storage']
    .forEach(name => require('./routes/' + name)(app, routeCtx));

// 📝 ระบบตรวจข้อสอบอัตนัยด้วย AI (โมดูลแยก: essay-grader.js) — ถ้าโหลดไม่สำเร็จ ระบบสอบเดิมยังทำงานตามปกติ
try { require('./essay-grader')(app, db); } catch (e) { console.error('⚠️ โหลด Essay Grader ไม่สำเร็จ:', e.message); }
// 👁️ รายงานรวมตาเฝ้า + ตาอ่าน รายคน
try { require('./trinetra-link')(app, db); } catch (e) { console.error('⚠️ โหลดรายงานรวมตรีเนตรไม่สำเร็จ:', e.message); }
// 💾 ดาวน์โหลดข้อมูลสำรองทั้งหมด (สำคัญเมื่อใช้ Neon แผนฟรี)
try { require('./backup-export')(app, db); } catch (e) { console.error('⚠️ โหลดระบบดาวน์โหลดข้อมูลสำรองไม่สำเร็จ:', e.message); }
// 💾 สำรองฐานข้อมูลอัตโนมัติทุกวัน (backup.js)
try { require('./backup')(db, process.env.DATA_DIR || path.join(__dirname, '.data')); } catch (e) { console.error('⚠️ โหลดระบบสำรองข้อมูลไม่สำเร็จ:', e.message); }

app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 Server SQLite Full System พร้อมทำงาน: http://localhost:${PORT}`);
    console.log(`=======================================================`);
});