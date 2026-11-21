// ===== ประเภทเหตุการณ์ในบันทึกการสลับหน้าจอ (ใช้ร่วมกันทั้งเซิร์ฟเวอร์และทุกหน้า) =====
// ทุกหน้าที่แสดง "สลับหน้าจอ n ครั้ง" ต้องนับด้วยกติกาเดียวกันนี้ ตัวเลขจึงตรงกันทุกหน้า
//
//   สลับหน้าจอ (นับเป็น "ครั้ง") = หน้าสอบเห็นเองว่านักศึกษาออกจากหน้าข้อสอบ
//     switch : สลับแอป/แท็บ ล็อกจอ คลิกไปหน้าต่างอื่น  (หน้าสอบรายงาน "ออกจากหน้าข้อสอบ …")
//     fs     : ออกจากโหมดเต็มจอ (คอมพิวเตอร์)
//   เหตุการณ์อื่น (แสดงในรายการ แต่ไม่นับเป็นครั้งที่สลับหน้าจอ)
//     gap    : สัญญาณขาด — เซิร์ฟเวอร์ไม่ได้รับสัญญาณจากหน้าสอบ (อาจเน็ตหลุด/รีเฟรช/จอดับ) ไม่แน่ชัดว่าออกจริง
//     multi  : เปิดข้อสอบหลายเครื่อง/หลายแท็บ
//     app    : เปิดข้อสอบในเบราว์เซอร์ของแอปแชต (LINE/Facebook)
//     roster : พยายามเข้าห้องที่ไม่มีรายชื่อ
//     other  : อื่น ๆ
(function (root) {
    const LEAVE_PREFIX = 'ออกจากหน้าข้อสอบ';
    const LABEL = {
        switch: 'สลับหน้าจอ', fs: 'ออกจากเต็มจอ', gap: 'สัญญาณขาด',
        multi: 'เปิดหลายเครื่อง/แท็บ', app: 'เปิดในแอปแชต', roster: 'ไม่มีรายชื่อ', other: 'อื่น ๆ'
    };
    const LEAVE_KINDS = ['switch', 'fs'];
    function kindOf(action) {
        const a = String(action || '').replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\s]+/u, '');
        // ลำดับสำคัญ: ข้อความจากหน้าสอบขึ้นต้นด้วย "ออกจากหน้าข้อสอบ" เสมอ (ข้างในอาจมีคำว่า "หยุดทำงาน"/"สลับ")
        if (a.startsWith(LEAVE_PREFIX)) return 'switch';
        if (/เต็มจอ/.test(a)) return 'fs';
        if (/อีกเครื่อง|หลายเครื่อง|หลายแท็บ|แท็บใหม่/.test(a)) return 'multi';
        if (/สัญญาณขาด|หายจากหน้าสอบ|หยุดทำงาน|ขาดการติดต่อ/.test(a)) return 'gap';
        if (/เบราว์เซอร์ของ|LINE|Facebook|Messenger|Instagram/i.test(a)) return 'app';
        if (/ไม่มีรายชื่อ/.test(a)) return 'roster';
        if (/สลับ|ออกหน้าจอ/.test(a)) return 'switch'; // ประวัติรูปแบบเก่า
        return 'other';
    }
    const isLeave = action => LEAVE_KINDS.includes(kindOf(action));
    const api = { LEAVE_PREFIX, LABEL, LEAVE_KINDS, kindOf, isLeave };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.WatchKind = api;
})(typeof window !== 'undefined' ? window : globalThis);
