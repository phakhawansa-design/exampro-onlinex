// =====================================================================
// ExamPro · รายงานรวมรายคน (trinetra-link.js)
// ---------------------------------------------------------------------
// GET /api/trinetra/course-report?courseId=
//   รายงานรวมรายคนของรายวิชา: คะแนนทุกห้องสอบ
//   + ประวัติตาเฝ้า (สลับหน้าจอ / ออกเต็มจอ / หายจากหน้าสอบ) พร้อมข้อที่กำลังทำ
//   ใช้ในหน้า trinetra-report.html
// =====================================================================

module.exports = function trinetraLink(app, db) {
    const q = {
        all: (sql, p = []) => new Promise((ok, no) => db.all(sql, p, (e, r) => e ? no(e) : ok(r || [])))
    };
    const parse = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } };
    const norm = id => String(id || '').replace(/[^0-9a-zA-Z]/g, '').toLowerCase();
    const kindOf = a => {
        a = String(a || '');
        // แยกประเภทจากข้อความ (ประวัติเก่าที่มีอีโมจินำหน้าก็ยังแยกได้)
        if (/หายจากหน้าสอบ|หยุดทำงาน/.test(a)) return 'gap';
        if (/เต็มจอ/.test(a)) return 'fs';
        if (/อีกเครื่อง|หลายเครื่อง|หลายแท็บ|แท็บใหม่/.test(a)) return 'multi';
        if (/สลับ|ออกหน้าจอ/.test(a)) return 'switch';
        return 'other';
    };

    app.get('/api/trinetra/course-report', async (req, res) => {
        try {
            const courseId = Number(req.query.courseId);
            const u = String(req.query.username || '');
            if (!courseId) return res.status(400).json({ success: false, message: 'กรุณาเลือกรายวิชา' });
            const isAdmin = (req.authUser && req.authUser.role === 'admin') || u === 'admin';

            const course = (await q.all('SELECT id, courseCode, courseName, semester, teacherUsername FROM courses WHERE id = ?', [courseId]))[0];
            if (!course) return res.status(404).json({ success: false, message: 'ไม่พบรายวิชานี้' });
            if (!isAdmin && course.teacherUsername && course.teacherUsername !== u) return res.status(403).json({ success: false, message: 'รายวิชานี้ไม่ใช่ของคุณ' });

            // ผลสอบ/บันทึกสลับหน้าจอของวิชานี้ = รายวิชาที่บันทึกไว้ตอนเกิดเหตุ (ถ้าไม่มี ใช้รายวิชาของห้องสอบ) — กติกาเดียวกับหน้าอื่น
            const ER = 'COALESCE(NULLIF(er.courseId, 0), (SELECT NULLIF(t9.courseId, 0) FROM teacher_rooms t9 WHERE t9.roomId = er.roomId))';
            const CL = 'COALESCE(NULLIF(cl.courseId, 0), (SELECT NULLIF(t8.courseId, 0) FROM teacher_rooms t8 WHERE t8.roomId = cl.roomId))';
            const own = isAdmin ? '' : 'AND roomId IN (SELECT roomId FROM teacher_rooms WHERE teacherUsername = ?)';
            const ownP = isAdmin ? [] : [u];
            const exams = await q.all(`SELECT er.roomId, er.studentId, er.name, er.class, er.score, er.maxScore FROM exam_results er WHERE ${ER} = ? ${own.replace('roomId', 'er.roomId')}`, [courseId, ...ownP]);
            const logs = await q.all(`SELECT cl.id, cl.roomId, cl.studentId, cl.name, cl.class, cl.action, cl.time FROM cheat_logs cl WHERE ${CL} = ? ${own.replace('roomId', 'cl.roomId')} ORDER BY cl.id`, [courseId, ...ownP]);
            // ห้องสอบของวิชานี้ + ห้องที่เคยใช้สอบวิชานี้ (เผื่อย้ายห้องไปวิชาอื่นภายหลัง)
            const courseRooms = await q.all(`SELECT roomId, exam_title, roomName FROM teacher_rooms WHERE (courseId = ? OR CAST(courseId AS TEXT) = ?) ${isAdmin ? '' : 'AND teacherUsername = ?'} ORDER BY id`,
                isAdmin ? [courseId, String(courseId)] : [courseId, String(courseId), u]);
            const seen = new Set(courseRooms.map(r => r.roomId));
            const extraIds = [...new Set([...exams, ...logs].map(x => x.roomId))].filter(id => !seen.has(id));
            const extra = extraIds.length ? await q.all(`SELECT roomId, exam_title, roomName FROM teacher_rooms WHERE roomId IN (${extraIds.map(() => '?').join(',')})`, extraIds) : [];
            const rooms = [...courseRooms, ...extraIds.map(id => extra.find(r => r.roomId === id) || { roomId: id, exam_title: id, roomName: id })];
            const roomIds = rooms.map(r => r.roomId);
            const roomLabel = Object.fromEntries(rooms.map(r => [r.roomId, r.exam_title || r.roomName || r.roomId]));
            const inRooms = roomIds.map(() => '?').join(',');
            const answers = roomIds.length ? await q.all(`SELECT room_id, student_id, question_no, kind, from_text, to_text, after_sec, after_what, time FROM answer_events WHERE room_id IN (${inRooms}) ORDER BY id`, roomIds).catch(() => []) : [];
            const roster = await q.all('SELECT studentId, prefix, firstName, lastName, class FROM course_students WHERE courseId = ? OR CAST(courseId AS TEXT) = ?', [courseId, String(courseId)]);

            const columns = [
                ...rooms.map(r => ({ key: 'r:' + r.roomId, type: 'mc', label: roomLabel[r.roomId], max: 0 }))
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
            for (const l of logs) {
                const p = person(l.studentId, l.name, l.class); if (!p) continue;
                const k = kindOf(l.action);
                p.watch.total++; p.watch[k]++;
                p.watch.rooms[l.roomId] = (p.watch.rooms[l.roomId] || 0) + 1;
                p.watch.events.push({ roomId: l.roomId, room: roomLabel[l.roomId] || l.roomId, kind: k, action: l.action, time: l.time });
            }
            // ตอบ/แก้คำตอบหลังกลับจากการสลับหน้าจอ (ไม่นับรวมเป็นครั้งที่ผิดระเบียบ แต่แสดงเป็นหลักฐานประกอบ)
            for (const a of answers) {
                const p = person(a.student_id); if (!p) continue;
                p.watch.answer++;
                const q = `ข้อ ${a.question_no || '?'}`, w = `${a.after_sec} วินาทีหลังกลับจาก${a.after_what ? a.after_what : 'การสลับหน้าจอ'}`;
                p.watch.events.push({ roomId: a.room_id, room: roomLabel[a.room_id] || a.room_id, kind: 'answer', time: a.time,
                    action: a.kind === 'change' ? `แก้คำตอบ${q} จาก "${a.from_text}" เป็น "${a.to_text}" · ${w}` : `ตอบ${q} เป็น "${a.to_text}" · ${w}` });
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
