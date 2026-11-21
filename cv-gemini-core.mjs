// เรียก Gemini แบบทนทาน: ลองใหม่อัตโนมัติ, กำหนดเวลาหมด, สลับไปโมเดลสำรอง
// ใช้ร่วมกันทั้งเบราว์เซอร์ (js/gemini.js) และเซิร์ฟเวอร์ (server/exam-converter-router.js)
// ห้าม import อะไรที่ใช้ได้แค่ในเบราว์เซอร์หรือแค่ใน Node

import { API_BASE, buildRequest, parseResponse } from "./cv-prompt.mjs";

const LITE = "gemini-flash-lite-latest";
const FLASH = "gemini-flash-latest";
/** โมเดลสำรอง: ถ้าใช้ Lite อยู่ สำรองเป็น Flash, นอกนั้นสำรองเป็น Lite */
export const fallbackFor = (model) => (model === LITE ? FLASH : LITE);
export const FALLBACK_MODEL = LITE;

/** error จาก Gemini: status = HTTP status (0 = เครือข่าย), raw = ข้อความดิบจาก Google
 *  code: timeout | network | daily_quota (โควตาวันหมด) | rate (ถี่เกินต่อนาที) | no_access (โมเดลไม่อยู่ในแพ็กเกจ) | ... */
export class GeminiError extends Error {
  constructor(status, raw, { retryable = false, retryAfterMs, code, switchModel = false, resetAt } = {}) {
    super(raw);
    this.name = "GeminiError";
    this.status = status;
    this.raw = raw;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
    this.code = code;
    this.switchModel = switchModel; // โมเดลนี้ใช้ไม่ได้ แต่โมเดลอื่นอาจได้
    this.resetAt = resetAt;         // daily_quota: เวลาที่โควตากลับมา (Date)
  }
}

/** โควตารายวันของ Gemini รีเซ็ตตอนเที่ยงคืนเวลาแปซิฟิก (ช่วง พ.ย.–มี.ค. ตรงกับ 15:00 น. ไทย) */
export function quotaResetAt(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(now).map((x) => [x.type, x.value]));
  const localMs = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offset = Math.round((localMs - now.getTime()) / 60000) * 60000; // เวลาแปซิฟิก - UTC
  const nextMidnight = Math.floor((now.getTime() + offset) / 86400000) * 86400000 + 86400000;
  return new Date(nextMidnight - offset);
}

/** "15:00 น." หรือ "พรุ่งนี้ 15:00 น." ตามเวลาไทย */
export function formatThaiTime(date, now = new Date()) {
  const opt = { timeZone: "Asia/Bangkok" };
  const time = date.toLocaleTimeString("th-TH", { ...opt, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const day = (d) => d.toLocaleDateString("en-CA", opt);
  return `${day(date) === day(now) ? "" : "พรุ่งนี้ "}${time} น.`;
}

/** 429 ที่เกิดจาก "โควตาต่อวัน" หมด (ลองใหม่วันนี้ไม่ช่วย) ไม่ใช่แค่ส่งถี่เกินต่อนาที */
export function isDailyQuota(body, raw = "") {
  const violations = (body?.error?.details || []).flatMap((d) => d.violations || []);
  if (violations.some((v) => /per\s*day/i.test(`${v.quotaId || ""} ${v.quotaMetric || ""}`) || /PerDay/.test(v.quotaId || ""))) return true;
  return /per[\s_-]?day/i.test(raw);
}

const abortError = () => {
  const e = new Error("Aborted");
  e.name = "AbortError";
  return e;
};

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); reject(abortError()); }, { once: true });
  });
}

function retryDelayMs(body) {
  const info = (body?.error?.details || []).find((d) => String(d["@type"]).includes("RetryInfo"));
  const m = /^([\d.]+)s$/.exec(info?.retryDelay || "");
  return m ? Math.round(parseFloat(m[1]) * 1000) : undefined;
}

/** เรียก generateContent ครั้งเดียว แปลงทุกความผิดพลาดเป็น GeminiError */
async function callOnce({ apiKey, model, body, signal, timeoutMs, fetchImpl }) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
  try {
    let res;
    try {
      res = await fetchImpl(`${API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body,
        signal: ctrl.signal,
      });
    } catch (e) {
      if (signal?.aborted) throw abortError();
      // ช้าเกิน: ลองโมเดลเดิมซ้ำมักช้าเหมือนเดิม จึงสลับไปโมเดลสำรองทันที
      if (timedOut) throw new GeminiError(504, "timeout", { code: "timeout", switchModel: true });
      throw new GeminiError(0, String(e?.message || e), { retryable: true, code: "network" });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const raw = data?.error?.message || res.statusText || `HTTP ${res.status}`;
      const wait = retryDelayMs(data);
      if (res.status === 429) {
        // "limit: 0" = โมเดลนี้ไม่อยู่ในแพ็กเกจ -> ไม่รอ ให้สลับโมเดลแทน
        if (/limit: 0\b/.test(raw)) throw new GeminiError(429, raw, { code: "no_access", switchModel: true });
        // โควตาวันหมด: ลองซ้ำวันนี้ไม่ช่วย สลับโมเดลทันที (โมเดลอื่นมีโควตาแยก)
        if (isDailyQuota(data, raw)) throw new GeminiError(429, raw, { code: "daily_quota", switchModel: true, resetAt: quotaResetAt() });
        const longWait = wait !== undefined && wait > 30000;
        throw new GeminiError(429, raw, { code: "rate", retryable: !longWait, retryAfterMs: wait, switchModel: true });
      }
      if (res.status === 404) throw new GeminiError(404, raw, { switchModel: true });
      if (res.status >= 500) throw new GeminiError(res.status, raw, { retryable: true, switchModel: true });
      throw new GeminiError(res.status, raw); // 400/401/403: key ผิดหรือ input ผิด ลองใหม่ไม่ช่วย
    }
    try {
      return { result: parseResponse(data), usage: data.usageMetadata };
    } catch (e) {
      // JSON เสีย/ว่าง มักหายเมื่อลองใหม่, ยาวเกิน/ถูกบล็อก ลองใหม่ไม่ช่วย
      const retryable = e.code === "bad_json" || e.code === "empty";
      throw new GeminiError(422, e.message, { retryable, code: e.code });
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** เวลารอที่เหมาะกับขนาดไฟล์: ข้อความสั้น ๆ ไม่ควรรอเกินครึ่งนาที, PDF ใหญ่รอได้นานขึ้น */
export function timeoutFor(parts) {
  const bytes = parts.reduce((n, p) => n + (p.text?.length || 0) * 3 + (p.inline_data?.data?.length || 0) * 0.75, 0);
  return Math.min(240000, 30000 + Math.round(bytes / 1024) * 60); // 30 วิ + ~6 วิ ต่อ 100KB สูงสุด 4 นาที
}

/**
 * แปลงข้อสอบด้วย Gemini พร้อมลองใหม่และโมเดลสำรอง
 * @returns {Promise<{questions, skipped, model, usage}>}
 */
export async function generateQuestions({
  apiKey,
  model,
  parts,
  solveMissing = true,
  signal,
  fallbackModel = fallbackFor(model),
  retries = 2,
  timeoutMs = timeoutFor(parts),
  onRetry,
  fetchImpl = (...a) => fetch(...a),
}) {
  const models = [model, fallbackModel].filter((m, i, a) => m && a.indexOf(m) === i);
  let lastErr;
  const perModel = []; // error สุดท้ายของแต่ละโมเดลที่ลองแล้ว
  for (let mi = 0; mi < models.length; mi++) {
    const m = models[mi];
    const body = JSON.stringify(buildRequest(parts, solveMissing, m));
    // โมเดลสำรองได้เวลารอเต็ม (อย่างต่ำ 2 นาที) เพราะเป็นโอกาสสุดท้าย
    const limit = mi === models.length - 1 && mi > 0 ? Math.max(timeoutMs, 120000) : timeoutMs;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const { result, usage } = await callOnce({ apiKey, model: m, body, signal, timeoutMs: limit, fetchImpl });
        return { ...result, model: m, usage };
      } catch (e) {
        if (e.name === "AbortError") throw e;
        lastErr = e;
        if (!e.retryable || attempt === retries) break;
        const waitMs = Math.min(e.retryAfterMs ?? 2000 * 2 ** attempt, 20000);
        onRetry?.({ type: "retry", model: m, attempt: attempt + 1, waitMs, status: e.status });
        await sleep(waitMs, signal);
      }
    }
    perModel.push(lastErr);
    const next = models[mi + 1];
    if (!next || !lastErr?.switchModel) break;
    onRetry?.({ type: "switch", from: m, model: next, status: lastErr.status, code: lastErr.code });
  }
  // แจ้ง "โควตาวันหมด" เฉพาะเมื่อทุกโมเดลที่ลองหมดจริง ถ้าตัวสำรองแค่ไม่ว่างชั่วคราว ให้ครูลองใหม่ได้
  if (lastErr?.code === "daily_quota" && !perModel.every((e) => e?.code === "daily_quota" || e?.code === "no_access")) {
    lastErr.code = "rate";
  }
  throw lastErr;
}
