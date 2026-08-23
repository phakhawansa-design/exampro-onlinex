const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('.data/exam_system.db');

function fmt(b) {
    if (!b || b === 0) return '0 B';
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
}

db.all(`
    SELECT t.name, t.username,
        (SELECT COUNT(*) FROM teacher_rooms tr WHERE tr.teacherUsername = t.username) as rooms,
        (SELECT COUNT(*) FROM questions q JOIN teacher_rooms tr ON q.roomId = tr.roomId WHERE tr.teacherUsername = t.username) as questions,
        (SELECT COUNT(*) FROM exam_results er JOIN teacher_rooms tr ON er.roomId = tr.roomId WHERE tr.teacherUsername = t.username) as results,
        (SELECT COUNT(*) FROM exam_templates et WHERE et.teacherUsername = t.username) as templates,
        (SELECT COALESCE(SUM(
            LENGTH(COALESCE(q.question,''))+LENGTH(COALESCE(q.question_img,''))+
            LENGTH(COALESCE(q.a,''))+LENGTH(COALESCE(q.b,''))+LENGTH(COALESCE(q.c,''))+LENGTH(COALESCE(q.d,''))+
            LENGTH(COALESCE(q.a_img,''))+LENGTH(COALESCE(q.b_img,''))+LENGTH(COALESCE(q.c_img,''))+LENGTH(COALESCE(q.d_img,''))
        ),0) FROM questions q JOIN teacher_rooms tr ON q.roomId = tr.roomId WHERE tr.teacherUsername = t.username) as qBytes,
        (SELECT COALESCE(SUM(
            LENGTH(COALESCE(er.answers_json,''))+LENGTH(COALESCE(er.studentId,''))+LENGTH(COALESCE(er.name,''))
        ),0) FROM exam_results er JOIN teacher_rooms tr ON er.roomId = tr.roomId WHERE tr.teacherUsername = t.username) as rBytes,
        (SELECT COALESCE(SUM(LENGTH(COALESCE(tq.question,''))+LENGTH(COALESCE(tq.question_img,''))),0)
         FROM template_questions tq JOIN exam_templates et ON tq.templateId = et.id WHERE et.teacherUsername = t.username) as tBytes
    FROM teachers t
    WHERE t.role != 'admin'
    ORDER BY (COALESCE(qBytes,0)+COALESCE(rBytes,0)+COALESCE(tBytes,0)) DESC
`, [], (err, rows) => {
    if (err) { console.log('Error:', err.message); return; }
    console.log('\n=== การใช้พื้นที่จัดเก็บข้อมูลของแต่ละอาจารย์ ===\n');
    let grandTotal = 0;
    rows.forEach((r, i) => {
        const total = (r.qBytes || 0) + (r.rBytes || 0) + (r.tBytes || 0);
        grandTotal += total;
        console.log((i + 1) + '. ' + (r.name || '-') + '  (@' + r.username + ')');
        console.log('   ห้องสอบ: ' + r.rooms + '  ข้อสอบ: ' + r.questions + '  ผลสอบ: ' + r.results + '  เทมเพลต: ' + r.templates);
        console.log('   ข้อสอบ: ' + fmt(r.qBytes) + '  |  ผลสอบ: ' + fmt(r.rBytes) + '  |  เทมเพลต: ' + fmt(r.tBytes));
        console.log('   >>> รวมทั้งหมด: ' + fmt(total) + '\n');
    });
    console.log('==========================================');
    console.log('พื้นที่รวมทั้งระบบ: ' + fmt(grandTotal));
    console.log('จำนวนอาจารย์: ' + rows.length + ' คน');
    db.close();
});
