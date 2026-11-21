// คำสั่ง (prompt) + โครงสร้างคำตอบที่ส่งให้ Gemini
// ไฟล์นี้ใช้ร่วมกันทั้งฝั่งเบราว์เซอร์ (โหมด direct) และฝั่งเซิร์ฟเวอร์ (server/exam-converter-router.js)
// แก้ prompt ที่นี่ที่เดียว ทั้งสองโหมดจะได้ผลเหมือนกัน
// ห้าม import อะไรที่ใช้ได้แค่ในเบราว์เซอร์หรือแค่ใน Node

export const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
// ใช้ชื่อ alias "-latest" ซึ่ง Google ชี้ไปรุ่นล่าสุดให้เอง โมเดลรุ่นเก่าถูกปิดก็ไม่ต้องแก้โค้ด
// Flash-Lite เป็นค่าเริ่มต้น: ทดสอบแล้วตอบ ~1.5–2 วินาทีสม่ำเสมอ และดึงข้อสอบได้แม่นเท่า Flash
// ส่วน Flash ช้าไม่แน่นอน (5–120 วินาที และเจอ 503 บ่อยช่วงคนใช้เยอะ)
export const DEFAULT_MODEL = "gemini-flash-lite-latest";
export const RECOMMENDED_MODELS = [
  { id: "gemini-flash-lite-latest", label: "Gemini Flash-Lite (เร็ว, แนะนำ)" },
  { id: "gemini-flash-latest", label: "Gemini Flash (อ่านไฟล์สแกน/โจทย์ยากได้ดีกว่า แต่ช้ากว่า)" },
  { id: "gemini-pro-latest", label: "Gemini Pro รุ่นล่าสุด (แม่นสุด, ต้องเปิด billing)" },
];

const SYSTEM_PROMPT = `คุณเป็น AI ผู้ช่วยแปลงข้อสอบแบบปรนัย (multiple choice) ให้เป็นข้อมูลตาราง
หน้าที่: อ่านข้อสอบทั้งหมดที่ได้รับ แล้วดึงทุกข้อออกมาตามลำดับ ห้ามข้าม ห้ามรวมข้อ ห้ามแต่งโจทย์เพิ่ม

กฎการดึงข้อมูล:
1. question = ข้อความโจทย์เต็ม ๆ ตามต้นฉบับ แต่ตัดเลขข้อหน้าโจทย์ออก (เช่น "1.", "ข้อ 1)", "Q1:")
   - ถ้าโจทย์มีข้อความนำ/บทความ/ตารางที่ใช้ร่วมกันหลายข้อ ให้ใส่ข้อความนั้นไว้ต้นโจทย์ของทุกข้อที่เกี่ยวข้อง
   - ถ้ามีรูปภาพที่อ่านเป็นข้อความไม่ได้ ให้เขียน [รูปภาพ: คำอธิบายสั้น ๆ] ไว้ในโจทย์
   - สมการ/สูตร ให้เขียนเป็นข้อความธรรมดาที่อ่านเข้าใจได้ เช่น x^2 + 3x = 0, √2, H2O
2. options = รายการตัวเลือกตามลำดับเดิม ตัดตัวนำหน้าตัวเลือกออก (เช่น "ก.", "ข)", "A.", "(1)", "a)")
   - ตัวเลือก ก ข ค ง จ ฉ ช หรือ 1 2 3 4 5 หรือ A B C D E ให้เรียงตามลำดับเดิม (ลำดับที่ 1 = a, 2 = b, ...)
3. answer = ตัวอักษรภาษาอังกฤษพิมพ์เล็กของตัวเลือกที่ถูก (a, b, c, d, e, f, g) ตามลำดับใน options
   - ใช้เฉลยจากไฟล์ก่อนเสมอ: ตารางเฉลยท้ายเล่ม, ตัวเลือกที่ถูกทำตัวหนา/ขีดเส้นใต้/ไฮไลต์/มีเครื่องหมาย ✓ * หรือวงกลม
   - answer_source = "file" เมื่อได้เฉลยจากไฟล์
{{SOLVE_RULE}}
4. ห้ามคืนข้อที่ไม่ใช่ปรนัย (เช่น อัตนัย เติมคำ) ให้นับไว้ใน skipped แทน
5. note = หมายเหตุสั้น ๆ ภาษาไทยถ้าข้อนั้นมีปัญหา (อ่านไม่ชัด, เฉลยกำกวม, ตัวเลือกขาด) ถ้าไม่มีปัญหาให้เป็น ""
`;

const SOLVE_ON = `   - ถ้าไฟล์ไม่มีเฉลยสำหรับข้อนั้น ให้คุณแก้โจทย์เองอย่างรอบคอบแล้วใส่คำตอบที่ถูกที่สุด และตั้ง answer_source = "ai"`;
const SOLVE_OFF = `   - ถ้าไฟล์ไม่มีเฉลยสำหรับข้อนั้น ห้ามเดา ให้ answer = "" และ answer_source = "none"`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          question: { type: "STRING" },
          options: { type: "ARRAY", items: { type: "STRING" } },
          // ไม่ใช้ enum เพราะ Gemini ไม่รับค่าว่างใน enum — excel.js normalize() ตรวจค่า a–g ให้อีกชั้น
          answer: { type: "STRING", description: "a-g หรือ \"\" ถ้าไม่มีเฉลย" },
          answer_source: { type: "STRING", enum: ["file", "ai", "none"] },
          note: { type: "STRING" },
        },
        required: ["question", "options", "answer", "answer_source", "note"],
        propertyOrdering: ["question", "options", "answer", "answer_source", "note"],
      },
    },
    skipped: { type: "INTEGER" },
  },
  required: ["questions", "skipped"],
  propertyOrdering: ["questions", "skipped"],
};

/** ชนิดไฟล์ที่อนุญาตให้ส่งเป็น inline_data (ฝั่งเซิร์ฟเวอร์ใช้ตรวจ input ด้วย) */
export const ALLOWED_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"];

/** สร้าง body ของ generateContent */
export function buildRequest(parts, solveMissing, model = DEFAULT_MODEL) {
  const system = SYSTEM_PROMPT.replace("{{SOLVE_RULE}}", solveMissing ? SOLVE_ON : SOLVE_OFF);
  const generationConfig = {
    temperature: 0.1,
    responseMimeType: "application/json",
    responseSchema: RESPONSE_SCHEMA,
  };
  // งานดึงข้อมูลไม่ต้องคิดลึก: ลดระดับการคิดทำให้เร็วขึ้นมาก (ทดสอบแล้ว ~3–8 วินาที จาก 20–120 วินาที)
  // รุ่น 2.x ไม่รองรับ thinkingLevel จึงข้ามไป
  if (!/gemini-[12]\./.test(model)) generationConfig.thinkingConfig = { thinkingLevel: "low" };
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [
      {
        role: "user",
        parts: [...parts, { text: "แปลงข้อสอบในเอกสารนี้ทั้งหมดตามกฎ แล้วตอบเป็น JSON ตาม schema" }],
      },
    ],
    generationConfig,
  };
}

function responseError(code, message) {
  const e = new Error(message);
  e.code = code; // blocked | empty | max_tokens | bad_json
  return e;
}

/** แปลงคำตอบดิบของ Gemini เป็น { questions, skipped } หรือ throw Error (มี .code) */
export function parseResponse(data) {
  const cand = data?.candidates?.[0];
  if (!cand) {
    const reason = data?.promptFeedback?.blockReason;
    if (reason) throw responseError("blocked", `Gemini ปฏิเสธเนื้อหา (${reason})`);
    throw responseError("empty", "Gemini ไม่ส่งผลลัพธ์กลับมา");
  }
  if (cand.finishReason === "MAX_TOKENS") {
    throw responseError("max_tokens", "ข้อสอบยาวเกินกว่าที่โมเดลตอบได้ในครั้งเดียว ลองแบ่งไฟล์เป็นส่วน ๆ แล้วอัปโหลดพร้อมกัน");
  }
  if (cand.finishReason === "SAFETY" || cand.finishReason === "PROHIBITED_CONTENT") {
    throw responseError("blocked", "Gemini ไม่ตอบเพราะติดตัวกรองความปลอดภัย ลองตัดส่วนที่อาจเป็นปัญหาออก");
  }
  const text = (cand.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || "").join("");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw responseError("bad_json", "อ่านผลลัพธ์จาก Gemini ไม่ได้ ลองใหม่อีกครั้ง");
  }
  if (!parsed || !Array.isArray(parsed.questions)) throw responseError("bad_json", "ผลลัพธ์จาก Gemini ไม่ครบ ลองใหม่อีกครั้ง");
  return { questions: parsed.questions, skipped: Number(parsed.skipped) || 0 };
}

/** แปลง HTTP error ของ Gemini เป็นข้อความภาษาไทย */
export function friendlyError(status, msg) {
  if (status === 400 && /API key not valid/i.test(msg)) return "API Key ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง";
  if (status === 403) return `API Key ไม่มีสิทธิ์ใช้งาน (${msg})`;
  if (status === 404) return `ไม่พบโมเดลนี้ ลองเลือกโมเดลอื่น (${msg})`;
  if (status === 429) return "ใช้งานเกินโควตาของ API Key แล้ว รอสักครู่หรือเปลี่ยนโมเดล";
  if (status >= 500) return `เซิร์ฟเวอร์ Gemini มีปัญหาชั่วคราว ลองใหม่อีกครั้ง (${msg})`;
  return msg;
}
