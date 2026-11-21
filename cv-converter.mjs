// API หลักของตัวแปลง — ใช้ซ้ำได้จากหน้าอื่น (เช่น หน้าสร้างข้อสอบของ ExamPro)
//
//   import { convertFiles } from "./js/converter.js";
//   const { rows } = await convertFiles(files, { apiKey, model });          // โหมด direct
//   const { rows } = await convertFiles(files, { mode: "server", model });  // โหมด server (ใช้ Key ของระบบ)
//
//   rows = [{ question, options: [...], answer: "a".."g", source: "file"|"ai"|"none", note }]
//   แปลงเป็นข้อสอบ ExamPro ได้ด้วย toExamProQuestion(row)

import { fileToParts } from "./cv-extract.mjs";
import { extractQuestions, DEFAULT_MODEL } from "./cv-gemini.mjs";
import { extractQuestionsViaServer } from "./cv-server-client.mjs";
import { normalize, dedupe } from "./cv-excel.mjs";
import { CONFIG } from "./cv-config.mjs";

/**
 * @param {File[]} files
 * @param {object} opts
 * @param {"direct"|"server"} [opts.mode]  ค่าเริ่มต้นตาม js/config.js
 * @param {string} [opts.apiKey]           จำเป็นเฉพาะโหมด direct
 * @param {string} [opts.model]
 * @param {boolean} [opts.solveMissing=true]
 * @param {AbortSignal} [opts.signal]
 * @param {(i:number, status:"run"|"ok"|"err", info?:any)=>void} [opts.onFile]
 * @param {(i:number, info:object)=>void} [opts.onRetry]  แจ้งเมื่อกำลังลองใหม่/สลับโมเดล
 * @returns {Promise<{rows, skipped, duplicates, errors, remaining, stopped}>}
 *   stopped = หยุดก่อนครบทุกไฟล์ (โควตาหมด/ไม่ได้ล็อกอิน) { code, resetAt?, notRun, message } หรือ null
 */
export async function convertFiles(files, { mode = CONFIG.mode, apiKey, model = DEFAULT_MODEL, solveMissing = true, signal, onFile, onRetry } = {}) {
  if (mode === "direct" && !apiKey) throw new Error("กรุณาใส่ Gemini API Key");
  const all = [];
  const errors = [];
  let skipped = 0;
  let remaining;
  let stopped = null; // หยุดกลางทาง: { code: "daily_quota" | "user_quota" | ..., resetAt?, notRun, message }

  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) break;
    onFile?.(i, "run");
    try {
      const parts = await fileToParts(files[i]);
      const opts = { model, parts, solveMissing, signal, onRetry: (info) => onRetry?.(i, info) };
      const res = mode === "server"
        ? await extractQuestionsViaServer(opts)
        : await extractQuestions({ ...opts, apiKey });
      const got = normalize(res.questions);
      all.push(...got);
      skipped += res.skipped || 0;
      if (res.remaining !== undefined) remaining = res.remaining;
      onFile?.(i, "ok", { count: got.length, model: res.model });
    } catch (err) {
      if (err.name === "AbortError") break;
      errors.push({ file: files[i].name, message: err.message, code: err.code });
      onFile?.(i, "err", { message: err.message, code: err.code });
      // key ผิด / ไม่ได้ล็อกอิน / โควตาหมด: ไฟล์ถัดไปก็จะพังเหมือนกัน หยุดเลย
      if ([401, 403, 429].includes(err.status) || /API Key/.test(err.message)) {
        stopped = { code: err.code || `http_${err.status}`, resetAt: err.resetAt, notRun: files.length - i - 1, message: err.message };
        break;
      }
    }
  }
  const { rows, removed } = dedupe(all);
  return { rows, skipped, duplicates: removed, errors, remaining, stopped };
}

/** แปลงแถวเป็นรูปแบบข้อสอบใน admin-questions.html ของ ExamPro (รองรับ 4 ตัวเลือก) */
export function toExamProQuestion(row) {
  const choices = [0, 1, 2, 3].map((j) => row.options[j] || "");
  return {
    question: row.question,
    question_img: "",
    choices,
    choices_img: ["", "", "", ""],
    answer: ["a", "b", "c", "d"].includes(row.answer) ? row.answer : "a",
    timeLimit: 20,
    type: "quiz",
  };
}

export { DEFAULT_MODEL };
