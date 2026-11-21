// ลากไฟล์ข้อสอบมาวางในหน้า "สร้างข้อสอบ" ของ ExamPro แล้ว AI ใส่ข้อสอบลงรายการให้ทันที ไม่ต้องผ่าน Excel
//
// ใส่ใน admin-questions.html (ท้าย <body> หลังสคริปต์เดิมของหน้า):
//   <script type="module">
//     import { mountExamDropzone } from "./cv-exam-dropzone.mjs";
//     mountExamDropzone({ mode: "server" });
//   </script>
//
// ข้อสอบจะอยู่ในหน้าจอเท่านั้น จนกว่าครูจะกด "บันทึกข้อสอบ" ของ ExamPro เอง (กดเลิกทำได้)

import { convertFiles } from "./cv-converter.mjs";
import { CONFIG } from "./cv-config.mjs";
import { ACCEPT, MAX_INLINE_BYTES } from "./cv-extract.mjs";
import { LETTERS } from "./cv-excel.mjs";
import { formatThaiTime } from "./cv-gemini-core.mjs";

const QUOTA_CODES = new Set(["daily_quota", "user_quota"]);
/** เที่ยงคืนถัดไปตามเวลาไทย (โควตารายคนของระบบนับตามวันไทย) */
const nextThaiMidnight = () => { const d = new Date(Date.now() + 7 * 3600e3); d.setUTCHours(24, 0, 0, 0); return new Date(d.getTime() - 7 * 3600e3); };
const timeLeft = (ms) => { const m = Math.max(1, Math.ceil(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} ชั่วโมง${m % 60 ? ` ${m % 60} นาที` : ""}` : `${m} นาที`; };

const DOC_TYPES = /pdf|word|officedocument|msword|text\/plain/;
const TF_TRUE = /^(ถูก|จริง|true|t|ใช่)(\s*\(.*\))?$/i;
const TF_FALSE = /^(ผิด|เท็จ|false|f|ไม่ใช่)(\s*\(.*\))?$/i;
const THAI = ["ก", "ข", "ค", "ง"];

/* ---------- ตัวเชื่อมกับหน้า ExamPro (ใช้ตัวแปร/ฟังก์ชันที่หน้านั้นมีอยู่แล้ว) ---------- */
export function examProAdapter() {
  /* global questions, activeQuestionIndex, renderAllQuestionsList, renderActiveQuestionStage, markAsDirty */
  const ready = () => typeof questions !== "undefined" && typeof renderAllQuestionsList === "function";
  const show = (i) => {
    if (typeof activeQuestionIndex !== "undefined") activeQuestionIndex = i; // eslint-disable-line no-global-assign
    renderAllQuestionsList();
    if (typeof renderActiveQuestionStage === "function") renderActiveQuestionStage();
  };
  return {
    ready,
    get() { return ready() ? questions : []; },
    set(list, activeIndex) {
      questions = list; // eslint-disable-line no-global-assign
      show(activeIndex);
      if (typeof markAsDirty === "function") markAsDirty();
    },
    /** เปิดข้อที่ i ในตัวแก้ไข */
    focus: show,
  };
}

/** แปลงแถวจาก AI เป็นข้อสอบ ExamPro + แยกข้อที่ใส่ไม่ได้/ต้องตรวจ */
export function planInsert(rows) {
  const add = [];
  const skipped = [];   // ใส่ไม่ได้ (ตัวเลือกเกิน 4 ที่ ExamPro รองรับ)
  const noAnswer = [];  // ใส่แล้ว แต่ต้องเลือกเฉลยเอง
  const aiAnswered = [];
  rows.forEach((r) => {
    const opts = r.options.filter((o, i) => o || i < 4);
    // ข้อถูก/ผิด
    if (opts.length === 2 && TF_TRUE.test(opts[0].trim()) && TF_FALSE.test(opts[1].trim())) {
      add.push({ question: r.question, question_img: "", choices: ["ถูก (จริง)", "ผิด (เท็จ)", "", ""], choices_img: ["", "", "", ""],
        answer: r.answer === "b" ? "b" : r.answer === "a" ? "a" : "", timeLimit: 20, type: "true_false" });
    } else if (opts.length > 4) {
      skipped.push(r);
      return;
    } else {
      add.push({ question: r.question, question_img: "", choices: [0, 1, 2, 3].map((j) => opts[j] || ""),
        choices_img: ["", "", "", ""], answer: LETTERS.slice(0, 4).includes(r.answer) ? r.answer : "", timeLimit: 20, type: "quiz" }); // ไม่มีเฉลย: ไม่ตั้ง ก. ให้เอง (บันทึกไม่ได้จนกว่าจะเลือก)
    }
    const n = add.length; // ลำดับในชุดที่ใส่
    if (!r.answer) noAnswer.push(n);
    else if (r.source === "ai") aiAnswered.push(n);
  });
  return { add, skipped, noAnswer, aiAnswered };
}

const isBlank = (q) => !q || (!String(q.question || "").trim() && !q.question_img && !(q.choices || []).some((c) => String(c || "").trim()));

/* ---------- ไอคอน ---------- */
const svg = (d, size = 20, w = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  spark: (s) => svg('<path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.4l-1.8-4.9L5 9.7l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>', s),
  upload: (s) => svg('<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M20 16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2"/>', s),
  x: (s) => svg('<path d="M18 6L6 18M6 6l12 12"/>', s),
  check: (s, w) => svg('<path d="M20 6L9 17l-5-5"/>', s, w),
  alert: (s) => svg('<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>', s),
  undo: (s) => svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>', s),
  trash: (s) => svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>', s),
  clock: (s) => svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', s),
  plus: (s) => svg('<path d="M12 5v14M5 12h14"/>', s, 2.5),
  arrow: (s) => svg('<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>', s),
};

/* ---------- สไตล์ (ใช้คำนำหน้า xdz- ไม่ชนกับ CSS ของหน้า) ---------- */
const CSS = `
.xdz-root,.xdz-root *{box-sizing:border-box}
.xdz-root{--x-pri:#1557e0;--x-pri2:#3b82f6;--x-acc:#ff7a1a;--x-acc2:#ff9a3c;--x-ok:#16a34a;--x-warn:#b45309;--x-err:#dc2626;
  --x-text:#334155;--x-head:#0f172a;--x-muted:#64748b;--x-line:#e2e8f0;--x-soft:#f1f5ff;
  font:14px/1.6 "Noto Sans Thai Looped","Noto Sans Thai",system-ui,sans-serif;color:var(--x-text)}
.xdz-root button{font:inherit}

/* ปุ่มลอย */
.xdz-fab{position:fixed;right:22px;bottom:22px;z-index:9998;display:flex;align-items:center;gap:8px;padding:13px 20px;border:0;border-radius:999px;
  font-weight:600!important;color:#fff;cursor:pointer;background:linear-gradient(135deg,var(--x-acc),var(--x-acc2));
  box-shadow:0 12px 28px -10px rgba(255,122,26,.8),0 0 0 0 rgba(255,122,26,.45);transition:transform .15s,box-shadow .15s;animation:xdz-pulse 2.6s ease-out 1s 2}
.xdz-fab:hover{transform:translateY(-2px);box-shadow:0 16px 32px -10px rgba(255,122,26,.9)}
.xdz-fab:focus-visible{outline:3px solid #fff;box-shadow:0 0 0 6px var(--x-acc)}
@keyframes xdz-pulse{0%{box-shadow:0 12px 28px -10px rgba(255,122,26,.8),0 0 0 0 rgba(255,122,26,.45)}100%{box-shadow:0 12px 28px -10px rgba(255,122,26,.8),0 0 0 18px rgba(255,122,26,0)}}

/* กรอบตอนลากไฟล์เข้าหน้า */
.xdz-overlay{position:fixed;inset:0;z-index:10001;display:none;place-items:center;padding:16px;
  background:radial-gradient(circle at 50% 40%,rgba(21,87,224,.72),rgba(13,40,120,.82));backdrop-filter:blur(4px)}
.xdz-overlay.on{display:grid;animation:xdz-fade .15s ease-out}
.xdz-drop{width:min(520px,100%);padding:48px 28px;border-radius:28px;text-align:center;color:#fff;
  border:2.5px dashed rgba(255,255,255,.85);background:rgba(255,255,255,.08);animation:xdz-breathe 1.6s ease-in-out infinite}
.xdz-drop .xdz-bubble{width:84px;height:84px;margin:0 auto 18px;border-radius:50%;display:grid;place-items:center;background:#fff;color:var(--x-pri);
  box-shadow:0 14px 30px -10px rgba(0,0,0,.45);animation:xdz-bob 1.6s ease-in-out infinite}
.xdz-drop b{display:block;font-size:22px;line-height:1.4}
.xdz-drop span{display:block;margin-top:6px;font-size:14px;opacity:.9}
@keyframes xdz-breathe{50%{transform:scale(1.02);border-color:#fff}}
@keyframes xdz-bob{50%{transform:translateY(-6px)}}

/* หน้าต่าง */
.xdz-backdrop{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:16px;background:rgba(15,23,42,.5);
  backdrop-filter:blur(3px);animation:xdz-fade .18s ease-out}
.xdz-dlg{position:relative;width:min(560px,100%);max-height:min(720px,calc(100vh - 32px));display:flex;flex-direction:column;background:#fff;
  border-radius:24px;box-shadow:0 30px 70px -20px rgba(15,23,42,.55);overflow:hidden;animation:xdz-pop .26s cubic-bezier(.2,.9,.3,1.2)}
.xdz-dlg::before{content:"";position:absolute;inset:0 0 auto;height:4px;background:linear-gradient(90deg,var(--x-pri),var(--x-pri2),var(--x-acc2),var(--x-acc))}
@keyframes xdz-fade{from{opacity:0}}
@keyframes xdz-pop{from{opacity:0;transform:translateY(14px) scale(.96)}}
.xdz-head{display:flex;align-items:center;gap:14px;padding:22px 22px 6px}
.xdz-logo{flex:none;width:44px;height:44px;border-radius:14px;display:grid;place-items:center;color:#fff;
  background:linear-gradient(135deg,var(--x-pri),var(--x-pri2));box-shadow:0 8px 18px -8px rgba(21,87,224,.8)}
.xdz-logo.ok{background:linear-gradient(135deg,#22c55e,#16a34a);box-shadow:0 8px 18px -8px rgba(22,163,74,.8);animation:xdz-pop .35s cubic-bezier(.2,.9,.3,1.4)}
.xdz-draw{display:grid} .xdz-draw path{stroke-dasharray:30;stroke-dashoffset:30;animation:xdz-draw .45s ease-out .15s forwards}
.xdz-head h3{margin:0;font-size:18px;line-height:1.35;color:var(--x-head)}
.xdz-head p{margin:2px 0 0;font-size:13px;color:var(--x-muted)}
.xdz-close{margin-left:auto;align-self:flex-start;flex:none;width:36px;height:36px;border-radius:12px;border:0;background:transparent;color:var(--x-muted);
  display:grid;place-items:center;cursor:pointer}
.xdz-close:hover{background:#f1f5f9;color:var(--x-head)} .xdz-root [hidden]{display:none!important}
.xdz-body{padding:14px 22px 6px;overflow:auto;display:grid;gap:14px}
.xdz-foot{display:flex;gap:10px;align-items:center;justify-content:flex-end;padding:16px 22px 20px;flex-wrap:wrap}
.xdz-foot .xdz-left{margin-right:auto}

.xdz-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:42px;padding:9px 18px;border-radius:12px;
  border:1.5px solid var(--x-line);background:#fff;color:var(--x-head);font-weight:600!important;cursor:pointer;transition:all .15s}
.xdz-btn:hover{border-color:#cbd5e1;background:#f8fafc}
.xdz-btn.pri{border:0;color:#fff;background:linear-gradient(135deg,var(--x-pri),var(--x-pri2));box-shadow:0 8px 18px -8px rgba(21,87,224,.75)}
.xdz-btn.pri:hover{filter:brightness(1.06);transform:translateY(-1px)}
.xdz-btn.ghost{border-color:transparent;color:var(--x-muted)} .xdz-btn.ghost:hover{color:var(--x-head);background:#f1f5f9}
.xdz-btn:disabled{opacity:.45;cursor:not-allowed;transform:none;filter:none;box-shadow:none}
.xdz-btn:focus-visible,.xdz-close:focus-visible,.xdz-zone:focus-visible,.xdz-q:focus-visible{outline:3px solid rgba(21,87,224,.35);outline-offset:2px}

/* พื้นที่วางไฟล์ในหน้าต่าง */
.xdz-zone{display:grid;justify-items:center;gap:6px;padding:28px 18px;border:2px dashed #c7d6f5;border-radius:18px;background:var(--x-soft);
  text-align:center;cursor:pointer;transition:all .15s}
.xdz-zone:hover,.xdz-zone.over{border-color:var(--x-pri);background:#e6eeff}
.xdz-zone.over{transform:scale(1.01)}
.xdz-zone .xdz-bubble{width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:#fff;color:var(--x-pri);
  box-shadow:0 8px 20px -10px rgba(21,87,224,.7);margin-bottom:4px}
.xdz-zone b{font-size:15px;color:var(--x-head)} .xdz-zone u{color:var(--x-pri);text-underline-offset:3px}
.xdz-types{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:4px}

.xdz-tag{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:99px;font-size:11.5px;font-weight:600;line-height:1.6;white-space:nowrap}
.xdz-t-pdf{background:#fee2e2;color:#b91c1c} .xdz-t-docx{background:#dbeafe;color:#1d4ed8} .xdz-t-img{background:#dcfce7;color:#15803d}
.xdz-t-txt{background:#f1f5f9;color:#475569} .xdz-t-ai{background:#fff1e6;color:#c2410c} .xdz-t-need{background:#fef3c7;color:#92400e}
.xdz-t-tf{background:#ede9fe;color:#6d28d9}

/* รายการไฟล์ */
.xdz-files{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.xdz-file{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--x-line);border-radius:14px;background:#fff;animation:xdz-pop .2s ease-out}
.xdz-file .xdz-name{flex:1;min-width:0}
.xdz-file .xdz-name b{display:block;font-weight:600;color:var(--x-head);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xdz-file .xdz-name small{color:var(--x-muted);font-size:12px}
.xdz-file .xdz-rm{flex:none;width:32px;height:32px;border:0;border-radius:10px;background:transparent;color:var(--x-muted);cursor:pointer;display:grid;place-items:center}
.xdz-file .xdz-rm:hover{background:#fee2e2;color:var(--x-err)}
.xdz-st{flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center}
.xdz-st.wait{border:2px solid var(--x-line)}
.xdz-st.run{border:2.5px solid #dbe6ff;border-top-color:var(--x-pri);animation:xdz-spin .8s linear infinite}
.xdz-st.ok{background:#dcfce7;color:var(--x-ok)} .xdz-st.err{background:#fee2e2;color:var(--x-err)}
.xdz-file.is-run{border-color:#bcd0fb;background:#f7faff}
@keyframes xdz-spin{to{transform:rotate(360deg)}}

/* สวิตช์ */
.xdz-switch{display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border:1px solid var(--x-line);border-radius:14px;cursor:pointer}
.xdz-switch input{position:absolute;opacity:0;pointer-events:none}
.xdz-switch i{flex:none;position:relative;width:40px;height:23px;margin-top:2px;border-radius:99px;background:#cbd5e1;transition:background .15s}
.xdz-switch i::after{content:"";position:absolute;top:3px;left:3px;width:17px;height:17px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .15s}
.xdz-switch input:checked+i{background:var(--x-pri)} .xdz-switch input:checked+i::after{transform:translateX(17px)}
.xdz-switch input:focus-visible+i{outline:3px solid rgba(21,87,224,.35);outline-offset:2px}
.xdz-switch b{display:block;font-weight:600;color:var(--x-head)} .xdz-switch small{color:var(--x-muted);font-size:12.5px}

.xdz-note{display:flex;gap:10px;align-items:flex-start;padding:10px 14px;border-radius:14px;font-size:13px;background:#f8fafc;color:var(--x-muted)}
.xdz-note.warn{background:#fffbeb;color:#92400e} .xdz-note.err{background:#fef2f2;color:#991b1b}
.xdz-note svg{flex:none;margin-top:2px}
.xdz-notes{display:grid;gap:8px}

/* กำลังแปลง */
.xdz-hero{display:grid;justify-items:center;text-align:center;gap:4px;padding:8px 0 2px}
.xdz-orb{position:relative;width:92px;height:92px;margin-bottom:10px;display:grid;place-items:center;color:var(--x-pri)}
.xdz-orb::before{content:"";position:absolute;inset:0;border-radius:50%;
  background:conic-gradient(from 0deg,var(--x-pri),var(--x-pri2),var(--x-acc2),var(--x-acc),var(--x-pri));animation:xdz-spin 1.4s linear infinite;
  -webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 6px),#000 calc(100% - 5px));mask:radial-gradient(farthest-side,transparent calc(100% - 6px),#000 calc(100% - 5px))}
.xdz-orb::after{content:"";position:absolute;inset:14px;border-radius:50%;background:var(--x-soft);animation:xdz-glow 1.6s ease-in-out infinite}
.xdz-orb svg{position:relative;z-index:1;animation:xdz-bob 1.6s ease-in-out infinite}
@keyframes xdz-glow{50%{background:#dfe9ff}}
.xdz-hero h4{margin:0;font-size:17px;color:var(--x-head)}
.xdz-hero p{margin:0;color:var(--x-muted);font-size:13px;min-height:21px}
.xdz-time{font-variant-numeric:tabular-nums}

/* ผลลัพธ์ */
.xdz-badge{width:76px;height:76px;margin-bottom:8px;border-radius:50%;display:grid;place-items:center;color:#fff;
  background:linear-gradient(135deg,#22c55e,#16a34a);box-shadow:0 14px 30px -12px rgba(22,163,74,.8);animation:xdz-pop .35s cubic-bezier(.2,.9,.3,1.4)}
.xdz-badge.err{background:linear-gradient(135deg,#f87171,#dc2626);box-shadow:0 14px 30px -12px rgba(220,38,38,.7)}
.xdz-badge.info{background:linear-gradient(135deg,#94a3b8,#64748b);box-shadow:0 14px 30px -12px rgba(71,85,105,.6)}
.xdz-badge.warn{background:linear-gradient(135deg,#fbbf24,#f59e0b);box-shadow:0 14px 30px -12px rgba(245,158,11,.7)}
.xdz-badge.warn path,.xdz-badge.warn circle{stroke-dasharray:none;animation:none}
.xdz-when{font-size:32px;font-weight:700;line-height:1.2;color:var(--x-head);font-variant-numeric:tabular-nums}
.xdz-badge path{stroke-dasharray:30;stroke-dashoffset:30;animation:xdz-draw .45s ease-out .2s forwards}
@keyframes xdz-draw{to{stroke-dashoffset:0}}
.xdz-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}
.xdz-stat{padding:10px 12px;border-radius:14px;background:#f8fafc;border:1px solid var(--x-line)}
.xdz-stat b{display:block;font-size:22px;line-height:1.2;color:var(--x-head);font-variant-numeric:tabular-nums}
.xdz-stat small{font-size:12px;color:var(--x-muted)}
.xdz-stat.ok{background:#f0fdf4;border-color:#bbf7d0} .xdz-stat.ok b{color:var(--x-ok)}
.xdz-stat.warn{background:#fffbeb;border-color:#fde68a} .xdz-stat.warn b{color:var(--x-warn)}
/* ตรวจก่อนเพิ่ม */
.xdz-dlg.wide{width:min(780px,100%);max-height:min(860px,calc(100vh - 32px))}
.xdz-tabs{position:sticky;top:-14px;z-index:2;display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:-14px -22px 0;padding:12px 22px 10px;background:rgba(255,255,255,.94);backdrop-filter:blur(6px);border-bottom:1px solid #f1f5f9}
.xdz-tab{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:99px;border:1.5px solid var(--x-line);background:#fff;color:var(--x-muted);font-weight:600!important;cursor:pointer}
.xdz-tab b{min-width:22px;padding:0 6px;border-radius:99px;background:#f1f5f9;color:var(--x-head);font-size:12px;text-align:center}
.xdz-tab.on{border-color:var(--x-pri);background:var(--x-soft);color:var(--x-pri)} .xdz-tab.on b{background:var(--x-pri);color:#fff}
.xdz-tab.warn.on{border-color:#f59e0b;background:#fffbeb;color:#92400e} .xdz-tab.warn.on b{background:#f59e0b}
.xdz-tabnote{margin-left:auto;font-size:12.5px;color:var(--x-muted)}
.xdz-cards{display:grid;gap:10px;margin:0;padding:0;list-style:none}
.xdz-card{padding:14px;border:1px solid var(--x-line);border-radius:16px;background:#fff}
.xdz-card.flag{border-color:#fde68a;background:#fffdf6}
.xdz-card-h{display:flex;gap:10px;align-items:flex-start}
.xdz-no{flex:none;min-width:32px;height:26px;padding:0 6px;border-radius:9px;background:var(--x-soft);color:var(--x-pri);font-weight:700;font-size:12.5px;display:grid;place-items:center}
.xdz-qt{flex:1;min-width:0}
.xdz-qx{color:var(--x-head);font-weight:600;white-space:pre-wrap;overflow-wrap:anywhere}
.xdz-meta{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}
.xdz-del{flex:none;width:34px;height:34px;margin:-4px -4px 0 0;border:0;border-radius:10px;background:transparent;color:#94a3b8;cursor:pointer;display:grid;place-items:center}
.xdz-del:hover{background:#fee2e2;color:var(--x-err)}
.xdz-chs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:12px 0 0 42px}
.xdz-ch{display:flex;gap:9px;align-items:flex-start;width:100%;padding:8px 10px;border:1.5px solid var(--x-line);border-radius:12px;background:#fff;color:var(--x-text);text-align:left;cursor:pointer;transition:border-color .12s,background .12s}
.xdz-ch:hover{border-color:#86efac;background:#f7fef9}
.xdz-ch span:last-child{overflow-wrap:anywhere}
.xdz-k{flex:none;width:24px;height:24px;border-radius:8px;background:#f1f5f9;color:var(--x-muted);display:grid;place-items:center;font-weight:700;font-size:12.5px}
.xdz-ch.ok{border-color:#22c55e;background:#f0fdf4;color:#14532d;font-weight:600}
.xdz-ch.ok .xdz-k{background:#22c55e;color:#fff}
.xdz-ch.empty{color:#94a3b8;cursor:default;border-style:dashed}
.xdz-ch:focus-visible,.xdz-del:focus-visible,.xdz-tab:focus-visible{outline:3px solid rgba(21,87,224,.35);outline-offset:2px}
.xdz-gone{display:flex;gap:10px;justify-content:space-between;align-items:center;padding:8px 8px 8px 14px;border:1.5px dashed var(--x-line);border-radius:14px;color:var(--x-muted);font-size:13px}
.xdz-btn.xdz-sm{min-height:32px;padding:4px 10px;font-size:13px}

@media (max-width:600px){
  .xdz-fab{right:14px;bottom:14px}
  .xdz-backdrop{place-items:end stretch;padding:0}
  .xdz-dlg{width:100%;max-height:92vh;border-radius:24px 24px 0 0;animation:xdz-sheet .28s cubic-bezier(.2,.9,.3,1)}
  .xdz-head{padding:20px 16px 4px} .xdz-body{padding:12px 16px 4px} .xdz-foot{padding:14px 16px calc(16px + env(safe-area-inset-bottom))}
  .xdz-foot .xdz-btn{flex:1} .xdz-foot .xdz-left{flex-basis:100%;order:3}
  .xdz-dlg.wide{max-height:94vh} .xdz-tabs{margin:-12px -16px 0;padding:10px 16px} .xdz-chs{grid-template-columns:1fr;margin-left:0}
}
@keyframes xdz-sheet{from{transform:translateY(100%)}}
@media (prefers-reduced-motion:reduce){.xdz-root *,.xdz-root *::before,.xdz-root *::after{animation:none!important;transition:none!important}}
`;

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const extOf = (name) => (String(name).split(".").pop() || "").toLowerCase();
const KIND = { pdf: ["pdf", "PDF"], docx: ["docx", "Word"], txt: ["txt", "ข้อความ"], png: ["img", "รูปภาพ"], jpg: ["img", "รูปภาพ"], jpeg: ["img", "รูปภาพ"], webp: ["img", "รูปภาพ"] };
const ACCEPTED = new Set(ACCEPT.split(",").map((s) => s.slice(1)));
const fmtSize = (b) => (b >= 1048576 ? `${+(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const kindTag = (name) => { const [k, label] = KIND[extOf(name)] || ["txt", extOf(name).toUpperCase() || "ไฟล์"]; return `<span class="xdz-tag xdz-t-${k}">${esc(label)}</span>`; };
const fileKey = (f) => `${f.name}|${f.size}|${f.lastModified}`;

/**
 * @param {object} [opts]
 * @param {"server"|"direct"} [opts.mode="server"]
 * @param {string} [opts.serverBase]      ค่าเริ่มต้นตาม js/config.js ("/api/ai")
 * @param {string|(()=>string)} [opts.apiKey]  โหมด direct เท่านั้น
 * @param {string} [opts.model]
 * @param {boolean} [opts.solveMissing=true]   ค่าเริ่มต้นของสวิตช์ "ให้ AI หาคำตอบ"
 * @param {object} [opts.adapter]         { get(), set(list, activeIndex), ready(), focus?(i) } ค่าเริ่มต้น examProAdapter()
 * @param {boolean} [opts.fab=true]       แสดงปุ่มลอย "แปลงข้อสอบด้วย AI"
 */
export function mountExamDropzone(opts = {}) {
  const { mode = "server", serverBase, apiKey, model, adapter = examProAdapter(), fab = true } = opts;
  let solveMissing = opts.solveMissing ?? true;
  if (serverBase) CONFIG.serverBase = serverBase;

  if (!document.getElementById("xdz-style")) {
    document.head.appendChild(Object.assign(document.createElement("style"), { id: "xdz-style", textContent: CSS }));
  }
  const root = el(`<div class="xdz-root"></div>`);
  const input = Object.assign(document.createElement("input"), { type: "file", multiple: true, accept: ACCEPT, hidden: true });
  const overlay = el(`<div class="xdz-overlay" aria-hidden="true"><div class="xdz-drop">
    <div class="xdz-bubble">${I.upload(38)}</div><b>ปล่อยไฟล์เพื่อเพิ่มข้อสอบ</b><span>AI จะอ่านแล้วใส่ต่อท้ายรายการให้ทันที</span></div></div>`);
  const fabBtn = fab ? el(`<button type="button" class="xdz-fab" title="ลากไฟล์ข้อสอบมาวางที่ไหนก็ได้ในหน้านี้ หรือคลิกเพื่อเลือกไฟล์">${I.spark(18)} แปลงข้อสอบด้วย AI</button>`) : null;
  root.append(input, overlay, ...(fabBtn ? [fabBtn] : []));
  document.body.appendChild(root);

  /* ---------- สถานะ ---------- */
  let dlg = null;           // { backdrop, box, body, foot, title, sub }
  let view = "closed";      // closed | pick | run | done | error | undone
  let files = [];           // ไฟล์ที่เลือกไว้
  let rejected = [];        // ข้อความไฟล์ที่ใช้ไม่ได้
  let busy = null;          // AbortController ระหว่างแปลง
  let undoSnapshot = null;
  let lastFocus = null;
  let tick = null;
  let quotaUntil = null;    // { until: ms, code } เมื่อรู้ว่าโควตาหมด จะไม่ส่งไฟล์ไปเสียเวลาอีก

  const quotaActive = () => {
    if (quotaUntil && Date.now() >= quotaUntil.until) quotaUntil = null;
    return !!quotaUntil;
  };
  const quotaWhen = () => (quotaUntil?.code === "user_quota" ? "พรุ่งนี้" : formatThaiTime(new Date(quotaUntil.until)));

  /** หน้าต่าง "โควตาหมด" บอกเวลาที่ใช้ได้อีกครั้ง (ไม่มีปุ่มลองใหม่ เพราะลองตอนนี้ก็ไม่ได้) */
  function showQuota() {
    const daily = quotaUntil.code === "daily_quota";
    const help = !daily
      ? "แต่ละคนแปลงไฟล์ได้วันละจำนวนจำกัด โควตาจะเริ่มใหม่หลังเที่ยงคืน"
      : mode === "direct"
        ? "โควตาฟรีของ API Key นี้ใช้ครบแล้ว ถ้าต้องการใช้ต่อทันที ให้เปิด billing ใน Google AI Studio"
        : "โควตา AI ของระบบใช้ร่วมกันทุกคน หากต้องใช้งานด่วนกรุณาแจ้งผู้ดูแลระบบ";
    setView("quota", {
      title: daily ? "โควตา AI ของวันนี้หมดแล้ว" : "ใช้ครบโควตาของวันนี้แล้ว",
      sub: "ยังไม่มีการเปลี่ยนแปลงในรายการข้อสอบ",
      body: `<div class="xdz-hero"><div class="xdz-badge warn">${I.clock(36)}</div>
          <p>ใช้ได้อีกครั้ง</p><div class="xdz-when">${esc(quotaWhen())}</div>
          ${daily ? `<p>อีกประมาณ ${timeLeft(quotaUntil.until - Date.now())}</p>` : ""}</div>
        <div class="xdz-note">${I.alert(16)}<span>${esc(help)}</span></div>`,
      foot: `<button type="button" class="xdz-btn pri" data-x="close">เข้าใจแล้ว</button>`,
    });
    on('[data-x="close"]', () => closeDialog());
  }

  /* ---------- หน้าต่าง ---------- */
  function openDialog() {
    if (dlg) return;
    lastFocus = document.activeElement;
    const backdrop = el(`<div class="xdz-backdrop"><div class="xdz-dlg" role="dialog" aria-modal="true" aria-labelledby="xdz-title" aria-describedby="xdz-sub">
      <div class="xdz-head"><div class="xdz-logo">${I.spark(24)}</div>
        <div><h3 id="xdz-title"></h3><p id="xdz-sub"></p></div>
        <button type="button" class="xdz-close" aria-label="ปิดหน้าต่าง">${I.x(20)}</button></div>
      <div class="xdz-body" aria-live="polite"></div><div class="xdz-foot"></div></div></div>`);
    const box = backdrop.firstElementChild;
    dlg = { backdrop, box, body: box.querySelector(".xdz-body"), foot: box.querySelector(".xdz-foot"),
      title: box.querySelector("#xdz-title"), sub: box.querySelector("#xdz-sub"), closeBtn: box.querySelector(".xdz-close") };
    dlg.closeBtn.onclick = () => requestClose();
    backdrop.addEventListener("mousedown", (e) => { if (e.target === backdrop) requestClose(true); });
    backdrop.addEventListener("keydown", onKey);
    root.appendChild(backdrop);
    document.documentElement.style.overflow = "hidden";
  }

  function closeDialog() {
    clearInterval(tick);
    dlg?.backdrop.remove();
    dlg = null;
    view = "closed";
    files = []; rejected = [];
    document.documentElement.style.overflow = "";
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus?.();
  }

  /** ปิดเมื่อไม่มีงานค้าง: ระหว่างแปลงต้องกดยกเลิกก่อน, ถ้าเลือกไฟล์ค้างไว้คลิกพื้นหลังจะไม่ปิด */
  function requestClose(fromBackdrop) {
    if (view === "run") return;
    if (fromBackdrop && view === "pick" && files.length) return;
    if (view === "review" && (fromBackdrop || !confirmDiscard())) return;
    closeDialog();
  }

  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); if (view === "run") busy?.abort(); else requestClose(); return; }
    if (e.key !== "Tab" || !dlg) return;
    const f = [...dlg.box.querySelectorAll('button:not([disabled]),[tabindex="0"],input:not([type=file])')].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function setView(name, { title, sub, body, foot, focus, logo, wide }) {
    openDialog();
    view = name;
    dlg.box.classList.toggle("wide", !!wide);
    dlg.body.scrollTop = 0;
    const logoEl = dlg.box.querySelector(".xdz-logo");
    logoEl.className = `xdz-logo${logo ? ` ${logo}` : ""}`;
    logoEl.innerHTML = logo === "ok" ? `<span class="xdz-draw">${I.check(24, 3)}</span>` : I.spark(24);
    dlg.title.textContent = title;
    dlg.sub.textContent = sub || "";
    dlg.body.innerHTML = body;
    dlg.foot.innerHTML = foot;
    dlg.closeBtn.hidden = name === "run";
    const target = focus && dlg.box.querySelector(focus);
    (target || dlg.box.querySelector(".xdz-btn.pri") || dlg.closeBtn).focus({ preventScroll: true });
  }
  const on = (sel, fn) => { const n = dlg?.box.querySelector(sel); if (n) n.onclick = fn; return n; };

  /* ---------- 1) เลือกไฟล์ ---------- */
  function addFiles(list) {
    for (const f of list) {
      const e = extOf(f.name);
      if (e === "doc") rejected.push(`“${f.name}” เป็น Word รุ่นเก่า (.doc) กรุณาบันทึกเป็น .docx ก่อน`);
      else if (!ACCEPTED.has(e)) rejected.push(`“${f.name}” ไม่รองรับ ใช้ได้เฉพาะ PDF, Word (.docx), รูปภาพ หรือ .txt`);
      else if (f.size > MAX_INLINE_BYTES) rejected.push(`“${f.name}” ใหญ่เกิน ${fmtSize(MAX_INLINE_BYTES)} ลองแบ่งเป็นหลายไฟล์`);
      else if (!files.some((x) => fileKey(x) === fileKey(f))) files.push(f);
    }
  }

  function showPick(newFiles) {
    if (newFiles) addFiles(newFiles);
    const count = adapter.ready() ? adapter.get().filter((q) => !isBlank(q)).length : 0;
    const list = files.map((f, i) => `<li class="xdz-file">${kindTag(f.name)}
      <div class="xdz-name"><b title="${esc(f.name)}">${esc(f.name)}</b><small>${fmtSize(f.size)}</small></div>
      <button type="button" class="xdz-rm" data-rm="${i}" aria-label="เอา ${esc(f.name)} ออก">${I.x(16)}</button></li>`).join("");
    setView("pick", {
      title: "เพิ่มข้อสอบด้วย AI",
      sub: "ให้ AI อ่านไฟล์ข้อสอบแล้วใส่ลงรายการให้ ไม่ต้องพิมพ์เอง",
      body: `
        <div class="xdz-zone" tabindex="0" role="button" aria-label="เลือกไฟล์ข้อสอบ">
          <div class="xdz-bubble">${I.upload(26)}</div>
          <b>ลากไฟล์มาวางที่นี่ หรือ <u>เลือกไฟล์</u></b>
          <small style="color:var(--x-muted)">เลือกได้หลายไฟล์ · ไม่เกิน ${fmtSize(MAX_INLINE_BYTES)} ต่อไฟล์</small>
          <div class="xdz-types"><span class="xdz-tag xdz-t-pdf">PDF</span><span class="xdz-tag xdz-t-docx">Word .docx</span><span class="xdz-tag xdz-t-img">รูปถ่าย</span><span class="xdz-tag xdz-t-txt">.txt</span></div>
        </div>
        ${quotaActive() ? `<div class="xdz-note warn">${I.clock(16)}<span>โควตา AI ของวันนี้หมดแล้ว เลือกไฟล์รอไว้ได้ แปลงได้อีกครั้ง ${esc(quotaWhen())}</span></div>` : ""}
        ${rejected.length ? `<div class="xdz-notes">${rejected.map((r) => `<div class="xdz-note warn">${I.alert(16)}<span>${esc(r)}</span></div>`).join("")}</div>` : ""}
        ${files.length ? `<ul class="xdz-files">${list}</ul>` : ""}
        <label class="xdz-switch"><input type="checkbox" data-x="solve" ${solveMissing ? "checked" : ""}><i></i>
          <span><b>ให้ AI หาคำตอบข้อที่ไม่มีเฉลย</b><small>ข้อที่ AI ตอบเองจะติดป้ายไว้ให้ตรวจทาน</small></span></label>
        <div class="xdz-note">${I.check(16, 2.5)}<span>ข้อสอบจะต่อท้ายรายการเดิม${count ? ` (ตอนนี้มี ${count} ข้อ)` : ""} และยังไม่บันทึกเข้าระบบจนกว่าจะกด “บันทึกข้อสอบ”</span></div>`,
      foot: `<button type="button" class="xdz-btn ghost" data-x="cancel">ยกเลิก</button>
        <button type="button" class="xdz-btn pri" data-x="go" ${files.length && !quotaActive() ? "" : "disabled"}>${I.spark(17)} ${files.length > 1 ? `แปลง ${files.length} ไฟล์` : "เริ่มแปลง"}</button>`,
      focus: files.length ? ".xdz-btn.pri" : ".xdz-zone",
    });
    rejected = [];
    const zone = dlg.box.querySelector(".xdz-zone");
    zone.onclick = () => input.click();
    zone.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } };
    dlg.box.querySelectorAll("[data-rm]").forEach((b) => { b.onclick = () => { files.splice(+b.dataset.rm, 1); showPick(); }; });
    dlg.box.querySelector('[data-x="solve"]').onchange = (e) => { solveMissing = e.target.checked; };
    on('[data-x="cancel"]', () => closeDialog());
    on('[data-x="go"]', () => run(files));
  }

  /* ---------- 2) กำลังแปลง ---------- */
  async function run(list) {
    const todo = [...list];
    if (!todo.length || busy) return;
    if (quotaActive()) return showQuota();
    if (!adapter.ready()) return showError("ยังเปิดหน้าสร้างข้อสอบไม่เสร็จ", "กรุณาเลือกรายวิชาก่อน แล้วลองอีกครั้ง", null);
    busy = new AbortController();
    if (fabBtn) fabBtn.disabled = true;
    const started = Date.now();
    const status = todo.map(() => ({ s: "wait", info: "รอคิว" }));
    let note = "";

    setView("run", {
      title: "กำลังแปลงข้อสอบ",
      sub: "ปิดหน้าต่างนี้ไม่ได้ระหว่างแปลง กดยกเลิกได้ทุกเมื่อ",
      body: `<div class="xdz-hero"><div class="xdz-orb">${I.spark(34)}</div>
          <h4>AI กำลังอ่านข้อสอบ…</h4><p data-x="note"></p></div>
        <ul class="xdz-files" data-x="list"></ul>`,
      foot: `<button type="button" class="xdz-btn" data-x="abort">${I.x(16)} ยกเลิก</button>`,
      focus: '[data-x="abort"]',
    });
    on('[data-x="abort"]', () => busy?.abort());
    const listEl = dlg.box.querySelector('[data-x="list"]');
    const noteEl = dlg.box.querySelector('[data-x="note"]');
    const paintList = () => {
      listEl.innerHTML = todo.map((f, i) => {
        const st = status[i];
        const icon = st.s === "ok" ? I.check(14, 3) : st.s === "err" ? I.x(14) : "";
        return `<li class="xdz-file ${st.s === "run" ? "is-run" : ""}"><span class="xdz-st ${st.s}">${icon}</span>
          <div class="xdz-name"><b title="${esc(f.name)}">${esc(f.name)}</b><small>${esc(st.info)}</small></div>${kindTag(f.name)}</li>`;
      }).join("");
    };
    const paintNote = () => {
      const sec = Math.round((Date.now() - started) / 1000);
      noteEl.innerHTML = `<span class="xdz-time">${sec} วินาที</span>${note ? ` · ${esc(note)}` : sec > 20 ? " · ไฟล์ใหญ่อาจใช้เวลาสักครู่" : ""}`;
    };
    paintList(); paintNote();
    clearInterval(tick);
    tick = setInterval(paintNote, 1000);

    try {
      const res = await convertFiles(todo, {
        mode,
        apiKey: typeof apiKey === "function" ? apiKey() : apiKey,
        model,
        solveMissing,
        signal: busy.signal,
        onFile: (i, s, info) => {
          if (s === "run") { status[i] = { s, info: "AI กำลังอ่าน…" }; note = ""; }
          if (s === "ok") status[i] = { s, info: `พบ ${info?.count ?? 0} ข้อ` };
          if (s === "err") status[i] = { s, info: info?.message || "แปลงไม่สำเร็จ" };
          paintList();
        },
        onRetry: (i, info) => { note = info.type === "switch" ? (info.code === "daily_quota" ? "โควตา AI ตัวหลักวันนี้หมด สลับไปตัวสำรอง" : "AI ตัวหลักช้า สลับไปตัวสำรอง") : `AI ไม่ว่าง กำลังลองใหม่ครั้งที่ ${info.attempt}`; paintNote(); },
      });
      clearInterval(tick);
      if (busy.signal.aborted) { busy = null; showPick(todo); return; }
      insert(res, todo);
    } catch (e) {
      clearInterval(tick);
      if (e?.name === "AbortError" || busy?.signal.aborted) { busy = null; showPick(todo); return; }
      showError("แปลงไม่สำเร็จ", e?.message || String(e), todo);
    } finally {
      busy = null;
      if (fabBtn) fabBtn.disabled = false;
    }
  }

  function showError(title, message, retryFiles) {
    setView("error", {
      title,
      sub: "ยังไม่มีการเปลี่ยนแปลงในรายการข้อสอบ",
      body: `<div class="xdz-hero"><div class="xdz-badge err">${I.alert(36)}</div></div>
        <div class="xdz-note err">${I.alert(16)}<span>${esc(message)}</span></div>`,
      foot: `<button type="button" class="xdz-btn ghost" data-x="close">ปิด</button>
        ${retryFiles ? `<button type="button" class="xdz-btn pri" data-x="retry">ลองอีกครั้ง</button>` : ""}`,
    });
    on('[data-x="close"]', () => closeDialog());
    on('[data-x="retry"]', () => run(retryFiles));
  }

  /* ---------- 3) ตรวจก่อนเพิ่ม: ดูทุกข้อ ลบข้อ เปลี่ยนเฉลย แล้วค่อยกด "เพิ่มลงข้อสอบ" ---------- */
  function insert({ rows, errors, skipped: nonMcq, duplicates, remaining, stopped }, todo) {
    const quota = stopped && QUOTA_CODES.has(stopped.code) ? stopped : null;
    if (quota) quotaUntil = { until: (quota.resetAt || nextThaiMidnight()).getTime(), code: quota.code };
    const plan = planInsert(rows);
    // โควตาหมดตั้งแต่ไฟล์แรก: ไม่มีอะไรให้ตรวจ แสดงหน้าต่างบอกเวลาที่ใช้ได้อีกครั้ง
    if (quota && !plan.add.length) return showQuota();
    const notes = [];
    const n = plan.add.length;
    const startNo = (() => {
      const before = adapter.get();
      return before.length === 1 && isBlank(before[0]) ? 1 : before.length + 1;
    })();

    if (plan.skipped.length) notes.push(["warn", `ข้าม ${plan.skipped.length} ข้อที่มีตัวเลือกเกิน 4 ข้อ (หน้านี้รองรับ ก–ง) เช่น “${plan.skipped[0].question.slice(0, 50)}”`]);
    errors.forEach((e) => notes.push(["err", `${e.file}: ${e.message}`]));
    if (stopped?.notRun) notes.push(["warn", `ยังไม่ได้แปลงอีก ${stopped.notRun} ไฟล์${quota ? ` ลากมาใหม่ได้${quotaWhen()}` : ""}`]);
    const info = [
      nonMcq && `ข้ามข้อที่ไม่ใช่ปรนัย ${nonMcq} ข้อ`,
      duplicates && `ตัดข้อซ้ำ ${duplicates} ข้อ`,
      remaining != null && `วันนี้ใช้ AI ได้อีก ${remaining} ไฟล์`,
    ].filter(Boolean);
    if (info.length) notes.push(["", info.join(" · ")]);
    const notesHtml = notes.length ? `<div class="xdz-notes">${notes.map(([cls, t]) =>
      `<div class="xdz-note ${cls}">${cls ? I.alert(16) : I.check(16, 2.5)}<span>${esc(t)}</span></div>`).join("")}</div>` : "";

    if (!n) {
      const empty = !errors.length && !plan.skipped.length;
      setView("error", {
        title: empty ? "ไม่พบข้อสอบปรนัยในไฟล์" : "ไม่ได้เพิ่มข้อสอบ",
        sub: "ยังไม่มีการเปลี่ยนแปลงในรายการข้อสอบ",
        body: `<div class="xdz-hero"><div class="xdz-badge ${empty ? "info" : "err"}">${I.alert(36)}</div></div>${notesHtml}`,
        foot: `<button type="button" class="xdz-btn ghost" data-x="close">ปิด</button>
          <button type="button" class="xdz-btn pri" data-x="again">เลือกไฟล์อื่น</button>`,
      });
      on('[data-x="close"]', () => closeDialog());
      on('[data-x="again"]', () => { files = []; showPick(); });
      return;
    }

    // ยังไม่แตะรายการข้อสอบของหน้า จนกว่าครูจะกด "เพิ่มลงข้อสอบ"
    const ai = new Set(plan.aiAnswered), need = new Set(plan.noAnswer);
    const items = plan.add.map((q, k) => ({ q, flag: need.has(k + 1) ? "need" : ai.has(k + 1) ? "ai" : null, gone: false }));
    let filter = "all";
    const live = () => items.filter((it) => !it.gone);

    const cardHtml = (it, i, no) => {
      const q = it.q;
      if (it.gone) {
        return `<li class="xdz-gone"><span>ลบ “${esc(q.question.slice(0, 60))}${q.question.length > 60 ? "…" : ""}” แล้ว</span>
          <button type="button" class="xdz-btn ghost xdz-sm" data-restore="${i}">${I.undo(14)} เอากลับ</button></li>`;
      }
      const tf = q.type === "true_false";
      const chs = (tf ? [0, 1] : [0, 1, 2, 3]).map((j) => {
        const L = "abcd"[j];
        const text = q.choices[j];
        const ok = q.answer === L && it.flag !== "need";
        if (!tf && !String(text || "").trim()) return `<div class="xdz-ch empty"><span class="xdz-k">${THAI[j]}</span><span>(ว่าง)</span></div>`;
        return `<button type="button" class="xdz-ch${ok ? " ok" : ""}" data-ans="${i}:${L}" aria-pressed="${ok}" title="คลิกเพื่อตั้งเป็นคำตอบที่ถูก">
          <span class="xdz-k">${ok ? I.check(13, 3.2) : THAI[j]}</span><span>${esc(text)}</span></button>`;
      }).join("");
      const tags = [
        tf && `<span class="xdz-tag xdz-t-tf">ถูก/ผิด</span>`,
        it.flag === "ai" && `<span class="xdz-tag xdz-t-ai">${I.spark(11)} AI หาคำตอบเอง · ควรตรวจ</span>`,
        it.flag === "need" && `<span class="xdz-tag xdz-t-need">ไม่มีเฉลยในไฟล์ · คลิกตัวเลือกที่ถูก</span>`,
      ].filter(Boolean).join("");
      return `<li class="xdz-card${it.flag ? " flag" : ""}">
        <div class="xdz-card-h"><span class="xdz-no">${no}</span>
          <div class="xdz-qt"><div class="xdz-qx">${esc(q.question)}</div>${tags ? `<div class="xdz-meta">${tags}</div>` : ""}</div>
          <button type="button" class="xdz-del" data-del="${i}" aria-label="ลบข้อ ${no}" title="ลบข้อนี้">${I.trash(17)}</button></div>
        <div class="xdz-chs${tf ? " tf" : ""}">${chs}</div></li>`;
    };

    setView("review", {
      wide: true,
      title: "ตรวจข้อสอบก่อนเพิ่ม",
      sub: "ข้อที่เป็นสีเขียวคือคำตอบที่ถูก · คลิกตัวเลือกเพื่อเปลี่ยนเฉลย · กดถังขยะเพื่อลบข้อ",
      body: `<div class="xdz-tabs" role="tablist" data-x="tabs"></div>${notesHtml}<ul class="xdz-cards" data-x="cards"></ul>`,
      foot: `<button type="button" class="xdz-btn ghost xdz-left" data-x="discard">ทิ้งทั้งหมด</button>
        <button type="button" class="xdz-btn pri" data-x="add"></button>`,
      focus: '[data-x="add"]',
    });
    const cardsEl = dlg.box.querySelector('[data-x="cards"]');
    const tabsEl = dlg.box.querySelector('[data-x="tabs"]');
    const addBtn = dlg.box.querySelector('[data-x="add"]');

    const paint = (focusSel) => {
      const keep = dlg.body.scrollTop;
      const flagged = items.filter((it) => !it.gone && it.flag).length;
      if (filter === "check" && !flagged) filter = "all";
      tabsEl.innerHTML = `<button type="button" role="tab" class="xdz-tab${filter === "all" ? " on" : ""}" aria-selected="${filter === "all"}" data-f="all">ทั้งหมด <b>${live().length}</b></button>
        ${flagged ? `<button type="button" role="tab" class="xdz-tab warn${filter === "check" ? " on" : ""}" aria-selected="${filter === "check"}" data-f="check">ควรตรวจ <b>${flagged}</b></button>` : ""}
        ${items.length - live().length ? `<span class="xdz-tabnote">ลบแล้ว ${items.length - live().length} ข้อ</span>` : ""}`;
      let no = startNo - 1;
      cardsEl.innerHTML = items.map((it, i) => {
        if (!it.gone) no++;
        if (filter === "check" && (!it.flag || it.gone)) return "";
        return cardHtml(it, i, no);
      }).join("") || `<li class="xdz-note">ไม่มีข้อสอบเหลือ กด “ทิ้งทั้งหมด” หรือกดเอากลับ</li>`;
      const n = live().length;
      addBtn.disabled = !n;
      addBtn.innerHTML = `${I.plus(17)} เพิ่มลงข้อสอบ ${n} ข้อ`;
      dlg.body.scrollTop = keep;
      if (focusSel) dlg.box.querySelector(focusSel)?.focus({ preventScroll: true });
    };
    paint();

    tabsEl.onclick = (e) => { const b = e.target.closest("[data-f]"); if (b) { filter = b.dataset.f; dlg.body.scrollTop = 0; paint(`[data-f="${filter}"]`); } };
    cardsEl.onclick = (e) => {
      const b = e.target.closest("[data-ans],[data-del],[data-restore]");
      if (!b) return;
      if (b.dataset.ans) {
        const [i, L] = b.dataset.ans.split(":");
        items[i].q.answer = L;
        items[i].flag = null; // ครูยืนยันเฉลยเองแล้ว
        paint(`[data-ans="${i}:${L}"]`);
      } else if (b.dataset.del) {
        items[b.dataset.del].gone = true;
        paint(`[data-restore="${b.dataset.del}"]`);
      } else {
        items[b.dataset.restore].gone = false;
        paint(`[data-del="${b.dataset.restore}"]`);
      }
    };
    on('[data-x="discard"]', () => { if (confirmDiscard()) closeDialog(); });
    on('[data-x="add"]', () => commit(live(), todo));
  }

  /** ถามก่อนทิ้งข้อสอบที่แปลงแล้วแต่ยังไม่ได้เพิ่ม */
  const confirmDiscard = () => window.confirm("ทิ้งข้อสอบที่ AI แปลงไว้ทั้งหมด? (ยังไม่ได้เพิ่มลงข้อสอบ)");

  /* ---------- 4) เพิ่มลงข้อสอบจริง ---------- */
  function commit(chosen, todo) {
    const before = adapter.get();
    undoSnapshot = JSON.parse(JSON.stringify(before));
    const base = before.length === 1 && isBlank(before[0]) ? [] : before;
    const add = chosen.map((it) => it.q);
    const n = add.length;
    const startNo = base.length + 1;
    adapter.set(base.concat(add), base.length);
    const pending = chosen.map((it, k) => (it.flag === "need" ? startNo + k : 0)).filter(Boolean);
    const aiLeft = chosen.filter((it) => it.flag === "ai").length;

    setView("done", {
      title: `เพิ่มลงข้อสอบแล้ว ${n} ข้อ`,
      sub: `ข้อ ${startNo}–${startNo + n - 1} อยู่ในรายการข้อสอบแล้ว`,
      logo: "ok",
      body: `${pending.length ? `<div class="xdz-note warn">${I.alert(16)}<span>ข้อ ${pending.join(", ")} ยังไม่มีเฉลย (ป้ายสีส้มในรายการข้อ) กรุณาเลือกเฉลยก่อนกดบันทึก</span></div>` : ""}
        ${aiLeft ? `<div class="xdz-note warn">${I.alert(16)}<span>มี ${aiLeft} ข้อที่ AI หาคำตอบเองและยังไม่ได้ตรวจ</span></div>` : ""}
        <div class="xdz-note">${I.check(16, 2.5)}<span>ยังไม่ได้บันทึกเข้าระบบ ตรวจเรียบร้อยแล้วกด “บันทึกข้อสอบ” ของหน้านี้</span></div>`,
      foot: `<button type="button" class="xdz-btn ghost xdz-left" data-x="undo">${I.undo(16)} เลิกทำ</button>
        <button type="button" class="xdz-btn" data-x="more">เพิ่มไฟล์อื่น</button>
        <button type="button" class="xdz-btn pri" data-x="ok">ไปที่ข้อสอบ ${I.arrow(16)}</button>`,
    });
    on('[data-x="ok"]', () => { closeDialog(); adapter.focus?.(base.length + (pending.length ? pending[0] - startNo : 0)); });
    on('[data-x="more"]', () => { files = []; showPick(); });
    on('[data-x="undo"]', () => {
      if (undoSnapshot) adapter.set(undoSnapshot, Math.max(0, undoSnapshot.length - 1));
      undoSnapshot = null;
      setView("undone", {
        title: "เลิกทำแล้ว",
        sub: `นำข้อสอบ ${n} ข้อที่เพิ่งเพิ่มออก รายการกลับเป็นเหมือนเดิม`,
        body: `<div class="xdz-hero"><div class="xdz-badge info">${I.undo(34)}</div></div>`,
        foot: `<button type="button" class="xdz-btn ghost" data-x="close">ปิด</button>
          <button type="button" class="xdz-btn pri" data-x="retry">แปลงไฟล์เดิมอีกครั้ง</button>`,
      });
      on('[data-x="close"]', () => closeDialog());
      on('[data-x="retry"]', () => { files = []; showPick(todo); });
    });
  }

  /* ---------- ลากวางทั้งหน้า ---------- */
  // แสดงเฉพาะเมื่อลากเอกสาร (PDF/Word/txt) — ถ้าลากแค่รูปภาพ ปล่อยให้ช่องแนบรูปของหน้าเดิมทำงานตามปกติ
  // ยกเว้นตอนหน้าต่างเลือกไฟล์เปิดอยู่ ซึ่งรับรูปภาพด้วย
  const isFileDrag = (dt) => dt && [...dt.types].includes("Files");
  const hasDocs = (dt) => isFileDrag(dt) &&
    [...(dt.items || [])].some((it) => it.kind === "file" && (DOC_TYPES.test(it.type) || it.type === ""));
  const zoneEl = () => (view === "pick" ? dlg?.box.querySelector(".xdz-zone") : null);
  let depth = 0;
  const onEnter = (e) => {
    if (busy || view === "run") return;
    if (view === "pick") { if (isFileDrag(e.dataTransfer)) { depth++; zoneEl()?.classList.add("over"); } return; }
    if (view !== "closed" || !hasDocs(e.dataTransfer)) return;
    depth++;
    overlay.classList.add("on");
  };
  const active = () => overlay.classList.contains("on") || zoneEl()?.classList.contains("over");
  const onOver = (e) => { if (active()) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } };
  const reset = () => { depth = 0; overlay.classList.remove("on"); zoneEl()?.classList.remove("over"); };
  const onLeave = () => { if (depth > 0 && --depth === 0) reset(); };
  const onDrop = (e) => {
    if (!active()) return;
    e.preventDefault();
    e.stopPropagation();
    const dropped = e.dataTransfer.files;
    const fromPick = view === "pick";
    reset();
    if (fromPick) showPick(dropped);            // ในหน้าต่าง: เพิ่มเข้ารายการ ให้ครูกดเริ่มเอง
    else { files = []; addFiles(dropped); rejected.length ? showPick() : run(files); } // ลากใส่หน้า: เริ่มแปลงทันที
  };
  window.addEventListener("dragenter", onEnter);
  window.addEventListener("dragover", onOver);
  window.addEventListener("dragleave", onLeave);
  window.addEventListener("drop", onDrop, true);

  input.addEventListener("change", () => {
    const picked = [...input.files];
    input.value = "";
    if (picked.length) showPick(picked);
  });
  fabBtn?.addEventListener("click", () => { files = []; showPick(); });

  return {
    /** เปิดหน้าต่างเลือกไฟล์ (ผูกกับปุ่มของหน้าเองได้) */
    open: () => { if (view === "closed") { files = []; showPick(); } },
    /** เปิดตัวเลือกไฟล์ของระบบทันที */
    pick: () => input.click(),
    /** แปลงไฟล์ที่มีอยู่แล้ว เช่นจาก <input> ของหน้า */
    addFiles: (list) => { files = []; addFiles(list); return rejected.length ? showPick() : run(files); },
    destroy() {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop, true);
      busy?.abort();
      closeDialog();
      root.remove();
    },
  };
}
