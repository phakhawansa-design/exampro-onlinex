// สร้างไฟล์ Excel ตามรูปแบบที่เว็บทำข้อสอบใช้นำเข้า
// คอลัมน์: question, a, b, c, d, [e, f, g], answer

export const LETTERS = ["a", "b", "c", "d", "e", "f", "g"];
export const EMPTY_FILL = "-"; // ใส่แทนช่องตัวเลือกที่ไม่มี (กฎ: ห้ามเว้นช่องว่าง)

/** แปลงผลจาก Gemini เป็นแถวมาตรฐาน { question, options[], answer, source, note } */
export function normalize(questions) {
  return questions
    .map((q) => {
      const options = (q.options || [])
        .map((o) => String(o ?? "").trim())
        .filter((o, i, arr) => o !== "" || i < arr.length - 1)
        .slice(0, LETTERS.length);
      let answer = String(q.answer || "").trim().toLowerCase();
      if (!LETTERS.slice(0, options.length).includes(answer)) answer = "";
      return {
        question: String(q.question || "").trim(),
        options,
        answer,
        source: answer ? q.answer_source || "file" : "none",
        note: q.note || "",
      };
    })
    .filter((r) => r.question && r.options.length >= 2);
}

/** จำนวนคอลัมน์ตัวเลือก: อย่างน้อย 4 (a-d) เพิ่ม e,f,g เมื่อมีข้อที่ตัวเลือกเกิน 4 */
export function optionCount(rows) {
  return Math.max(4, ...rows.map((r) => r.options.length));
}

const squash = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
const rowKey = (r) => [r.question, ...r.options].map(squash).join("\u0001");

/** ตัดข้อที่ซ้ำกันทุกตัวอักษร (เช่น อัปโหลดไฟล์เดียวกันสองครั้ง) คืน { rows, removed } */
export function dedupe(rows) {
  const seen = new Set();
  const out = rows.filter((r) => {
    const k = rowKey(r);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { rows: out, removed: rows.length - out.length };
}

/**
 * ตรวจหาปัญหา
 * level "error" = ผิดกฎของไฟล์ (ช่องว่าง/ไม่มีเฉลย) ควรแก้ก่อนดาวน์โหลด
 * level "warn"  = น่าสงสัย ควรตรวจ (ตัวเลือกซ้ำ, โจทย์ซ้ำ)
 */
export function validate(rows) {
  const issues = [];
  const qSeen = new Map();
  rows.forEach((r, i) => {
    if (!r.question) issues.push({ row: i, level: "error", msg: "ไม่มีโจทย์" });
    if (!r.answer) issues.push({ row: i, level: "error", msg: "ไม่มีเฉลย" });
    else if (!r.options[LETTERS.indexOf(r.answer)]) issues.push({ row: i, level: "error", msg: "เฉลยชี้ไปที่ตัวเลือกว่าง" });
    r.options.forEach((o, j) => {
      if (!o) issues.push({ row: i, level: "error", msg: `ตัวเลือก ${LETTERS[j]} ว่าง` });
    });
    const opts = r.options.filter(Boolean).map(squash);
    if (new Set(opts).size !== opts.length) issues.push({ row: i, level: "warn", msg: "มีตัวเลือกซ้ำกัน" });
    const q = squash(r.question);
    if (q) {
      if (qSeen.has(q)) issues.push({ row: i, level: "warn", msg: `โจทย์ซ้ำกับข้อ ${qSeen.get(q) + 1}` });
      else qSeen.set(q, i);
    }
  });
  return issues;
}

/** ข้อมูลเป็น array of arrays (แถวแรก = header) */
export function toTable(rows) {
  const n = optionCount(rows);
  const header = ["question", ...LETTERS.slice(0, n), "answer"];
  const body = rows.map((r) => [
    r.question,
    ...LETTERS.slice(0, n).map((_, j) => (r.options[j] ? r.options[j] : EMPTY_FILL)),
    r.answer,
  ]);
  return [header, ...body];
}

/** ดาวน์โหลดไฟล์ .xlsx ทันที */
export function downloadXlsx(rows, filename) {
  const XLSX = window.XLSX;
  if (!XLSX) throw new Error("โหลดตัวสร้าง Excel ไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ");
  const table = toTable(rows);
  const ws = XLSX.utils.aoa_to_sheet(table);
  const n = table[0].length;
  ws["!cols"] = table[0].map((h, i) => ({ wch: i === 0 ? 60 : i === n - 1 ? 8 : 28 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "questions");
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}
