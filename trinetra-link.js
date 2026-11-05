// =====================================================================
// 👁️ ตรีเนตร · เชื่อม "ตาเฝ้า" กับ "ตาอ่าน" (trinetra-link.js)
// ---------------------------------------------------------------------
// GET /api/trinetra/course-report?courseId=
//   รายงานรวมรายคนของรายวิชา: คะแนนปรนัยทุกห้องสอบ + คะแนนอัตนัยทุกงาน
//   + ประวัติตาเฝ้า (สลับหน้าจอ / ออกเต็มจอ / หายจากหน้าสอบ) พร้อมข้อที่กำลังทำ
//   ใช้ทั้งหน้า trinetra-report.html และจัดลำดับคิวตรวจอัตนัยในหน้า admin-essay.html
// =====================================================================

module.exports = function trinetraLink(app, db) {
    const q = {
        all: (sql, p = []) => new Promise((ok, no) => db.all(sql, p, (e, r) => e ? no(e) : ok(r || [])))
    };
    const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
    const norm = id => String(id || '').replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
    const kindOf = a => {
        a = String(a || '');
        if (a.startsWith('⏸️')) return 'gap';
        if (a.startsWith('🖥️')) return 'fs';
        if (a.startsWith('🚨')) return 'switch';
        if (a.startsWith('📱')) return 'multi';
        return 'other';
    };

    app.get('/api/trinetra/course-report', async (req, res) => {
        try {
            const courseId = Number(req.query.courseId);
            const u = String(req.query.username || '');
            if (!courseId) return res.status(400).json({ success: false, message: 'กรุณาเลือกรายวิชา' });
            const isAdmin = u === 'admin';

            const course = (await q.all('SELECT id, courseCode, courseName, semester, teacherUsername FROM courses WHERE id = ?', [courseId]))[0];
            if (!course) return res.status(404).json({ success: false, message: 'ไม่พบรายวิชานี้' });
            if (!isAdmin && course.teacherUsername && course.teacherUsername !== u) return res.status(403).json({ success: false, message: 'รายวิชานี้ไม่ใช่ของคุณ' });

            const rooms = await q.all(`SELECT roomId, exam_title, roomName FROM teacher_rooms WHERE (courseId = ? OR CAST(courseId AS TEXT) = ?) ${isAdmin ? '' : 'AND teacherUsername = ?'} ORDER BY id`,
                isAdmin ? [courseId, String(courseId)] : [courseId, String(courseId), u]);
            const roomIds = rooms.map(r => r.roomId);
            const roomLabel = Object.fromEntries(rooms.map(r => [r.roomId, r.exam_title || r.roomName || r.roomId]));
            const inRooms = roomIds.map(() => '?').join(',');
            const exams = roomIds.length ? await q.all(`SELECT roomId, studentId, name, class, score, maxScore FROM exam_results WHERE roomId IN (${inRooms})`, roomIds) : [];
            const logs = roomIds.length ? await q.all(`SELECT id, roomId, studentId, name, class, action, time FROM cheat_logs WHERE roomId IN (${inRooms}) ORDER BY id`, roomIds) : [];
            const answers = roomIds.length ? await q.all(`SELECT room_id, student_id, question_no, kind, from_text, to_text, after_sec, after_what, time FROM answer_events WHERE room_id IN (${inRooms}) ORDER BY id`, roomIds).catch(() => []) : [];
            const assigns = await q.all(`SELECT id, title, questions_json FROM essay_assignments WHERE course_id = ? ${isAdmin ? '' : 'AND teacher_username = ?'} ORDER BY id`,
                isAdmin ? [courseId] : [courseId, u]).catch(() => []);
            const roster = await q.all('SELECT studentId, prefix, firstName, lastName, class FROM course_students WHERE courseId = ? OR CAST(courseId AS TEXT) = ?', [courseId, String(courseId)]);

            const columns = [
                ...rooms.map(r => ({ key: 'r:' + r.roomId, type: 'mc', label: roomLabel[r.roomId], max: 0 })),
                ...assigns.map(a => ({ key: 'e:' + a.id, type: 'essay', label: a.title, max: parse(a.questions_json, []).reduce((t, x) => t + Number(x.maxScore || 0), 0) }))
            ];
            const people = new Map();
            const person = (id, name, cls) => {
                const k = norm(id); if (!k) return null;
                if (!people.has(k)) people.set(k, { studentId: String(id).trim(), name: name || '', class: cls || '', inRoster: false, scores: {}, watch: { total: 0, switch: 0, fs: 0, gap: 0, multi: 0, other: 0, answer: 0, rooms: {}, events: [] } });
                const p = people.get(k);
                if (!p.name && name) p.name = name;
                if (!p.class && cls) p.class = cls;
                return p;
            };
            roster.forEach(r => { const p = person(r.studentId, `${r.prefix || ''}${r.firstName || ''} ${r.lastName || ''}`.trim(), r.class); if (p) p.inRoster = true; });
            for (const e of exams) {
                const p = person(e.studentId, e.name, e.class); if (!p) continue;
                const col = columns.find(c => c.key === 'r:' + e.roomId);
                col.max = Math.max(col.max, Number(e.maxScore) || 0);
                p.scores[col.key] = Math.max(p.scores[col.key] ?? 0, Number(e.score) || 0); // สอบหลายครั้ง ใช้คะแนนสูงสุด
            }
            for (const a of assigns) {
                const subs = await q.all("SELECT id, student_id, student_name FROM essay_submissions WHERE assignment_id = ? AND status = 'done'", [a.id]);
                for (const s of subs) {
                    const p = person(s.student_id, s.student_name); if (!p) continue;
                    const g = await q.all('SELECT final_score, ai_score, status FROM essay_grades WHERE submission_id = ?', [s.id]);
                    p.scores['e:' + a.id] = g.reduce((t, x) => t + Number(x.final_score ?? x.ai_score ?? 0), 0);
                }
            }
            for (const l of logs) {
                const p = person(l.studentId, l.name, l.class); if (!p) continue;
                const k = kindOf(l.action);
                p.watch.total++; p.watch[k]++;
                p.watch.rooms[l.roomId] = (p.watch.rooms[l.roomId] || 0) + 1;
                p.watch.events.push({ roomId: l.roomId, room: roomLabel[l.roomId] || l.roomId, kind: k, action: l.action, time: l.time });
            }
            // ✏️ ตอบ/แก้คำตอบหลังกลับจากการสลับหน้าจอ (ไม่นับรวมเป็นครั้งที่ผิดระเบียบ แต่แสดงเป็นหลักฐานประกอบ)
            for (const a of answers) {
                const p = person(a.student_id); if (!p) continue;
                p.watch.answer++;
                const q = `ข้อ ${a.question_no || '?'}`, w = `${a.after_sec} วินาทีหลังกลับจาก${a.after_what ? a.after_what : 'การสลับหน้าจอ'}`;
                p.watch.events.push({ roomId: a.room_id, room: roomLabel[a.room_id] || a.room_id, kind: 'answer', time: a.time,
                    action: a.kind === 'change' ? `✏️ แก้คำตอบ${q} จาก "${a.from_text}" เป็น "${a.to_text}" · ${w}` : `✏️ ตอบ${q} เป็น "${a.to_text}" · ${w}` });
            }
            for (const p of people.values()) p.watch.events.sort((x, y) => String(x.room).localeCompare(String(y.room)) || String(x.time).localeCompare(String(y.time)));
            const totalMax = columns.reduce((t, c) => t + (c.max || 0), 0);
            const students = [...people.values()].map(p => {
                const sum = columns.reduce((t, c) => t + (Number(p.scores[c.key]) || 0), 0);
                return { ...p, total: sum, percent: totalMax ? Math.round(sum / totalMax * 1000) / 10 : null };
            }).sort((a, b) => a.studentId.localeCompare(b.studentId));
            res.json({
                success: true,
                course: { id: course.id, code: course.courseCode, name: course.courseName, semester: course.semester },
                columns, totalMax, students,
                summary: {
                    students: students.length,
                    watched: students.filter(s => s.watch.total > 0).length,
                    events: logs.length
                }
            });
        } catch (e) { res.status(500).json({ success: false, message: e.message }); }
    });
};
