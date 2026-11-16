// theme.js — ใส่โลโก้ ExamPro และปรับหน้าตาเล็กน้อย (ไม่แตะการทำงานของหน้า)
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
    while ((t = w.nextNode())) { EMO.lastIndex = 0; if (EMO.test(t.nodeValue) && t.parentElement && !SKIP.test(t.parentElement.tagName)) list.push(t); }
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
