// 🎨 theme.js — ใส่โลโก้ตรีเนตร e-Exam และปรับหน้าตาเล็กน้อย (ไม่แตะการทำงานของหน้า)
(function () {
  const LOGO = 'trinetra-logo.svg';
  const run = () => {
    const page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    // 1) เปลี่ยนโลโก้เดิมเป็นโลโก้ตรีเนตร
    document.querySelectorAll('img[src$="logo.png"], img[src$="logo_university.png"], img[src$="trinetra-logo.svg"]').forEach(img => {
      if (/logo_old/.test(img.getAttribute('src'))) return;
      img.src = LOGO; img.alt = 'ตรีเนตร e-Exam';
      img.style.objectFit = 'contain';
      if (img.closest('#sidebar')) img.parentElement.classList.add('rm-logo');
    });
    // 2) ชื่อใต้โลโก้ในแถบข้าง
    const sub = document.querySelector('#sidebar .logo-text > div:last-child');
    if (sub) sub.textContent = 'ตาที่ 3 ของอาจารย์';
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
        box.innerHTML = `<div class="rm-uni-s"><img src="${LOGO}" alt="">ตรีเนตร e-Exam · ตาที่ 3 ของอาจารย์</div>`;
        ls.parentElement.style.flexDirection = 'column';
        ls.parentElement.insertBefore(box, ls);
        // ซ่อนแถบชื่อระบบเมื่อเข้าสู่หน้าทำข้อสอบ
        new MutationObserver(() => { box.style.display = ls.classList.contains('hidden') ? 'none' : ''; }).observe(ls, { attributes: true, attributeFilter: ['class'] });
      }
    }
    // 3.5) หน้า Super Admin: หัวน้ำเงินแบบหน้าแรก
    if (page === 'super-admin.html') document.body.classList.add('rm-admin');
    // 4) หน้าเข้าสู่ระบบ/สมัครของอาจารย์และแอดมิน
    if (/^(teacher-login|admin-login|register-teacher|finish)\.html$/.test(page)) {
      document.body.classList.add('rm-auth');
      const wrap = document.querySelector('.content-layer > div');
      if (wrap && !document.querySelector('.rm-uni')) {
        const u = document.createElement('div');
        u.className = 'rm-uni';
        u.innerHTML = `<img src="${LOGO}" alt="">ตรีเนตร e-Exam · ตาที่ 3 ของอาจารย์`;
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

// 🎨 แทนอีโมจิด้วยไอคอนเส้น (ดูเป็นงานออกแบบ ไม่เหมือนอีโมจิ/AI)
(function () {
  const P = {
    doc: '<path d="M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V7.5z"/><path d="M14 3v4.5h4.5M9 12.5h6M9 16h3.5"/>',
    download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4.5 19.5h15"/>',
    chart: '<path d="M3.5 20.5h17M6.5 20.5v-6M11 20.5V9M15.5 20.5v-8.5M20 20.5V5"/>',
    spark: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    shield: '<path d="M12 3l7 3v5c0 4.6-3 8.1-7 10-4-1.9-7-5.4-7-10V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5M16.5 6.5l2.5 2.5M14.5 8.5l2 2"/>',
    bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    clip: '<rect x="5.5" y="4.5" width="13" height="16.5" rx="1.5"/><path d="M9 4.5V3.5h6v1M9 10h6M9 13.5h6M9 17h3.5"/>',
    pen: '<path d="M4 20l1-4.5L15.5 5a2 2 0 0 1 3 3L8 18.5z"/><path d="M13.5 7l3 3"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/>',
    cap: '<path d="M2.5 9.5L12 5l9.5 4.5L12 14z"/><path d="M6.5 11.6v4.2c3.2 2.3 7.8 2.3 11 0v-4.2M21.5 9.5v5"/>',
    board: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8.5 20h7M7 8.5h6M7 11.5h4"/>',
    left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    book: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
    save: '<path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    mega: '<path d="M4 10v4h3l7 4V6L7 10z"/><path d="M17.5 9a4 4 0 0 1 0 6"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    home: '<path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5"/>',
    folder: '<path d="M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4.5l2 2H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5v.1"/>',
    ok: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8"/>',
    no: '<circle cx="12" cy="12" r="8.5"/><path d="M9 9l6 6M15 9l-6 6"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1-4 4-6 7.5-6s6.5 2 7.5 6"/>',
    rocket: '<path d="M5 19l3.5-1 8-8c2-2 3-5 3-6.5-1.5 0-4.5 1-6.5 3l-8 8z"/><path d="M14.5 9.5h.01"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    cal: '<rect x="4" y="5.5" width="16" height="14.5" rx="1.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
    school: '<path d="M3 10.5L12 5l9 5.5M5 10v9.5h14V10M10 19.5v-5h4v5"/>',
    users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 19.5c.8-3.3 3.3-5 6.5-5s5.7 1.7 6.5 5"/><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18.5 14.8c1.6.8 2.6 2.4 3 4.7"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.5H15"/>',
    right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    phone: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
    tag: '<path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9z"/><circle cx="8" cy="8" r="1.3"/>',
    shuffle: '<path d="M3.5 7h4l9 10h4M3.5 17h4l2.5-2.8M14 9.8L16.5 7h4M18 4.5L20.5 7 18 9.5M18 14.5l2.5 2.5-2.5 2.5"/>',
    camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    stop: '<path d="M8.3 3.5h7.4l4.8 4.8v7.4l-4.8 4.8H8.3l-4.8-4.8V8.3z"/><path d="M9 9l6 6M15 9l-6 6"/>',
    screen: '<rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16.5V20"/>',
    inbox: '<path d="M3.5 13.5l3-8h11l3 8v6h-17z"/><path d="M3.5 13.5h5l1.5 2.5h4l1.5-2.5h5"/>',
    wave: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6c-2.4 0-3.8-1-5-2.6L3.5 13.5a1.5 1.5 0 0 1 2.4-1.8L8 14"/>'
  };
  const MAP = {
    '📝': 'doc', '📄': 'doc', '📑': 'doc', '📥': 'download', '⬇️': 'download', '📊': 'chart', '📈': 'chart',
    '🤖': 'spark', '✨': 'spark', '🛡️': 'shield', '🛡': 'shield', '🔒': 'lock', '🔐': 'lock', '🔑': 'key', '💡': 'bulb',
    '📋': 'clip', '✏️': 'pen', '✍️': 'pen', '🗑️': 'trash', '🎓': 'cap', '👩‍🏫': 'board', '👨‍🏫': 'board', '👈': 'left',
    '📚': 'book', '💾': 'save', '🎯': 'target', '📣': 'mega', '⏱️': 'clock', '⏳': 'clock', '🏠': 'home', '📂': 'folder',
    '📁': 'folder', '🔍': 'search', '⚠️': 'alert', '✅': 'ok', '❌': 'no', '👁️': 'eye', '👤': 'user', '🚀': 'rocket',
    '⚙️': 'gear', '⚙': 'gear', '➕': 'plus', '📅': 'cal', '📆': 'cal', '🏫': 'school', '👨‍🎓': 'user', '👩‍🎓': 'user', '🧑‍🎓': 'user', '👨': 'user', '👩': 'user',
    '👥': 'users', '🔄': 'refresh', '👉': 'right', '📘': 'book', '📗': 'book', '📕': 'book', '🚨': 'alert', '📢': 'mega', '📱': 'phone', '🏷️': 'tag', '🏷': 'tag',
    '🔀': 'shuffle', '📷': 'camera', '🛑': 'stop', '📺': 'screen', '🖥️': 'screen', '💻': 'screen', '🧹': 'trash', '📭': 'inbox', '📬': 'inbox', '🎉': 'spark', '👋': 'wave'
  };
  const keys = Object.keys(MAP).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const RE = new RegExp('(' + keys.join('|') + ')️?', 'g');
  const SKIP = /^(SCRIPT|STYLE|TEXTAREA|OPTION|SELECT|INPUT|TITLE|NOSCRIPT|svg|use|path)$/i;
  const svg = n => `<svg class="rm-ic" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;
  function swap(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: t => (!t.parentElement || SKIP.test(t.parentElement.tagName) || t.parentElement.closest('svg,[contenteditable]')) ? 2 : (RE.test(t.nodeValue) ? (RE.lastIndex = 0, 1) : 2) });
    const list = []; let t; while ((t = w.nextNode())) list.push(t);
    list.forEach(node => {
      const span = document.createElement('span');
      span.innerHTML = node.nodeValue.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(RE, (m, e) => svg(MAP[e] || MAP[e + '️'] || 'spark'));
      const frag = document.createDocumentFragment(); while (span.firstChild) frag.appendChild(span.firstChild);
      node.replaceWith(frag);
    });
  }
  let pending = false;
  const run = () => { pending = false; swap(document.body); };
  const start = () => {
    run();
    new MutationObserver(() => { if (!pending) { pending = true; requestAnimationFrame(run); } }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
