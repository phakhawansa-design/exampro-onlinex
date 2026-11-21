// โหมด "direct": เบราว์เซอร์เรียก Gemini เองด้วย API Key ที่ผู้ใช้กรอก
// (ใช้ตอนนี้ระหว่างพัฒนา / เวอร์ชัน GitHub Pages)

import { API_BASE, DEFAULT_MODEL, friendlyError } from "./cv-prompt.mjs";
import { generateQuestions, formatThaiTime, quotaResetAt } from "./cv-gemini-core.mjs";

export { DEFAULT_MODEL };

/** คืนรายชื่อโมเดล Gemini ที่ใช้ generateContent ได้ */
export async function listModels(apiKey) {
  const res = await fetch(`${API_BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": apiKey } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(friendlyError(res.status, data?.error?.message || res.statusText));
    err.status = res.status;
    throw err;
  }
  return (data.models || [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => ({ id: m.name.replace(/^models\//, ""), label: m.displayName || m.name }))
    .filter((m) => /^gemini/i.test(m.id) && !/(embedding|tts|image|audio|live|vision|banana|robotics|transcribe|computer-use)/i.test(m.id));
}

function directMessage(e) {
  if (e.code === "timeout") return "AI ใช้เวลานานเกินไป ลองแบ่งไฟล์ให้สั้นลง หรือเลือกโมเดล Flash-Lite";
  if (e.code === "network") return "เชื่อมต่อ Google ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่";
  if (e.status === 422) return e.raw;
  if (e.code === "daily_quota") {
    return `โควตา AI ของ API Key นี้สำหรับวันนี้หมดแล้ว ใช้ได้อีกครั้ง ${formatThaiTime(e.resetAt || quotaResetAt())} ` +
      "(หรือเปิด billing ใน AI Studio เพื่อใช้ต่อได้ทันที)";
  }
  if (e.code === "no_access") return "โมเดลนี้ใช้กับโควตาฟรีไม่ได้ เลือก Flash-Lite หรือเปิด billing ใน AI Studio";
  if (e.status === 429) {
    const sec = e.retryAfterMs ? Math.ceil(e.retryAfterMs / 1000) : 0;
    return `ส่งคำขอถี่เกินไป รอ${sec ? `ประมาณ ${sec} วินาที` : "สักครู่"}แล้วลองใหม่`;
  }
  return friendlyError(e.status, e.raw);
}

/** ส่ง parts ให้ Gemini แล้วคืน { questions, skipped, model } */
export async function extractQuestions({ apiKey, model, parts, solveMissing, signal, onRetry }) {
  try {
    return await generateQuestions({ apiKey, model, parts, solveMissing, signal, onRetry });
  } catch (e) {
    if (e.name === "AbortError" || e.name !== "GeminiError") throw e;
    const err = new Error(directMessage(e));
    err.status = e.status;
    err.code = e.code;
    err.resetAt = e.resetAt;
    throw err;
  }
}
