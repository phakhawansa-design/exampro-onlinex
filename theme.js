// theme.js — ใส่โลโก้ ExamPro และปรับหน้าตาเล็กน้อย (ไม่แตะการทำงานของหน้า)

// ===== แจ้งเตือนแบบเป็นมิตร: แทนกล่อง alert() ของเบราว์เซอร์ =====
// ข้อความสั้น → แถบแจ้งเตือนเลื่อนลงจากด้านบนแล้วหายเอง · ข้อความยาว → กล่องกลางจอมีปุ่ม "ตกลง"
// แจ้งเตือนที่ยังแสดงอยู่ตอนเปลี่ยนหน้า จะแสดงต่อในหน้าถัดไป (เช่น "บันทึกสำเร็จ" แล้วพาไปหน้าอื่น)
(function () {
  if (window.uiToast) return;
  const KEY = '__uiToasts';
  const kindOf = m => /ไม่สำเร็จ|ผิดพลาด|ไม่สามารถ|ล้มเหลว|ปฏิเสธ|ไม่พบ|หมดอายุ|ไม่ถูกต้อง|ไม่ตรงกัน|ห้าม|error/i.test(m) ? 'err'
    : /สำเร็จ|เรียบร้อย|บันทึกแล้ว|คัดลอก|ส่งแล้ว|เพิ่ม.*แล้ว|ลบ.*แล้ว/.test(m) ? 'ok' : 'info';
  const css = `
  .ui-toasts{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483600;display:flex;flex-direction:column;gap:8px;width:min(440px,calc(100vw - 24px));pointer-events:none}
  .ui-toast{pointer-events:auto;display:flex;align-items:flex-start;gap:10px;padding:12px 14px 12px 12px;border-radius:14px;background:#fff;color:#0f172a;box-shadow:0 14px 34px -12px rgba(2,11,38,.35),0 0 0 1px rgba(15,23,42,.06);font:500 14.5px/1.55 'Noto Sans Thai Looped',Tahoma,sans-serif;white-space:pre-line;animation:uiIn .26s cubic-bezier(.2,.9,.3,1.15);cursor:pointer}
  .ui-toast.out{animation:uiOut .18s ease-in forwards}
  .ui-toast i{flex:none;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-weight:800;font-size:13px;color:#fff;margin-top:1px}
  .ui-toast.ok i{background:#16a34a}.ui-toast.err i{background:#dc2626}.ui-toast.info i{background:#1557e0}
  .ui-toast.err{box-shadow:0 14px 34px -12px rgba(220,38,38,.35),0 0 0 1px rgba(220,38,38,.25)}
  .ui-dlg{position:fixed;inset:0;z-index:2147483601;background:rgba(2,11,38,.55);display:flex;align-items:center;justify-content:center;padding:18px;animation:uiFade .15s ease-out}
  .ui-dlg>div{width:100%;max-width:440px;max-height:80vh;overflow:auto;background:#fff;border-radius:20px;padding:22px 20px 16px;box-shadow:0 30px 70px -20px rgba(0,0,0,.5);font:500 15px/1.65 'Noto Sans Thai Looped',Tahoma,sans-serif;color:#0f172a;white-space:pre-line;animation:uiIn .22s cubic-bezier(.2,.9,.3,1.15)}
  .ui-dlg button{display:block;width:100%;margin-top:14px;padding:12px;border:0;border-radius:12px;background:#0b2a7a;color:#fff;font:700 15px 'Noto Sans Thai Looped',Tahoma,sans-serif;cursor:pointer}
  @keyframes uiIn{from{opacity:0;transform:translateY(-10px) scale(.98)}to{opacity:1;transform:none}}
  @keyframes uiOut{to{opacity:0;transform:translateY(-6px) scale(.98)}}
  @keyframes uiFade{from{opacity:0}to{opacity:1}}
  @media (prefers-reduced-motion:reduce){.ui-toast,.ui-dlg,.ui-dlg>div{animation:none!important}}`;
  let box = null; const live = new Map();
  const ready = fn => (document.body ? fn() : document.addEventListener('DOMContentLoaded', fn));
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify([...live.values()].map(t => ({ m: t.m, k: t.k, until: t.until })))); } catch (e) {} };
  function mount() {
    if (box && document.body.contains(box)) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    box = document.createElement('div'); box.className = 'ui-toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  function toast(msg, kind, ms) {
    msg = String(msg == null ? '' : msg).trim(); if (!msg) return;
    ready(() => {
      mount();
      const k = kind || kindOf(msg);
      const dur = ms || (k === 'err' ? 7000 : Math.min(6500, 2600 + msg.length * 35));
      const el = document.createElement('div'); el.className = 'ui-toast ' + k;
      el.innerHTML = `<i>${k === 'ok' ? '✓' : k === 'err' ? '!' : 'i'}</i><span></span>`;
      el.querySelector('span').textContent = msg;
      const id = Math.random().toString(36).slice(2);
      const close = () => { if (!live.has(id)) return; live.delete(id); save(); el.classList.add('out'); setTimeout(() => el.remove(), 200); };
      el.addEventListener('click', close);
      box.appendChild(el); while (box.children.length > 3) box.firstChild.remove();
      live.set(id, { m: msg, k, until: Date.now() + dur }); save();
      setTimeout(close, dur);
    });
  }
  function dialog(msg) {
    ready(() => {
      mount();
      const d = document.createElement('div'); d.className = 'ui-dlg'; d.setAttribute('role', 'alertdialog');
      d.innerHTML = '<div><span></span><button type="button">ตกลง</button></div>';
      d.querySelector('span').textContent = String(msg);
      try { sessionStorage.setItem(KEY + 'Dlg', String(msg)); } catch (e) {}
      const close = () => { d.remove(); try { sessionStorage.removeItem(KEY + 'Dlg'); } catch (e) {} };
      d.querySelector('button').addEventListener('click', close);
      d.addEventListener('keydown', e => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); close(); } });
      document.body.appendChild(d); setTimeout(() => d.querySelector('button').focus(), 20);
    });
  }
  // ยืนยันการทำงานแบบกล่องในหน้าเว็บ (แทน confirm() ของเบราว์เซอร์)
  // เดิม confirm() ถูกบางเบราว์เซอร์บล็อก → คืนค่า false ทันที ปุ่มอย่าง "เริ่มสอบ" กดแล้วไม่เกิดอะไร
  // ใช้: if (!(await uiConfirm('ข้อความ'))) return;   · ตัวเลือก { ok: 'ลบ', cancel: 'ยกเลิก', danger: true }
  function confirmBox(msg, opt) {
    opt = opt || {};
    const text = String(msg == null ? '' : msg);
    const danger = opt.danger !== undefined ? opt.danger : /ลบ|ล้าง|ระงับ|ปฏิเสธ|ปิดห้อง|หยุด|ถาวร/.test(text);
    return new Promise(resolve => ready(() => {
      mount();
      if (!document.getElementById('ui-cf-css')) {
        const st = document.createElement('style'); st.id = 'ui-cf-css';
        st.textContent = `.ui-cf .ui-cf-row{display:flex;gap:10px;margin-top:16px}.ui-cf .ui-cf-row button{margin:0;flex:1;min-height:44px}
        .ui-cf .ui-cf-no{background:#eef2f8;color:#0f172a}.ui-cf .ui-cf-ok.danger{background:#dc2626}
        .ui-cf button:focus-visible{outline:3px solid #ff9a3c;outline-offset:2px}
        @media (max-width:560px){.ui-dlg.ui-cf{align-items:flex-end;padding:0}.ui-dlg.ui-cf>div{max-width:none;border-radius:20px 20px 0 0;padding-bottom:calc(16px + env(safe-area-inset-bottom))}}`;
        document.head.appendChild(st);
      }
      const prevFocus = document.activeElement;
      const d = document.createElement('div'); d.className = 'ui-dlg ui-cf'; d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-modal', 'true');
      d.innerHTML = '<div><span id="ui-cf-msg"></span><div class="ui-cf-row"><button type="button" class="ui-cf-no"></button><button type="button" class="ui-cf-ok"></button></div></div>';
      d.setAttribute('aria-describedby', 'ui-cf-msg');
      d.querySelector('span').textContent = text;
      const ok = d.querySelector('.ui-cf-ok'), no = d.querySelector('.ui-cf-no');
      ok.textContent = opt.ok || 'ยืนยัน'; no.textContent = opt.cancel || 'ยกเลิก';
      if (danger) ok.classList.add('danger');
      const done = v => { d.remove(); window.__inDialog = false; try { prevFocus && prevFocus.focus && prevFocus.focus(); } catch (e) {} resolve(v); };
      ok.addEventListener('click', () => done(true)); no.addEventListener('click', () => done(false));
      d.addEventListener('click', e => { if (e.target === d) done(false); });
      d.addEventListener('keydown', e => {
        if (e.key === 'Escape') { e.preventDefault(); done(false); }
        if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === ok ? no : ok).focus(); }
      });
      window.__inDialog = true;
      document.body.appendChild(d); setTimeout(() => (danger ? no : ok).focus(), 20);
    }));
  }
  // วาดรายการใหม่อย่างนุ่มนวล: ข้อมูลไม่เปลี่ยน → ไม่วาด · รีเฟรชอัตโนมัติระหว่างที่เมาส์/โฟกัสอยู่ในรายการ → รอจนออกก่อน
  // (เดิมวาดใหม่ทุก 3–5 วินาที ปุ่มที่กำลังจะกดถูกแทนที่ และแถวที่กางไว้หุบเอง)
  // ใช้: uiSetHTML(el, html, { auto: true })  · auto = มาจากตัวจับเวลา · การกดของผู้ใช้ไม่ต้องใส่ (วาดทันที)
  function setHTML(el, html, opt) {
    if (!el) return false;
    const auto = opt && opt.auto;
    if (el.__uiHtml === html && el.innerHTML !== '') return false;
    const busy = () => el.matches(':hover') || el.contains(document.activeElement) || !!document.querySelector('.ui-cf');
    if (auto && el.__uiHtml !== undefined && busy()) {
      el.__uiPending = html;
      if (!el.__uiWait) {
        el.__uiWait = setInterval(() => {
          if (el.__uiPending === undefined) { clearInterval(el.__uiWait); el.__uiWait = null; return; }
          if (busy()) return;
          const p = el.__uiPending; el.__uiPending = undefined; clearInterval(el.__uiWait); el.__uiWait = null;
          el.innerHTML = p; el.__uiHtml = p;
        }, 700);
      }
      return false;
    }
    el.__uiPending = undefined;
    el.innerHTML = html; el.__uiHtml = html; return true;
  }
  window.uiToast = toast; window.uiDialog = dialog; window.uiConfirm = confirmBox; window.uiSetHTML = setHTML;
  window.alert = function (m) {
    const s = String(m == null ? '' : m);
    if (s.length > 160 || /\n\s*\n/.test(s)) dialog(s); else toast(s);
  };
  // แจ้งเตือนที่ค้างจากหน้าก่อน
  try {
    const q = JSON.parse(sessionStorage.getItem(KEY) || '[]'); sessionStorage.removeItem(KEY);
    q.filter(t => t.until > Date.now()).forEach(t => toast(t.m, t.k, Math.max(1500, t.until - Date.now())));
    const dl = sessionStorage.getItem(KEY + 'Dlg'); if (dl) dialog(dl);
  } catch (e) {}
})();

(function () {

  const pageNow = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  const run = () => {
    const page = pageNow;
    // 1.5) คำว่า Pro ในโลโก้ตัวหนังสือของแถบข้าง (พื้นน้ำเงินเข้ม) = สีเหลือง
    document.querySelectorAll('#sidebar span, #sidebar b').forEach(el => { if (el.children.length === 0 && el.textContent.trim() === 'Pro') el.classList.add('rm-pro'); });
    // 2) ชื่อใต้โลโก้ในแถบข้าง
    const sub = document.querySelector('#sidebar .logo-text > div:last-child');
    if (sub) sub.textContent = 'ระบบสอบออนไลน์';
    // 2.5) ปุ่มเปิดเมนูบนมือถือ (บางหน้าเดิมไม่มีปุ่มนี้ ทำให้เปิดเมนูไม่ได้บนมือถือ)
    const sb = document.getElementById('sidebar');
    if (sb && !document.querySelector('.rm-menu-btn')) {
      const hasOwn = [...document.querySelectorAll('button,[onclick]')].some(b => /mobile-open/.test(b.getAttribute('onclick') || '') || b.id === 'mobile-menu-btn');
      const ov = document.createElement('div'); ov.className = 'rm-overlay'; document.body.appendChild(ov);
      const close = () => { sb.classList.remove('mobile-open'); document.body.classList.remove('rm-sb-open'); };
      ov.addEventListener('click', close);
      sb.addEventListener('click', e => { if (e.target.closest('a')) close(); });
      new MutationObserver(() => document.body.classList.toggle('rm-sb-open', sb.classList.contains('mobile-open'))).observe(sb, { attributes: true, attributeFilter: ['class'] });
      if (!hasOwn) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'rm-menu-btn'; b.setAttribute('aria-label', 'เปิดเมนู');
        b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>เมนู';
        b.addEventListener('click', () => sb.classList.toggle('mobile-open'));
        document.body.appendChild(b);
      }
    }
    // 3) หน้านักศึกษา (เข้าสอบ / ทำข้อสอบ / พอร์ทัล)
    if (/^(student-login|student-portal)\.html$/.test(page)) {
      document.body.classList.add('rm-student');
      const ls = document.getElementById('login-screen');
      if (ls && !document.querySelector('.rm-uni-s')) {
        const box = document.createElement('div');
        box.style.cssText = 'width:100%;max-width:32rem;position:relative;z-index:1';
        box.innerHTML = `<div class="rm-uni-s">ExamPro</div>`;
        ls.parentElement.style.flexDirection = 'column';
        ls.parentElement.insertBefore(box, ls);
        // ซ่อนแถบชื่อระบบเมื่อเข้าสู่หน้าทำข้อสอบ
        new MutationObserver(() => { box.style.display = ls.classList.contains('hidden') ? 'none' : ''; }).observe(ls, { attributes: true, attributeFilter: ['class'] });
      }
    }
    // 3.5) หน้า Super Admin: หัวน้ำเงินแบบหน้าแรก
    if (page === 'super-admin.html') document.body.classList.add('rm-admin');
    // 4) หน้าเข้าสู่ระบบ/สมัครของอาจารย์และแอดมิน
    if (/^(login|register-teacher|finish)\.html$/.test(page)) {
      document.body.classList.add('rm-auth');
      const wrap = document.querySelector('.content-layer > div');
      if (wrap && !document.querySelector('.rm-uni')) {
        const u = document.createElement('div');
        u.className = 'rm-uni';
        u.innerHTML = `ExamPro`;
        wrap.prepend(u);
      }
      [['6%', '18%', 1], ['88%', '12%', .7], ['80%', '72%', .5]].forEach(([l, t, s]) => {
        const h = document.createElement('i'); h.className = 'rm-hexdeco';
        h.style.left = l; h.style.top = t; h.style.transform = `scale(${s})`;
        document.body.appendChild(h);
      });
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();

// ลบอีโมจิและไอคอนประดับทั้งหมด (รวมข้อความที่มาจากฐานข้อมูล/ป๊อปอัป) ให้หน้าเว็บเหลือแต่ตัวหนังสือ
(function () {
  const EMO = /(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{2712}\u{2719}-\u{27BF}\u{2B50}\u{2B55}\u{231A}\u{231B}\u{23E9}-\u{23FA}\u{2139}\u{203C}\u{2049}][\u{FE0F}\u{1F3FB}-\u{1F3FF}]*\u{200D}?)+[ \t]?|\u{FE0F}/gu;
  const clean = v => String(v).replace(EMO, '');
  ['alert', 'confirm', 'prompt'].forEach(k => {
    const o = window[k]; if (typeof o !== 'function') return;
    window[k] = function (m, ...r) { return o.call(window, m == null ? m : clean(m), ...r); };
  });
  const SKIP = /^(SCRIPT|STYLE|TEXTAREA|INPUT|NOSCRIPT)$/i;
  const HOST = 'button,a,[role="button"],[onclick],label,select';
  // กล่องที่เหลือว่างหลังเอาไอคอนออก → ซ่อน (ไม่ซ่อนปุ่ม/ลิงก์ หรือกล่องที่มี id เพราะโค้ดอาจเติมข้อความทีหลัง)
  const hideEmpty = el => {
    for (let i = 0; i < 3 && el && el !== document.body; i++) {
      if (el.matches(HOST) || el.id || el.children.length || el.textContent.trim()) return;
      const p = el.parentElement; el.style.display = 'none'; el = p;
    }
  };
  const isIcon = svg => {
    const vb = (svg.getAttribute('viewBox') || '').trim();
    return /^0 0 (16|20|24|32) (16|20|24|32)$/.test(vb) || svg.classList.contains('ic') || svg.classList.contains('rm-ic');
  };
  function run(root) {
    // 1) อีโมจิในข้อความ
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const list = []; let t;
    // เนื้อหาข้อสอบ (โจทย์/ตัวเลือก/คำตอบ) ที่อาจารย์พิมพ์เอง ต้องแสดงตามจริง รวมอีโมจิ — ลบเฉพาะอีโมจิประดับของหน้าเว็บ
    const KEEP = '[data-keep-emoji],#questions-container,#questions-list-container,#rv-list,#modal-answer-sheet-content,#item-analysis-body,#answer-sheet-modal,#library-modal';
    while ((t = w.nextNode())) { EMO.lastIndex = 0; if (EMO.test(t.nodeValue) && t.parentElement && !SKIP.test(t.parentElement.tagName) && !t.parentElement.closest(KEEP)) list.push(t); }
    list.forEach(n => { n.nodeValue = clean(n.nodeValue); if (!n.nodeValue.trim()) hideEmpty(n.parentElement); });
    document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(i => { const p = i.getAttribute('placeholder'); EMO.lastIndex = 0; if (EMO.test(p)) i.setAttribute('placeholder', clean(p)); });
    EMO.lastIndex = 0; if (EMO.test(document.title)) document.title = clean(document.title);
    // 2) ไอคอนเส้น (SVG ขนาดไอคอน) — เก็บไว้เฉพาะปุ่มที่มีแต่ไอคอน (เช่น ปุ่มปิด ปุ่มดูรหัสผ่าน)
    root.querySelectorAll('svg').forEach(svg => {
      if (svg.closest('#intro,canvas,[data-keep-icon]') || !isIcon(svg)) return;
      const host = svg.closest(HOST);
      if (host && !host.textContent.trim()) return;
      const p = svg.parentElement; svg.remove(); if (p) hideEmpty(p);
    });
    // 3) กล่องไอคอนที่สร้างจากข้อมูลแล้วว่างเปล่า (กล่องขนาด w-8 ขึ้นไป ไม่ใช่วงกลมหมุนรอโหลด) → ซ่อน
    root.querySelectorAll('div[class*="w-"],span[class*="w-"]').forEach(el => {
      if (el.dataset.rmHid && (el.children.length || el.textContent.trim())) { el.style.display = ''; delete el.dataset.rmHid; return; }
      if (el.id || el.children.length || el.textContent.trim() || el.style.display === 'none') return;
      const c = ' ' + el.className + ' ';
      const w = c.match(/\sw-(\d+)\s/), h = c.match(/\sh-(\d+)\s/);
      if (!w || !h || +w[1] < 8 || /animate-spin|\sfixed\s|\sabsolute\s/.test(c)) return;
      if (!/text-(\dxl|xl|lg)\s|items-center/.test(c)) return;
      el.style.display = 'none'; el.dataset.rmHid = '1';
    });
  }
  let pending = false;
  const tick = () => { pending = false; run(document.body); };
  const start = () => {
    tick();
    new MutationObserver(() => { if (!pending) { pending = true; requestAnimationFrame(tick); } }).observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

// ===== หน้าว่างที่บอกทางต่อ: ยังไม่มีรายวิชา/ชุดข้อสอบ → แถบบอกขั้นถัดไปพร้อมปุ่มพาไป =====
(function () {
  const page = (location.pathname.split('/').pop() || '').toLowerCase();
  const NEED_COURSE = ['admin-students.html', 'admin-results.html', 'admin-rooms.html', 'admin-library.html', 'admin-monitoring.html', 'trinetra-report.html'];
  const NEED_EXAM = ['admin-rooms.html', 'admin-library.html'];
  if (!NEED_COURSE.includes(page)) return;
  const go = async () => {
    let courses = [];
    try { const r = await fetch('/api/teacher/courses'); if (!r.ok) return; courses = await r.json(); } catch (e) { return; }
    if (!Array.isArray(courses)) return;
    let b = null;
    if (courses.length === 0 && window.ExamTerm && ExamTerm.active()) b = { t: 'ไม่มีรายวิชาใน ' + ExamTerm.label(), d: 'เลือกปีการศึกษาหรือภาคอื่นที่แถบด้านบน หรือกดดูทุกปี', href: '#', cta: 'ดูทุกปี', reset: true };
    else if (courses.length === 0) b = { t: 'ยังไม่มีรายวิชา', d: 'เริ่มจากสร้างรายวิชาและเพิ่มรายชื่อนักศึกษาก่อน แล้วค่อยสร้างข้อสอบและเปิดห้องสอบ', href: 'admin-courses.html', cta: 'สร้างรายวิชา' };
    else if (NEED_EXAM.includes(page) && !courses.some(c => Number(c.examCount) > 0)) {
      // ห้องที่มีข้อสอบอยู่แล้ว (สร้างแบบเดิม) ถือว่ามีข้อสอบแล้ว ไม่ต้องเตือน
      let rooms = [];
      try { const rr = await fetch('/api/teacher/rooms'); if (rr.ok) rooms = await rr.json(); } catch (e) {}
      if (!(Array.isArray(rooms) && rooms.some(r => Number(r.questionCount) > 0)))
        b = { t: 'ยังไม่มีชุดข้อสอบ', d: 'ห้องสอบต้องใช้ชุดข้อสอบ สร้างชุดข้อสอบให้รายวิชาก่อน', href: 'admin-questions.html', cta: 'สร้างข้อสอบ' };
    }
    if (!b) return;
    const host = document.querySelector('main') || document.body;
    const el = document.createElement('div');
    el.className = 'ui-next';
    el.innerHTML = '<div><b></b><span></span></div><a></a>';
    el.querySelector('b').textContent = b.t; el.querySelector('span').textContent = b.d;
    const a = el.querySelector('a'); a.href = b.href; a.textContent = b.cta + ' →';
    if (b.reset) a.onclick = e => { e.preventDefault(); ExamTerm.reset(); };
    const st = document.createElement('style');
    st.textContent = '.ui-next{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin:0 0 18px;padding:16px 18px;border-radius:18px;background:#fff7ed;border:1.5px solid #fdba74;font-family:inherit;animation:uiIn .25s ease-out}' +
      '.ui-next b{display:block;font-size:16px;color:#9a3412}.ui-next span{display:block;margin-top:2px;font-size:14px;color:#7c2d12;line-height:1.55}' +
      '.ui-next a{flex:none;padding:11px 18px;border-radius:12px;background:#ff7a1a;color:#fff!important;font-weight:700;font-size:14.5px;text-decoration:none;box-shadow:0 10px 20px -10px rgba(255,122,26,.7)}' +
      '.ui-next a:hover{filter:brightness(1.05)}';
    document.head.appendChild(st);
    host.prepend(el);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();

// ===== ปุ่มที่ว่างเปล่าบนมือถือ (ไอคอนถูกลบ เหลือข้อความที่ซ่อนไว้บนจอเล็ก) → ให้ข้อความแสดงทุกขนาดจอ =====
(function () {
  const fix = () => {
    document.querySelectorAll('button, a[href], [role="button"]').forEach(b => {
      const own = [...b.childNodes].filter(n => !(n.nodeType === 1 && /(^|\s)hidden(\s|$)/.test(n.className || ''))).map(n => n.textContent).join('').trim();
      if (own) return;
      const sp = [...b.querySelectorAll('span')].find(s => /(^|\s)hidden(\s|$)/.test(s.className) && s.textContent.trim());
      if (sp) { sp.classList.remove('hidden'); return; }
      if (b.id === 'mobile-menu-btn' && !b.textContent.trim()) { b.textContent = 'เมนู'; b.setAttribute('aria-label', 'เปิดเมนู'); b.style.fontWeight = '700'; b.style.fontSize = '14px'; }
    });
  };
  const go = () => { fix(); setTimeout(fix, 1500); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
