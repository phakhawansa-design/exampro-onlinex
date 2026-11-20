// =====================================================================
// ExamPro · เลือกปีการศึกษาและภาคเรียน (ใช้ร่วมกันทุกหน้าของอาจารย์)
// ---------------------------------------------------------------------
// - ตัวเลือกอยู่ที่แถบด้านบนของทุกหน้า (ใต้ชื่อหน้า) จำค่าไว้ในเครื่อง
// - กรองข้อมูลที่หน้าเว็บดึงมา: รายวิชา, ห้องสอบ, รายชื่อนักศึกษา, ผลสอบ/ประวัติสลับหน้าจอแบบรวม
//   ตามภาคเรียนของรายวิชา (ค่า semester เช่น "2/2569", "ฤดูร้อน/2569", "พิเศษ/2569")
// - รายวิชาที่ไม่ได้ระบุปีหรือภาค จะแสดงทุกตัวเลือก (ไม่ให้ข้อมูลหาย)
// - ค่าเริ่มต้น = ทุกปี ทุกภาค
// ต้องโหลดหลัง auth-client.js และก่อนสคริปต์ของหน้า
// =====================================================================
(function () {
    const page = (location.pathname.split('/').pop() || '').toLowerCase();
    const PAGES = ['dashboard.html', 'admin-courses.html', 'admin-students.html', 'admin-questions.html', 'admin-library.html',
        'admin-rooms.html', 'admin-results.html', 'admin-monitoring.html', 'trinetra-report.html'];
    if (!PAGES.includes(page)) return;

    const KEY = 'exampro_term_scope';
    const YEARS = []; for (let y = 2567; y <= 2580; y++) YEARS.push(String(y));
    const TERMS = { '1': 'ภาคการศึกษาที่ 1', '2': 'ภาคการศึกษาที่ 2', '3': 'ภาคการศึกษาฤดูร้อน', '4': 'ภาคการศึกษาพิเศษ' };

    const DEF_KEY = 'exampro_term_default';
    const clean = v => ({ y: YEARS.includes(String(v && v.y)) ? String(v.y) : 'all', t: TERMS[String(v && v.t)] ? String(v.t) : 'all' });
    function readJSON(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
    // ค่าเริ่มต้นที่แอดมินตั้ง (เก็บสำเนาไว้ในเครื่อง แล้วตรวจกับเซิร์ฟเวอร์ทุกครั้งที่เปิดหน้า)
    const def = (() => { const d = readJSON(DEF_KEY); return { ...clean(d), v: Number(d && d.v) || 0 }; })();
    function load() {
        const own = readJSON(KEY);
        // อาจารย์เลือกเองหลังจากแอดมินตั้งค่ารอบล่าสุด → ใช้ค่าของอาจารย์ · ไม่งั้นใช้ค่าเริ่มต้นของแอดมิน
        if (own && Number(own.v || 0) === def.v) return clean(own);
        return clean(def);
    }
    const scope = load();
    const isDefault = () => scope.y === def.y && scope.t === def.t;
    const active = () => scope.y !== 'all' || scope.t !== 'all';

    // "2/2569" → { t:'2', y:'2569' } · "1/68" → ปี 2568 · "ฤดูร้อน/2569" → t:'3' · "พิเศษ/2569" → t:'4'
    function parseSem(sem) {
        const s = String(sem || '').trim();
        let t = '', y = '';
        const ym = s.match(/(25\d{2})/) || s.match(/\/\s*(\d{2})\s*$/);
        if (ym) y = ym[1].length === 2 ? '25' + ym[1] : ym[1];
        if (/พิเศษ|special/i.test(s)) t = '4';
        else if (/ฤดูร้อน|summer/i.test(s)) t = '3';
        else {
            const m = s.match(/^([1-3])$/) || s.match(/(?:^|[^0-9])([1-3])\s*\/\s*\d{2,4}/) || s.match(/(?:เทอม|ภาค(?:เรียน|การศึกษา)?(?:ที่)?)\s*([1-3])/);
            if (m) t = m[1];
        }
        return { t, y };
    }
    function courseInScope(c) {
        if (!active()) return true;
        const p = parseSem(c && c.semester);
        return (scope.y === 'all' || !p.y || p.y === scope.y) && (scope.t === 'all' || !p.t || p.t === scope.t);
    }
    function label() {
        if (!active()) return 'ทุกปีการศึกษา';
        return [scope.t !== 'all' ? TERMS[scope.t] : 'ทุกภาค', scope.y !== 'all' ? 'ปีการศึกษา ' + scope.y : 'ทุกปีการศึกษา'].join(' · ');
    }
    function set(y, t) {
        try { localStorage.setItem(KEY, JSON.stringify({ y, t, v: def.v })); } catch (e) {}
        location.reload();
    }

    window.ExamTerm = { active, label, parseSem, courseInScope, scope: () => ({ ...scope }), set, reset: () => set('all', 'all'), useDefault: () => set(def.y, def.t), defaults: () => ({ ...def }), terms: TERMS, years: YEARS };

    // ===== กรองข้อมูลที่ดึงจากเซิร์ฟเวอร์ =====
    const orig = window.fetch.bind(window);
    let coursesP = null;
    const allowedCourseIds = () => {
        if (!coursesP) coursesP = orig('/api/teacher/courses?username=' + encodeURIComponent(localStorage.getItem('teacher_username') || ''))
            .then(r => r.ok ? r.json() : []).catch(() => [])
            .then(cs => ({ all: new Set((Array.isArray(cs) ? cs : []).map(c => Number(c.id))), ok: new Set((Array.isArray(cs) ? cs : []).filter(courseInScope).map(c => Number(c.id))) }));
        return coursesP;
    };
    // แถวที่ผูกกับรายวิชา: แสดงถ้ารายวิชาอยู่ในภาคที่เลือก · ไม่ผูกรายวิชา (0/ว่าง) หรือรายวิชาที่ไม่รู้จัก → แสดง
    const keepByCourse = (ids, cid) => { const n = Number(cid) || 0; return !n || !ids.all.has(n) || ids.ok.has(n); };

    function rewrite(res, filterFn) {
        return res.clone().json().then(async data => {
            if (!Array.isArray(data)) return res;
            const out = await filterFn(data);
            const headers = new Headers(res.headers); headers.delete('content-length');
            return new Response(JSON.stringify(out), { status: res.status, statusText: res.statusText, headers });
        }).catch(() => res);
    }

    window.fetch = async function (input, init) {
        const res = await orig(input, init);
        try {
            if (!active() || !res.ok) return res;
            const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
            if (method !== 'GET') return res;
            const u = new URL(typeof input === 'string' ? input : input.url, location.href);
            const p = u.pathname, q = u.searchParams;
            if (p === '/api/teacher/courses') return rewrite(res, rows => rows.filter(courseInScope));
            if (p === '/api/teacher/rooms') return rewrite(res, async rows => { const ids = await allowedCourseIds(); return rows.filter(r => keepByCourse(ids, r.courseId)); });
            if (p === '/api/students' && (!q.get('courseId') || q.get('courseId') === 'ALL')) return rewrite(res, async rows => { const ids = await allowedCourseIds(); return rows.filter(r => keepByCourse(ids, r.courseId)); });
            if ((p === '/api/exam-results' || p === '/api/cheat-logs') && q.get('roomId') === 'ALL') return rewrite(res, async rows => { const ids = await allowedCourseIds(); return rows.filter(r => keepByCourse(ids, r.courseId)); });
        } catch (e) {}
        return res;
    };

    // ===== ตัวเลือกบนแถบด้านบน =====
    function css() {
        const st = document.createElement('style');
        st.textContent = '.ts-bar{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px}' +
            '.ts-bar label{font-size:12px;font-weight:600;color:#64748b}' +
            '.ts-sel{appearance:none;-webkit-appearance:none;padding:4px 26px 4px 10px;border:1.5px solid #cbd5e1;border-radius:9px;background:#fff url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23334155\' stroke-width=\'2.6\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'m6 9 6 6 6-6\'/%3E%3C/svg%3E") no-repeat right 8px center/12px;' +
            'font-family:inherit;font-size:13px;font-weight:700;color:#0f172a;cursor:pointer;line-height:1.5}' +
            '.ts-sel:hover{border-color:#94a3b8}.ts-sel:focus{outline:none;border-color:#1d5fd6;box-shadow:0 0 0 3px rgba(29,95,214,.18)}' +
            
            '.ts-def{border:0;background:#fff1e4;border-radius:8px;padding:3px 8px;font-family:inherit;font-size:12px;font-weight:700;color:#b4500c;cursor:pointer}.top .ts-def{background:rgba(255,255,255,.15);color:#ffd0a6}' +
            '.ts-clear{border:0;background:none;padding:2px 4px;font-family:inherit;font-size:12px;font-weight:700;color:#1d5fd6;text-decoration:underline;cursor:pointer}' +
            '@media (max-width:640px){.ts-sel{font-size:16px;padding:6px 28px 6px 10px}}';
        document.head.appendChild(st);
    }
    function build() {
        const box = document.createElement('div');
        box.className = 'ts-bar' + (active() ? ' on' : '');
        box.setAttribute('role', 'group'); box.setAttribute('aria-label', 'เลือกปีการศึกษาและภาคเรียน');
        box.innerHTML =
            '<label for="ts-year">ปีการศึกษา</label><select id="ts-year" class="ts-sel"><option value="all">ทุกปี</option>' + YEARS.map(y => '<option value="' + y + '">' + y + '</option>').join('') + '</select>' +
            '<label for="ts-term">ภาค</label><select id="ts-term" class="ts-sel"><option value="all">ทุกภาค</option>' + Object.keys(TERMS).map(k => '<option value="' + k + '">' + TERMS[k] + '</option>').join('') + '</select>' +
            (!isDefault() && (def.y !== 'all' || def.t !== 'all') ? '<button type="button" class="ts-def" title="กลับไปใช้ปี/ภาคที่ผู้ดูแลระบบตั้งไว้">ค่าเริ่มต้น</button>' : '') +
            (active() ? '<button type="button" class="ts-clear">ดูทั้งหมด</button>' : '');
        box.querySelector('#ts-year').value = scope.y;
        box.querySelector('#ts-term').value = scope.t;
        box.querySelector('#ts-year').onchange = e => set(e.target.value, scope.t);
        box.querySelector('#ts-term').onchange = e => set(scope.y, e.target.value);
        const clr = box.querySelector('.ts-clear'); if (clr) clr.onclick = () => set('all', 'all');
        const dft = box.querySelector('.ts-def'); if (dft) dft.onclick = () => set(def.y, def.t);
        if (isDefault() && (def.y !== 'all' || def.t !== 'all')) box.title = 'ปี/ภาคเริ่มต้นที่ผู้ดูแลระบบตั้งไว้ · เปลี่ยนเองได้';
        return box;
    }
    function mount() {
        if (document.querySelector('.ts-bar')) return;
        css();
        const bar = build();
        // 1) หน้าที่มีบรรทัด "ExamPro · ประจำภาคการศึกษาปัจจุบัน" → แทนที่ด้วยตัวเลือก
        const sub = [...document.querySelectorAll('#top-header p')].find(p => /ภาคการศึกษา|ExamPro/.test(p.textContent));
        if (sub) { sub.replaceWith(bar); return; }
        // 2) แถบบนแบบอื่น: วางใต้ชื่อหน้า
        const h1 = document.querySelector('#top-header h1') || document.querySelector('.qx-title h1') || document.querySelector('header .top h1') || document.querySelector('header h1');
        if (h1) { (h1.parentElement.matches('header, .top') ? h1 : h1.parentElement).insertAdjacentElement('afterend', bar); }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();

    orig('/api/settings/term-default').then(r => r.ok ? r.json() : null).then(d => {
        if (!d || Number(d.v || 0) === def.v) return;
        try { localStorage.setItem(DEF_KEY, JSON.stringify({ ...clean(d), v: Number(d.v) || 0 })); } catch (e) { return; }
        const nd = clean(d);
        const own = readJSON(KEY);
        const ownStillValid = own && Number(own.v || 0) === (Number(d.v) || 0);
        const next = ownStillValid ? clean(own) : nd;
        if ((next.y !== scope.y || next.t !== scope.t) && !sessionStorage.getItem('ts_reloaded_' + d.v)) {
            try { sessionStorage.setItem('ts_reloaded_' + d.v, '1'); } catch (e) {}
            location.reload();
        }
    }).catch(() => {});
})();
