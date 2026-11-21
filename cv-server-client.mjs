// โหมด "server": ส่งไฟล์ให้เซิร์ฟเวอร์ ExamPro เรียก Gemini แทน (API Key อยู่ที่เซิร์ฟเวอร์)
// คู่กับ server/exam-converter-router.js

import { CONFIG } from "./cv-config.mjs";

// 409 = คำขอก่อนหน้ายังไม่จบ (เช่น เพิ่งกดยกเลิก), 502-504 = เซิร์ฟเวอร์ตื่นจากหลับ (Render) หรือ AI ไม่ว่างชั่วคราว
const RETRYABLE = new Set([0, 409, 502, 503, 504]);

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    }, { once: true });
  });
}

async function callOnce(path, init) {
  const token = CONFIG.getAuthToken();
  let res;
  try {
    res = await fetch(`${CONFIG.serverBase}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
      },
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw Object.assign(new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่"), { status: 0 });
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      res.status === 401 ? "กรุณาเข้าสู่ระบบ ExamPro ก่อนใช้งาน" :
      res.status === 403 ? "บัญชีนี้ไม่มีสิทธิ์ใช้ตัวแปลงข้อสอบ" :
      res.status === 404 ? "ไม่พบ API ตัวแปลงบนเซิร์ฟเวอร์ (ยังไม่ได้ติดตั้ง server/exam-converter-router.js)" :
      body.error || `เซิร์ฟเวอร์ตอบกลับผิดพลาด (${res.status})`
    );
    err.status = res.status;
    err.code = body.code;                                   // daily_quota | user_quota | ...
    if (body.resetAt) err.resetAt = new Date(body.resetAt);
    throw err;
  }
  return body;
}

async function call(path, init = {}, { retries = 2, onRetry } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await callOnce(path, init);
    } catch (e) {
      if (e.name === "AbortError" || !RETRYABLE.has(e.status) || attempt >= retries) throw e;
      const waitMs = 3000 * (attempt + 1);
      onRetry?.({ type: "retry", attempt: attempt + 1, waitMs, status: e.status });
      await sleep(waitMs, init.signal);
    }
  }
}

/** { models:[{id,label}], defaultModel, limit, remaining, configured } */
export function getServerConfig() {
  return call("/convert-exam/config", {}, { retries: 3 }); // เผื่อ Render กำลังตื่น (~30-60 วินาที)
}

/** ส่ง parts ให้เซิร์ฟเวอร์แปลง คืน { questions, skipped, remaining, model } */
export function extractQuestionsViaServer({ model, parts, solveMissing, signal, onRetry }) {
  return call(
    "/convert-exam",
    { method: "POST", body: JSON.stringify({ model, parts, solveMissing }), signal },
    { onRetry }
  );
}
