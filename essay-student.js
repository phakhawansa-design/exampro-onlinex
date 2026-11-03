// 📝 แสดงผลตรวจอัตนัยให้นักเรียนในแท็บ "ประวัติ" ของ student-portal.html
(function () {
    const host = document.getElementById('tab-content-history');
    if (!host) return;
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const box = document.createElement('div');
    box.className = 'glass-card p-5 sm:p-6 shadow-xl space-y-4';
    box.innerHTML = '<h3 class="text-lg font-bold text-slate-800">📝 ผลตรวจข้อสอบอัตนัย</h3><div id="essay-fb" class="text-sm text-slate-500">กำลังโหลด...</div>';
    host.appendChild(box);
    const out = box.querySelector('#essay-fb');
    const tok = (window.AuthClient && AuthClient.studentToken()) || '';
    if (!tok) { out.innerHTML = 'ออกจากระบบแล้วเข้าสู่ระบบใหม่ 1 ครั้ง เพื่อดูผลตรวจอัตนัย'; return; }
    fetch('/api/student/essay-feedback').then(r => r.json().then(d => ({ ok: r.ok, d }))).then(({ ok, d }) => {
        if (!ok) { out.innerHTML = esc(d.message || 'โหลดไม่สำเร็จ') + ' (ลองออกจากระบบแล้วเข้าใหม่)'; return; }
        if (!d.length) { out.innerHTML = 'ยังไม่มีผลตรวจอัตนัยที่อาจารย์ยืนยันแล้ว'; return; }
        out.innerHTML = d.map(a => `
            <details class="border border-slate-200 rounded-xl p-4 mb-2 bg-white">
              <summary class="cursor-pointer flex justify-between gap-3"><b class="text-slate-800">${esc(a.title)}</b>
                <span class="font-bold text-indigo-700">${a.total} / ${a.max}</span></summary>
              <div class="mt-3 space-y-3">${a.items.map(i => `
                <div class="border-t pt-3"><div class="flex justify-between"><b>ข้อ ${i.no}</b><span>${i.score} / ${i.max}</span></div>
                  <p class="text-xs text-slate-500">${esc(i.prompt)}</p>
                  ${i.matched.length ? `<div class="text-xs text-emerald-700 mt-1">✓ ${i.matched.map(esc).join('<br>✓ ')}</div>` : ''}
                  ${i.missing.length ? `<div class="text-xs text-red-600 mt-1">✗ ควรเพิ่ม: ${i.missing.map(esc).join('<br>✗ ')}</div>` : ''}
                  ${i.reasoning ? `<div class="text-xs text-slate-600 mt-1">${esc(i.reasoning)}</div>` : ''}</div>`).join('')}
              </div></details>`).join('');
    }).catch(() => { out.innerHTML = 'โหลดผลตรวจอัตนัยไม่สำเร็จ'; });
})();
