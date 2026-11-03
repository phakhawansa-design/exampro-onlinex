// =====================================================================
// 💾 สำรองฐานข้อมูล SQLite อัตโนมัติ (backup.js)
// - สำรองตอนเปิดเซิร์ฟเวอร์ (ถ้าวันนี้ยังไม่มี) และทุก 24 ชั่วโมง
// - เก็บไว้ที่ DATA_DIR/backups เก็บล่าสุด BACKUP_KEEP ไฟล์ (ค่าเริ่ม 7)
// - ใช้คำสั่ง VACUUM INTO ของ SQLite ได้ไฟล์ที่สมบูรณ์แม้เซิร์ฟเวอร์กำลังทำงาน
// - ถ้าใช้ PostgreSQL (Neon) จะไม่ทำงาน เพราะ Neon มีระบบสำรองของตัวเอง
// =====================================================================
const fs = require('fs');
const path = require('path');

module.exports = function startBackup(db, dataDir) {
    if (db.isPg) return console.log('💾 ใช้ PostgreSQL: ข้ามการสำรองไฟล์ SQLite (ใช้ระบบสำรองของ Neon แทน)');
    if (String(process.env.BACKUP_ENABLED || 'on').toLowerCase() === 'off') return;
    const dir = path.join(dataDir, 'backups');
    const KEEP = Math.max(1, parseInt(process.env.BACKUP_KEEP || '7'));
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}

    const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
    function run() {
        const file = path.join(dir, `exam_system_${stamp()}.db`);
        if (fs.existsSync(file)) return;
        db.run(`VACUUM INTO '${file.replace(/'/g, "''")}'`, err => {
            if (err) return console.error('❌ สำรองฐานข้อมูลไม่สำเร็จ:', err.message);
            console.log('💾 สำรองฐานข้อมูลแล้ว:', path.basename(file));
            const old = fs.readdirSync(dir).filter(f => /^exam_system_\d{4}-\d\d-\d\d\.db$/.test(f)).sort().reverse().slice(KEEP);
            old.forEach(f => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} });
        });
    }
    setTimeout(run, 10000);
    setInterval(run, 6 * 3600e3).unref(); // เช็กทุก 6 ชม. สร้างไฟล์ใหม่วันละ 1 ไฟล์
};
