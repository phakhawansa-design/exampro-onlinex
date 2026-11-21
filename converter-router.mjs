// Express router สำหรับแปลงข้อสอบด้วย Gemini โดยใช้ API Key ของระบบ
//
// เสียบเข้า ExamPro:
//   import { createExamConverterRouter } from "./converter-router.mjs";
//   app.use("/api/ai", createExamConverterRouter({
//     requireAuth: [authMiddleware, requireTeacher],     // middleware ตรวจ token ที่ ExamPro มีอยู่แล้ว
//     getUserId: (req) => req.user.username,
//   }));
//
// Endpoints (ถ้า mount ที่ /api/ai):
//   GET  /api/ai/convert-exam/config  -> { models, defaultModel, limit, remaining }
//   POST /api/ai/convert-exam         body { parts, solveMissing, model } -> { questions, skipped, remaining, model }
//
// ต้องใช้ Node 18+ (มี fetch ในตัว) และไฟล์ ../js/prompt.js, ../js/gemini-core.js

import express from "express";
import { DEFAULT_MODEL, RECOMMENDED_MODELS, ALLOWED_MIME } from "./cv-prompt.mjs";
import { generateQuestions, quotaResetAt, formatThaiTime } from "./cv-gemini-core.mjs";

// หลังรู้ว่าโควตาวันของ Google หมด จะตอบทันทีโดยไม่เรียก Google ซ้ำช่วงหนึ่ง
// (ไม่นานเกินไป เผื่อผู้ดูแลเพิ่งเปิด billing)
const QUOTA_RECHECK_MS = 10 * 60 * 1000;

// Flash + Flash-Lite (Pro ใช้โควตาฟรีไม่ได้ ถ้าเปิด billing แล้วส่ง models: RECOMMENDED_MODELS ได้)
const DEFAULT_MODELS = RECOMMENDED_MODELS.filter((m) => !/pro/.test(m.id));

/** ตัวนับการใช้งานรายวันแบบเก็บในหน่วยความจำ (รีเซ็ตเมื่อเซิร์ฟเวอร์รีสตาร์ต)
 *  ใช้จริงควรส่ง usageStore ที่เก็บลงฐานข้อมูลของ ExamPro แทน โดยมีเมธอดแบบเดียวกัน */
export function createMemoryUsageStore() {
  const map = new Map();
  return {
    async get(userId, day) {
      return map.get(`${day}:${userId}`) || 0;
    },
    async increment(userId, day) {
      const k = `${day}:${userId}`;
      map.set(k, (map.get(k) || 0) + 1);
      for (const key of map.keys()) if (!key.startsWith(`${day}:`)) map.delete(key); // ล้างวันเก่า
    },
  };
}

export function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }); // YYYY-MM-DD เวลาไทย
}

class HttpError extends Error {
  /** extra = ฟิลด์เพิ่มเติมที่ส่งกลับใน JSON เช่น { code, resetAt } */
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const quotaError = (resetAt) => new HttpError(429,
  `โควตา AI ของระบบสำหรับวันนี้หมดแล้ว ใช้ได้อีกครั้ง ${formatThaiTime(resetAt)}`,
  { code: "daily_quota", resetAt: resetAt.toISOString() });

/** ตรวจ parts ที่ส่งมาจากเบราว์เซอร์ ไม่ให้ส่งอะไรแปลก ๆ หรือใหญ่เกินไปยัง Gemini */
export function validateParts(parts, { maxBytes, maxParts }) {
  if (!Array.isArray(parts) || parts.length === 0) throw new HttpError(400, "ไม่พบเนื้อหาไฟล์");
  if (parts.length > maxParts) throw new HttpError(400, `ไฟล์มีรูปภาพหรือส่วนประกอบมากเกินไป (สูงสุด ${maxParts})`);
  let bytes = 0;
  const clean = parts.map((p) => {
    if (p && typeof p.text === "string") {
      bytes += p.text.length * 3;
      return { text: p.text };
    }
    const d = p && p.inline_data;
    if (d && typeof d.data === "string" && ALLOWED_MIME.includes(d.mime_type)) {
      if (!/^[A-Za-z0-9+/=\s]*$/.test(d.data.slice(0, 1000))) throw new HttpError(400, "ข้อมูลไฟล์ไม่ถูกต้อง");
      bytes += Math.floor(d.data.length * 0.75);
      return { inline_data: { mime_type: d.mime_type, data: d.data } };
    }
    throw new HttpError(400, "รูปแบบไฟล์ไม่รองรับ");
  });
  if (bytes > maxBytes) throw new HttpError(413, `ไฟล์ใหญ่เกิน ${Math.round(maxBytes / 1048576)}MB`);
  return clean;
}

/** แปลง error ของ Gemini เป็นข้อความสำหรับครู (ไม่เปิดเผยรายละเอียดการตั้งค่าระบบ) */
function toHttpError(e) {
  if (e.code === "timeout") return new HttpError(504, "AI ใช้เวลานานเกินไป ลองแบ่งไฟล์ให้สั้นลง");
  if (e.status === 422) return new HttpError(422, e.raw);
  if (e.code === "daily_quota") return quotaError(e.resetAt || quotaResetAt());
  if (e.code === "no_access") return new HttpError(503, "การตั้งค่า AI ของระบบไม่ถูกต้อง กรุณาแจ้งผู้ดูแล");
  // ถี่เกินต่อนาที: 503 ให้หน้าเว็บลองใหม่เองอัตโนมัติ
  if (e.status === 429) return new HttpError(503, "ระบบ AI ใช้งานหนาแน่น กรุณาลองใหม่ในอีกสักครู่");
  if (e.status === 400 && /API key/i.test(e.raw || "")) return new HttpError(503, "การตั้งค่า AI ของระบบไม่ถูกต้อง กรุณาแจ้งผู้ดูแล");
  if (e.status === 403 || e.status === 404) return new HttpError(503, "การตั้งค่า AI ของระบบไม่ถูกต้อง กรุณาแจ้งผู้ดูแล");
  if (e.status === 0 || e.status >= 500) return new HttpError(502, "เชื่อมต่อ AI ไม่ได้ชั่วคราว ลองใหม่อีกครั้ง");
  return new HttpError(502, "AI อ่านไฟล์นี้ไม่ได้ ลองบันทึกเป็น PDF ใหม่แล้วอัปโหลดอีกครั้ง");
}

/**
 * @param {object} opts
 * @param {Function|Function[]} opts.requireAuth  middleware ตรวจสิทธิ์ (บังคับ เว้นแต่ allowAnonymous)
 * @param {(req)=>string} [opts.getUserId]       ใช้นับโควตารายคน
 * @param {string} [opts.apiKey]                  ค่าเริ่มต้น process.env.GEMINI_API_KEY
 * @param {{id:string,label:string}[]} [opts.models]  โมเดลที่อนุญาตให้เลือก
 * @param {string} [opts.defaultModel]
 * @param {string} [opts.fallbackModel]           โมเดลสำรองเมื่อโมเดลหลักไม่ว่าง
 * @param {number} [opts.dailyLimit=30]           จำนวนไฟล์ต่อคนต่อวัน (0 = ไม่จำกัด)
 * @param {number} [opts.maxBytes]                ขนาดไฟล์สูงสุดต่อคำขอ
 * @param {number} [opts.maxParts=40]
 * @param {number} [opts.timeoutMs]              เวลารอต่อครั้ง (ไม่ระบุ = ปรับตามขนาดไฟล์ 30 วิ–4 นาที)
 * @param {object} [opts.usageStore]              { get(userId, day), increment(userId, day) }
 * @param {(info)=>void} [opts.onUsage]           เรียกทุกครั้งที่แปลงเสร็จ (เอาไปบันทึก log ได้)
 * @param {(info)=>void} [opts.onQuotaExhausted]  เรียกเมื่อโควตาวันของ Google หมด { resetAt, userId } (เช่น แจ้งเตือนผู้ดูแล)
 * @param {Function} [opts.fetchImpl]             สำหรับทดสอบ
 * @param {boolean} [opts.allowAnonymous=false]   ใช้เฉพาะตอนทดสอบในเครื่อง
 */
export function createExamConverterRouter(opts = {}) {
  const {
    requireAuth,
    getUserId = (req) => req.user?.username || req.user?.id || req.ip,
    apiKey = process.env.GEMINI_API_KEY,
    models = DEFAULT_MODELS,
    defaultModel = models[0]?.id || DEFAULT_MODEL,
    fallbackModel, // ไม่ระบุ = Lite <-> Flash สลับกันอัตโนมัติ
    dailyLimit = Number(process.env.EXAM_AI_DAILY_LIMIT ?? 30),
    maxBytes = 18 * 1024 * 1024,
    maxParts = 40,
    timeoutMs, // ไม่ระบุ = ปรับตามขนาดไฟล์ (gemini-core timeoutFor)
    usageStore = createMemoryUsageStore(),
    onUsage,
    onQuotaExhausted,
    fetchImpl,
    allowAnonymous = false,
  } = opts;

  if (!requireAuth && !allowAnonymous) {
    throw new Error("createExamConverterRouter: ต้องส่ง requireAuth (middleware ตรวจการล็อกอิน)");
  }
  if (!apiKey) console.warn("[exam-converter] ยังไม่ได้ตั้งค่า GEMINI_API_KEY");

  const inFlight = new Map(); // userId -> จำนวนที่กำลังแปลง (กันกดรัว ๆ / เปิดหลายแท็บเกินโควตา)
  let quotaOut = null;        // { resetAt: Date, recheckAt: number } เมื่อโควตาวันของ Google หมด
  const quotaBlocked = () => {
    if (quotaOut && Date.now() >= Math.min(quotaOut.recheckAt, quotaOut.resetAt.getTime())) quotaOut = null;
    return quotaOut;
  };

  const router = express.Router();
  // ตรวจสิทธิ์ก่อนรับ body ใหญ่ ๆ คนที่ไม่ได้ล็อกอินจะส่งไฟล์เข้ามาไม่ได้
  if (requireAuth) router.use([].concat(requireAuth));
  // base64 ของไฟล์ 18MB ใหญ่ราว 24MB
  // (ถ้า ExamPro มี app.use(express.json()) ที่ limit เล็กกว่าอยู่ก่อน ให้ mount router นี้ก่อนบรรทัดนั้น)
  router.use(express.json({ limit: Math.ceil(maxBytes * 1.4 + 1024 * 1024) }));

  const remainingFor = async (userId) =>
    dailyLimit > 0
      ? Math.max(0, dailyLimit - (await usageStore.get(userId, today())) - (inFlight.get(userId) || 0))
      : null;

  router.get("/convert-exam/config", async (req, res, next) => {
    try {
      res.json({
        models,
        defaultModel,
        limit: dailyLimit || null,
        remaining: await remainingFor(getUserId(req)),
        configured: !!apiKey,
        aiQuotaResetAt: quotaBlocked()?.resetAt.toISOString() || null, // มีค่า = โควตา Google วันนี้หมด
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/convert-exam", async (req, res) => {
    const userId = getUserId(req);
    const started = Date.now();
    let reserved = false;
    try {
      if (!apiKey) throw new HttpError(503, "ผู้ดูแลระบบยังไม่ได้ตั้งค่า AI");
      if (inFlight.get(userId)) throw new HttpError(409, "กำลังแปลงไฟล์ก่อนหน้าอยู่ กรุณารอให้เสร็จก่อน");

      const { parts, solveMissing = true, model } = req.body || {};
      const useModel = models.some((m) => m.id === model) ? model : defaultModel;
      const cleanParts = validateParts(parts, { maxBytes, maxParts });

      // จองโควตาก่อนเรียก Gemini (เปิดหลายแท็บพร้อมกันก็ใช้เกินไม่ได้)
      if ((await remainingFor(userId)) === 0) {
        throw new HttpError(429, `ใช้ครบ ${dailyLimit} ไฟล์ของวันนี้แล้ว ใช้ได้อีกครั้งพรุ่งนี้`, { code: "user_quota" });
      }
      const blocked = quotaBlocked();
      if (blocked) throw quotaError(blocked.resetAt);
      inFlight.set(userId, 1);
      reserved = true;

      // ยกเลิกคำขอไป Gemini ถ้าผู้ใช้ปิดหน้าเว็บหรือกดยกเลิก
      const ctrl = new AbortController();
      res.on("close", () => { if (!res.writableEnded) ctrl.abort(); });

      let out;
      try {
        out = await generateQuestions({
          apiKey,
          model: useModel,
          parts: cleanParts,
          solveMissing: !!solveMissing,
          signal: ctrl.signal,
          ...(fallbackModel ? { fallbackModel } : {}),
          ...(timeoutMs ? { timeoutMs } : {}),
          ...(fetchImpl ? { fetchImpl } : {}),
          onRetry: (r) => console.warn(`[exam-converter] ${r.type} ${r.model} (status ${r.status})`),
        });
      } catch (e) {
        if (e.name === "AbortError") throw e;
        console.error(`[exam-converter] Gemini ${e.status}:`, e.raw || e.message);
        if (e.code === "daily_quota") {
          const resetAt = e.resetAt || quotaResetAt();
          if (!quotaOut) {
            console.warn(`[exam-converter] โควตารายวันของ Gemini หมด จะกลับมา ${resetAt.toISOString()} — พิจารณาเปิด billing ใน AI Studio`);
            try { onQuotaExhausted?.({ resetAt, userId }); } catch (hookErr) { console.error("[exam-converter] onQuotaExhausted", hookErr); }
          }
          quotaOut = { resetAt, recheckAt: Date.now() + QUOTA_RECHECK_MS };
        }
        throw toHttpError(e);
      }

      if (dailyLimit > 0) await usageStore.increment(userId, today());
      inFlight.delete(userId);
      reserved = false;
      onUsage?.({
        userId,
        model: out.model,
        questions: out.questions.length,
        tokens: out.usage?.totalTokenCount,
        ms: Date.now() - started,
      });
      res.json({ questions: out.questions, skipped: out.skipped, model: out.model, remaining: await remainingFor(userId) });
    } catch (e) {
      if (res.headersSent) return;
      if (e.name === "AbortError") return res.status(499).end();
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.message, ...e.extra });
      console.error("[exam-converter]", e);
      res.status(500).json({ error: "เกิดข้อผิดพลาดในระบบ ลองใหม่อีกครั้ง" });
    } finally {
      if (reserved) inFlight.delete(userId);
    }
  });

  // body ใหญ่เกิน limit / JSON เสีย
  router.use((err, req, res, next) => {
    if (err?.type === "entity.too.large") return res.status(413).json({ error: "ไฟล์ใหญ่เกินกว่าที่ระบบรับได้" });
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" });
    next(err);
  });

  return router;
}
