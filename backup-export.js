// =====================================================================
// 💾 ตรีเนตร · ดาวน์โหลดข้อมูลสำรองทั้งหมด (backup-export.js)
// ---------------------------------------------------------------------
// GET /api/superadmin/backup-export  (เฉพาะผู้ดูแลระบบ)
//   ได้ไฟล์ JSON ไฟล์เดียว มีทุกตาราง: ห้องสอบ ข้อสอบ ผลสอบ ประวัติตาเฝ้า รายวิชา รายชื่อ งานอัตนัยและคะแนน
//   ใช้ได้ทั้ง SQLite และ PostgreSQL (Neon) — สำคัญมากเมื่อใช้ Neon แผนฟรีที่ย้อนข้อมูลได้แค่ไม่กี่ชั่วโมง
//   ไม่รวมรหัสผ่าน (แม้จะเข้ารหัสแล้ว) และไม่รวมไฟล์ภาพกระดาษคำตอบ
// =====================================================================

const TABLES = [
    'teachers', 'teacher_rooms', 'courses', 'course_students', 'students',
    'questions', 'exam_results', 'cheat_logs', 'answer_events', 'student_logins', 'student_warnings', 'student_reports',
    'exam_templates', 'template_questions',
    'essay_assignments', 'essay_submissions', 'essay_grades'
];
const HIDDEN = { teachers: ['password'], students: ['password_hash'] };

module.exports = function backupExport(app, db) {
    const all = sql => new Promise(ok => db.all(sql, [], (e, r) => ok(e ? null : (r || []))));

    app.get('/api/superadmin/backup-export', async (req, res) => {
        const u = req.authUser;
        if (!u || u.typ !== 'teacher' || u.role !== 'admin') return res.status(403).json({ success: false, message: 'เฉพาะผู้ดูแลระบบ' });
        try {
            const tables = {}, counts = {};
            for (const t of TABLES) {
                const rows = await all(`SELECT * FROM ${t}`);
                if (!rows) continue; // ตารางยังไม่ถูกสร้าง
                const hide = HIDDEN[t] || [];
                tables[t] = hide.length ? rows.map(r => { const o = { ...r }; hide.forEach(k => { delete o[k]; delete o[k.toLowerCase()]; }); return o; }) : rows;
                counts[t] = rows.length;
            }
            const d = new Date(), pad = n => String(n).padStart(2, '0');
            const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
            const out = {
                meta: {
                    system: 'ตรีเนตร e-Exam', exportedAt: d.toISOString(), exportedBy: u.u,
                    database: db.isPg ? 'PostgreSQL' : 'SQLite', counts,
                    note: 'ไม่รวมรหัสผ่านและไฟล์ภาพกระดาษคำตอบ · เป็นข้อมูลส่วนบุคคลของนักศึกษา (PDPA) โปรดเก็บในที่ปลอดภัย'
                },
                tables
            };
            console.log(`💾 ${u.u} ดาวน์โหลดข้อมูลสำรอง (${Object.values(counts).reduce((a, b) => a + b, 0)} แถว)`);
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="trinetra-backup_${stamp}.json"`);
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify(out));
        } catch (e) { res.status(500).json({ success: false, message: e.message }); }
    });
};
