import { ACCEPT } from "./cv-extract.mjs";
import { listModels, DEFAULT_MODEL } from "./cv-gemini.mjs";
import { convertFiles } from "./cv-converter.mjs";
import { getServerConfig } from "./cv-server-client.mjs";
import { CONFIG } from "./cv-config.mjs";
import { RECOMMENDED_MODELS } from "./cv-prompt.mjs";
import { LETTERS, optionCount, validate, toTable, downloadXlsx } from "./cv-excel.mjs";

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const DRAFT_KEY = "exam-draft-v1";

const FALLBACK_MODELS = RECOMMENDED_MODELS;

const state = { files: [], rows: [], skipped: 0, duplicates: 0, controller: null, dirty: false };
const TH_TO_EN = { ก: "a", ข: "b", ค: "c", ง: "d", จ: "e", ฉ: "f", ช: "g" };

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- API key & models ---------- */
const keyInput = $("api-key");
const modelSelect = $("model");
const remember = $("remember-key");

function fillModels(models, keep) {
  const want = keep || store.get("exam-model-v2") || DEFAULT_MODEL;
  modelSelect.innerHTML = "";
  for (const m of models) modelSelect.add(new Option(m.label || m.id, m.id));
  if (![...modelSelect.options].some((o) => o.value === want)) {
    modelSelect.value = models[0]?.id || DEFAULT_MODEL; // โมเดลที่จำไว้ใช้ไม่ได้แล้ว
  } else {
    modelSelect.value = want;
  }
}

let modelTimer;
async function refreshModels() {
  const key = keyInput.value.trim();
  const pill = $("key-status");
  if (!key) { pill.hidden = true; return; }
  try {
    const models = await listModels(key);
    pill.hidden = false; pill.className = "pill ok"; pill.textContent = "เชื่อมต่อแล้ว"; pill.title = "";
    if (models.length) {
      // รุ่นแนะนำ (alias -latest) ขึ้นก่อน ตามด้วยรุ่นอื่นที่ Key นี้ใช้ได้
      const rec = new Set(RECOMMENDED_MODELS.map((m) => m.id));
      const others = models.filter((m) => !rec.has(m.id) && !/latest/.test(m.id)).sort((a, b) => b.id.localeCompare(a.id));
      fillModels([...RECOMMENDED_MODELS, ...others], modelSelect.value);
    }
  } catch (e) {
    pill.hidden = false; pill.className = "pill bad";
    pill.textContent = e.status ? "Key ใช้ไม่ได้" : "ตรวจ Key ไม่ได้";
    pill.title = e.message;
  }
  updateConvertBtn();
}

keyInput.addEventListener("input", () => {
  if (remember.checked) store.set("exam-api-key", keyInput.value.trim());
  clearTimeout(modelTimer);
  modelTimer = setTimeout(refreshModels, 600);
  updateConvertBtn();
});
remember.addEventListener("change", () => {
  if (remember.checked) store.set("exam-api-key", keyInput.value.trim());
  else store.del("exam-api-key");
});
modelSelect.addEventListener("change", () => store.set("exam-model-v2", modelSelect.value));
$("toggle-key").addEventListener("click", (e) => {
  const show = keyInput.type === "password";
  keyInput.type = show ? "text" : "password";
  e.currentTarget.textContent = show ? "ซ่อน" : "แสดง";
});

/* ---------- Files ---------- */
const fileInput = $("file-input");
const drop = $("drop");
fileInput.accept = ACCEPT;

function fmtSize(b) {
  return b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
}

function addFiles(list) {
  for (const f of list) {
    if (!state.files.some((x) => x.file.name === f.name && x.file.size === f.size)) {
      state.files.push({ file: f, status: "", info: "" });
    }
  }
  renderFiles();
}

function renderFiles() {
  const ul = $("file-list");
  ul.innerHTML = "";
  state.files.forEach((f, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="name"></span><span class="size">${fmtSize(f.file.size)}</span>
      <span class="st ${f.status}"></span><button class="rm" aria-label="เอาไฟล์ออก" ${state.controller ? "disabled" : ""}>×</button>`;
    li.querySelector(".name").textContent = f.file.name;
    li.querySelector(".st").textContent = f.info;
    li.querySelector(".st").title = f.title || "";
    li.querySelector(".rm").onclick = () => { state.files.splice(i, 1); renderFiles(); };
    ul.appendChild(li);
  });
  updateConvertBtn();
}

fileInput.addEventListener("change", () => { addFiles(fileInput.files); fileInput.value = ""; });
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

let pasteCount = 0;
$("paste-add").addEventListener("click", () => {
  const text = $("paste-text").value.trim();
  if (!text) { $("paste-text").focus(); return; }
  pasteCount += 1;
  addFiles([new File([text], `ข้อความที่วาง ${pasteCount}.txt`, { type: "text/plain" })]);
  $("paste-text").value = "";
});

function updateConvertBtn() {
  const needKey = CONFIG.mode === "direct" && !keyInput.value.trim();
  const btn = $("convert-btn");
  btn.disabled = needKey || !state.files.length || !!state.controller;
  btn.title = needKey ? "กรุณาใส่ API Key ก่อน" : !state.files.length ? "กรุณาเลือกไฟล์ข้อสอบก่อน" : "";
}

/* ---------- Convert ---------- */
function showError(msg) {
  const box = $("error");
  box.hidden = !msg;
  box.innerHTML = msg || "";
}

function setProgress(done, total, text, busy) {
  $("progress").hidden = false;
  $("bar-fill").style.width = `${Math.round((done / total) * 100)}%`;
  $("bar-fill").parentElement.classList.toggle("busy", !!busy);
  $("progress-text").textContent = text;
}

function retryText(info) {
  if (info.type === "switch") {
    return info.code === "daily_quota" ? `โควตาโมเดลหลักวันนี้หมด กำลังใช้ ${info.model} แทน` : `โมเดลหลักไม่ว่าง กำลังใช้ ${info.model} แทน`;
  }
  const why = info.status === 429 ? "ส่งคำขอถี่เกินไป" : info.status === 0 ? "การเชื่อมต่อสะดุด" : "AI ไม่ว่างชั่วคราว";
  return `${why} กำลังลองใหม่ครั้งที่ ${info.attempt} ใน ${Math.round(info.waitMs / 1000)} วินาที`;
}

$("convert-btn").addEventListener("click", async () => {
  if (state.rows.length && state.dirty && !confirm("ผลการแปลงก่อนหน้ายังไม่ได้ดาวน์โหลด ต้องการแปลงใหม่และแทนที่ผลเดิมหรือไม่?")) return;
  showError("");
  const files = state.files.map((f) => f.file);
  state.controller = new AbortController();
  $("cancel-btn").hidden = false;
  updateConvertBtn();
  state.files.forEach((f) => { f.status = ""; f.info = ""; f.title = ""; f.note = ""; });
  renderFiles();
  const started = Date.now();
  const tick = setInterval(() => {
    const running = state.files.findIndex((f) => f.status === "run");
    if (running < 0) return;
    const s = Math.round((Date.now() - started) / 1000);
    const note = state.files[running].note;
    setProgress(running, files.length,
      `กำลังให้ AI อ่าน “${files[running].name}” (${running + 1}/${files.length}) · ${s} วินาที` +
      (note ? ` — ${note}` : s > 20 ? " — ไฟล์ยาวอาจใช้เวลา 1–2 นาที" : ""), true);
  }, 1000);

  try {
    const { rows, skipped, duplicates, errors, remaining, stopped } = await convertFiles(files, {
      mode: CONFIG.mode,
      apiKey: keyInput.value.trim(),
      model: modelSelect.value,
      solveMissing: $("solve-missing").checked,
      signal: state.controller.signal,
      onFile(i, status, info) {
        const f = state.files[i];
        f.status = status;
        f.note = "";
        if (status === "run") f.info = "กำลังแปลง…";
        else if (status === "ok") f.info = `${info.count} ข้อ`;
        else { f.info = "ผิดพลาด"; f.title = info.message; }
        renderFiles();
      },
      onRetry(i, info) {
        state.files[i].note = retryText(info);
      },
    });

    if (remaining !== undefined && remaining !== null) showQuota(remaining);
    if (stopped && ["daily_quota", "user_quota"].includes(stopped.code)) {
      // โควตาหมด: บอกเวลาที่ใช้ได้อีกครั้ง และไฟล์ที่ยังไม่ได้แปลง (ไฟล์ที่แปลงสำเร็จก่อนหน้ายังอยู่ในตาราง)
      showError(`<b>${stopped.code === "daily_quota" ? "โควตา AI ของวันนี้หมดแล้ว" : "ใช้ครบโควตาของวันนี้แล้ว"}</b>
        <div>${esc(stopped.message)}</div>${stopped.notRun ? `<div>ยังไม่ได้แปลงอีก ${stopped.notRun} ไฟล์</div>` : ""}`);
    } else if (errors.length) {
      showError(`<b>แปลงไม่สำเร็จ ${errors.length} ไฟล์</b><ul>${errors.map((e) => `<li>${esc(e.file)}: ${esc(e.message)}</li>`).join("")}</ul>`);
    }
    if (rows.length) {
      state.rows = rows;
      state.skipped = skipped;
      state.duplicates = duplicates;
      state.dirty = true;
      const ok = files.filter((_, i) => state.files[i]?.status === "ok");
      const base = (ok[0] || files[0]).name.replace(/\.[^.]+$/, "");
      $("filename").value = ok.length > 1 ? `${base}_และอื่นๆ` : base;
      renderResult();
      $("result-card").hidden = false;
      $("result-card").scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (!errors.length && !state.controller.signal.aborted) {
      showError("ไม่พบข้อสอบปรนัยในไฟล์ ลองตรวจว่าไฟล์มีโจทย์และตัวเลือก ก ข ค ง หรือไม่");
    }
    const secs = Math.round((Date.now() - started) / 1000);
    setProgress(1, 1, state.controller.signal.aborted ? "ยกเลิกแล้ว" : `เสร็จแล้ว · ${rows.length} ข้อ · ${secs} วินาที`);
  } catch (e) {
    showError(esc(e.message));
    $("progress").hidden = true;
  } finally {
    clearInterval(tick);
    state.controller = null;
    $("cancel-btn").hidden = true;
    renderFiles();
  }
});

$("cancel-btn").addEventListener("click", () => state.controller?.abort());

/* ---------- Preview / edit ---------- */
function renderResult() {
  const rows = state.rows;
  const n = optionCount(rows);
  const letters = LETTERS.slice(0, n);
  const ai = rows.filter((r) => r.source === "ai").length;
  const noAns = rows.filter((r) => !r.answer).length;
  const issues = validate(rows);
  const errRows = new Set(issues.filter((x) => x.level === "error").map((x) => x.row));
  const warnByRow = new Map();
  issues.filter((x) => x.level === "warn").forEach((x) => warnByRow.set(x.row, [...(warnByRow.get(x.row) || []), x.msg]));

  $("stats").innerHTML = [
    [rows.length, "ข้อทั้งหมด"],
    [rows.filter((r) => r.source === "file").length, "เฉลยจากไฟล์"],
    [ai, "AI หาคำตอบ"],
    [noAns, "ยังไม่มีเฉลย"],
  ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");

  const warns = [];
  if (errRows.size) warns.push(`<b>ข้อ ${[...errRows].map((r) => r + 1).join(", ")} ยังไม่สมบูรณ์</b> (ช่องสีแดง) กรุณาแก้ก่อนดาวน์โหลด`);
  if (warnByRow.size) warns.push(`ข้อ ${[...warnByRow.keys()].map((r) => r + 1).join(", ")} น่าสงสัย (ตัวเลือกหรือโจทย์ซ้ำ) ลองตรวจอีกครั้ง`);
  const over4 = rows.map((r, i) => (r.options.length > 4 ? i + 1 : 0)).filter(Boolean);
  if (over4.length) {
    warns.push(`ข้อ ${over4.join(", ")} มีตัวเลือกเกิน 4 ข้อ จึงเพิ่มคอลัมน์ ${letters.slice(4).join(", ")} ให้ <b>แต่ปุ่มนำเข้า Excel ของ ExamPro ตอนนี้อ่านได้แค่ a–d</b> ตัวเลือกที่เกินจะหายไป และถ้าเฉลยเป็น e ขึ้นไป ระบบจะเปลี่ยนเป็น a เอง`);
    warns.push(`ข้อที่มีตัวเลือกไม่ครบ ${n} ข้อ จะใส่ “-” ในช่องที่ไม่มี เพื่อไม่ให้มีช่องว่าง`);
  }
  if (ai) warns.push(`มี ${ai} ข้อที่ AI หาคำตอบเอง (ป้ายสีส้ม) ควรตรวจทานก่อนใช้จริง`);
  if (state.skipped) warns.push(`ข้ามข้อที่ไม่ใช่ปรนัยไป ${state.skipped} ข้อ`);
  if (state.duplicates) warns.push(`ตัดข้อที่ซ้ำกันทุกตัวอักษรออก ${state.duplicates} ข้อ`);
  $("warnings").hidden = !warns.length;
  $("warnings").innerHTML = warns.length ? `<ul>${warns.map((w) => `<li>${w}</li>`).join("")}</ul>` : "";

  const head = `<thead><tr><th>#</th><th>question</th>${letters.map((l) => `<th>${l}</th>`).join("")}<th>answer</th><th></th></tr></thead>`;
  const body = rows.map((r, i) => {
    const tags = [
      r.source === "ai" ? `<span class="tag ai">AI ตอบ</span>` : "",
      r.note ? `<span class="tag note" title="${esc(r.note)}">⚠ ${esc(r.note)}</span>` : "",
      ...(warnByRow.get(i) || []).map((m) => `<span class="tag note">⚠ ${esc(m)}</span>`),
    ].filter(Boolean).join(" ");
    const opts = letters.map((l, j) => {
      const v = r.options[j];
      const cls = ["o", v === undefined ? "" : !v ? "empty" : "", r.answer === l && v ? "correct" : ""].join(" ");
      return `<td class="${cls}" contenteditable="plaintext-only" data-r="${i}" data-k="o${j}" ${v === undefined ? 'data-placeholder="-"' : ""}>${esc(v ?? "")}</td>`;
    }).join("");
    const ansBad = !r.answer || !r.options[LETTERS.indexOf(r.answer)];
    return `<tr class="${tags ? "flag" : ""}"><td class="n">${i + 1}</td>
      <td class="q ${r.question ? "" : "empty"}"><div contenteditable="plaintext-only" data-r="${i}" data-k="q">${esc(r.question)}</div>${tags ? `<div>${tags}</div>` : ""}</td>
      ${opts}
      <td class="ans ${ansBad ? "empty" : ""}" contenteditable="plaintext-only" data-r="${i}" data-k="a">${esc(r.answer)}</td>
      <td class="del"><button type="button" data-del="${i}" aria-label="ลบข้อ ${i + 1}" title="ลบข้อนี้">×</button></td></tr>`;
  }).join("");
  $("preview").innerHTML = head + `<tbody>${body}</tbody>`;
  saveDraft();
}

function applyEdit(el) {
  const r = state.rows[+el.dataset.r];
  if (!r) return false;
  const k = el.dataset.k;
  const v = el.textContent.replace(/\s+/g, " ").trim();
  const before = JSON.stringify(r);
  if (k === "q") r.question = v;
  else if (k === "a") {
    const a = (TH_TO_EN[v] || v).toLowerCase();
    r.answer = LETTERS.slice(0, Math.max(r.options.length, 4)).includes(a) ? a : "";
    if (r.answer && r.source === "none") r.source = "file";
  } else {
    const j = +k.slice(1);
    while (r.options.length <= j) r.options.push("");
    r.options[j] = v;
    while (r.options.length > 4 && !r.options[r.options.length - 1]) r.options.pop();
  }
  return JSON.stringify(r) !== before;
}

// แก้ไขในตาราง -> อัปเดต state เมื่อออกจากช่อง แล้วคืนโฟกัสไปช่องที่ผู้ใช้กดต่อ (Tab / คลิก)
$("preview").addEventListener("focusout", (e) => {
  const el = e.target.closest("[data-k]");
  if (!el || !applyEdit(el)) return;
  state.dirty = true;
  const next = e.relatedTarget?.closest?.("[data-k]");
  const target = next && { r: next.dataset.r, k: next.dataset.k };
  renderResult();
  if (target) $("preview").querySelector(`[data-r="${target.r}"][data-k="${target.k}"]`)?.focus();
});
$("preview").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && e.target.closest("[data-k]")) { e.preventDefault(); e.target.blur(); }
});
$("preview").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-del]");
  if (!btn) return;
  const i = +btn.dataset.del;
  const q = state.rows[i]?.question || "";
  if (!confirm(`ลบข้อ ${i + 1}${q ? `: “${q.slice(0, 60)}${q.length > 60 ? "…" : ""}”` : ""} ?`)) return;
  state.rows.splice(i, 1);
  state.dirty = true;
  renderResult();
});
$("add-row").addEventListener("click", () => {
  state.rows.push({ question: "", options: ["", "", "", ""], answer: "", source: "none", note: "" });
  state.dirty = true;
  renderResult();
  $("preview").querySelector(`[data-r="${state.rows.length - 1}"][data-k="q"]`)?.focus();
});

/* ---------- Draft (กันงานหายเมื่อรีเฟรช/ปิดแท็บ) ---------- */
function saveDraft() {
  if (!state.rows.length) { store.del(DRAFT_KEY); return; }
  store.set(DRAFT_KEY, JSON.stringify({
    rows: state.rows, skipped: state.skipped, filename: $("filename").value, dirty: state.dirty, savedAt: Date.now(),
  }));
}
$("filename").addEventListener("input", saveDraft);

function loadDraft() {
  try {
    const d = JSON.parse(store.get(DRAFT_KEY) || "null");
    return d && Array.isArray(d.rows) && d.rows.length ? d : null;
  } catch { return null; }
}

function offerDraft() {
  const d = loadDraft();
  if (!d) return;
  const when = new Date(d.savedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  $("draft-text").textContent = `มีงานที่แปลงไว้ ${d.rows.length} ข้อ (“${d.filename || "ข้อสอบ"}” · ${when})${d.dirty ? " ยังไม่ได้ดาวน์โหลด" : ""}`;
  $("draft-banner").hidden = false;
  $("draft-restore").onclick = () => {
    Object.assign(state, { rows: d.rows, skipped: d.skipped || 0, duplicates: 0, dirty: !!d.dirty });
    $("filename").value = d.filename || "ข้อสอบ";
    renderResult();
    $("result-card").hidden = false;
    $("draft-banner").hidden = true;
    $("result-card").scrollIntoView({ behavior: "smooth", block: "start" });
  };
  $("draft-discard").onclick = () => { store.del(DRAFT_KEY); $("draft-banner").hidden = true; };
}

window.addEventListener("beforeunload", (e) => {
  if (state.controller || (state.rows.length && state.dirty)) { e.preventDefault(); e.returnValue = ""; }
});

/* ---------- Download ---------- */
function filename(ext) {
  const name = ($("filename").value.trim() || "ข้อสอบ").replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
  return `${name}.${ext}`;
}

function markDownloaded() {
  state.dirty = false;
  saveDraft();
}

$("download-btn").addEventListener("click", () => {
  document.activeElement?.blur?.(); // บันทึกช่องที่กำลังพิมพ์อยู่ก่อน
  if (!state.rows.length) return alert("ยังไม่มีข้อสอบให้ดาวน์โหลด");
  const errors = validate(state.rows).filter((x) => x.level === "error");
  if (errors.length) {
    const rows = [...new Set(errors.map((x) => x.row + 1))];
    if (!confirm(`ข้อ ${rows.join(", ")} ยังไม่สมบูรณ์ (เช่น ไม่มีเฉลย หรือมีช่องว่าง)\nไฟล์อาจนำเข้าไม่ถูกต้อง ต้องการดาวน์โหลดเลยหรือไม่?`)) return;
  }
  try { downloadXlsx(state.rows, filename("xlsx")); markDownloaded(); } catch (e) { alert(e.message); }
});

$("json-btn").addEventListener("click", () => {
  document.activeElement?.blur?.();
  const [header, ...body] = toTable(state.rows);
  const data = body.map((row) => Object.fromEntries(header.map((h, i) => [h, row[i]])));
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename("json") });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  markDownloaded();
});

/* ---------- Init ---------- */
let quotaLimit = null;
function showQuota(remaining, limit = quotaLimit) {
  if (limit) quotaLimit = limit;
  const pill = $("key-status");
  pill.hidden = false;
  pill.className = remaining > 0 ? "pill ok" : "pill bad";
  pill.textContent = `เหลือ ${remaining}${limit ? `/${limit}` : ""} ไฟล์วันนี้`;
}

async function setupServerMode() {
  document.body.classList.add("mode-server");
  $("key-title").textContent = "AI ของระบบ";
  $("server-hint").hidden = false;
  try {
    const cfg = await getServerConfig();
    fillModels(cfg.models?.length ? cfg.models : FALLBACK_MODELS, cfg.defaultModel);
    if (cfg.limit) showQuota(cfg.remaining, cfg.limit);
    if (cfg.configured === false) showError("ผู้ดูแลระบบยังไม่ได้ตั้งค่า AI (GEMINI_API_KEY)");
  } catch (e) {
    showError(esc(e.message));
    if (e.status === 401 && CONFIG.loginUrl) {
      $("error").insertAdjacentHTML("beforeend", ` <a class="link" href="${esc(CONFIG.loginUrl)}">ไปหน้าเข้าสู่ระบบ →</a>`);
    }
  }
}

fillModels(FALLBACK_MODELS);
if (CONFIG.mode === "server") {
  setupServerMode();
} else {
  const saved = store.get("exam-api-key");
  if (saved) { keyInput.value = saved; remember.checked = true; refreshModels(); }
}
updateConvertBtn();
offerDraft();

// ให้หน้าอื่นเรียกใช้ได้ เช่น ทดสอบหรือเชื่อมระบบในอนาคต
window.ExamConverter = { convertFiles, state, renderResult };
