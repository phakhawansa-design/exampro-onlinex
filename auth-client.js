// 🔐 auth-client.js — แนบ token ให้ทุกคำขอ /api อัตโนมัติ และเก็บ token ตอนล็อกอิน
(function () {
    if (window.__authClient) return; window.__authClient = true;
    const K_T = 'auth_token', K_S = 'student_auth_token';
    const get = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
    const set = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} };
    const isStudentPage = /student|index\.html|finish\.html|quiz-ppt/i.test(location.pathname) && !/admin-students/i.test(location.pathname);
    window.AuthClient = { token: () => get(K_T), studentToken: () => get(K_S) };

    const orig = window.fetch.bind(window);

    // หน้าต่างบังคับตั้งรหัสผ่านใหม่ (ใช้สไตล์ในตัว ไม่พึ่ง CSS ของหน้า)
    function forceTeacherPw(oldPw) {
        return new Promise(done => {
            const d = document.createElement('div');
            d.id = 'tn-forcepw';
            d.innerHTML = '<div style="width:100%;max-width:400px;background:#fff;border-radius:20px;padding:24px 22px;box-shadow:0 30px 70px -20px rgba(0,0,0,.55);font-family:Kanit,Prompt,\'Leelawadee UI\',Tahoma,sans-serif;color:#0f1d3a">' +
                '<div style="width:54px;height:54px;border-radius:16px;background:#fff4e5;color:#e8663d;display:grid;place-items:center;margin:0 auto 10px;font-size:28px">🔐</div>' +
                '<h3 style="margin:0 0 6px;text-align:center;font-size:20px;color:#0d3b8e">ตั้งรหัสผ่านใหม่ก่อนใช้งาน</h3>' +
                '<p style="margin:0 0 14px;text-align:center;font-size:14px;line-height:1.6;color:#4a5872">บัญชีนี้ยังใช้รหัสผ่านเริ่มต้น (admin123) ซึ่งใครก็เดาได้ กรุณาตั้งรหัสใหม่อย่างน้อย 8 ตัวอักษร</p>' +
                '<input type="password" id="tn-fp1" placeholder="รหัสผ่านใหม่" autocomplete="new-password" style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #d6deea;border-radius:12px;font:inherit;font-size:15px;margin-bottom:10px">' +
                '<input type="password" id="tn-fp2" placeholder="พิมพ์รหัสผ่านใหม่อีกครั้ง" autocomplete="new-password" style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #d6deea;border-radius:12px;font:inherit;font-size:15px">' +
                '<div id="tn-fpe" style="min-height:20px;margin:8px 2px 0;font-size:13px;color:#d33"></div>' +
                '<button type="button" id="tn-fpb" style="width:100%;margin-top:6px;padding:13px;border:0;border-radius:12px;background:#0d3b8e;color:#fff;font:inherit;font-size:15.5px;font-weight:600;cursor:pointer">บันทึกรหัสผ่านใหม่</button></div>';
            d.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(2,11,38,.72);display:flex;align-items:center;justify-content:center;padding:18px';
            document.body.appendChild(d);
            const $ = id => document.getElementById(id), err = m => { $('tn-fpe').textContent = m; };
            setTimeout(() => $('tn-fp1').focus(), 50);
            const submit = async () => {
                const a = $('tn-fp1').value, b = $('tn-fp2').value;
                if (a.length < 8) return err('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร');
                if (a === 'admin123') return err('ห้ามใช้ admin123');
                if (a !== b) return err('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
                $('tn-fpb').disabled = true; $('tn-fpb').textContent = 'กำลังบันทึก...';
                try {
                    const r = await orig('/api/teacher/change-own-password', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + get(K_T) }, body: JSON.stringify({ oldPassword: oldPw, newPassword: a }) });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok || !j.success) throw new Error(j.message || 'บันทึกไม่สำเร็จ');
                    if (j.token) set(K_T, j.token);
                    d.remove(); done();
                } catch (e) { err(e.message); $('tn-fpb').disabled = false; $('tn-fpb').textContent = 'บันทึกรหัสผ่านใหม่'; }
            };
            $('tn-fpb').addEventListener('click', submit);
            d.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submit(); } });
        });
    }
    window.fetch = async function (input, init) {
        let url = typeof input === 'string' ? input : (input && input.url) || '';
        const isApi = /^(\/|https?:\/\/[^/]*\/)api\//.test(url) || url.startsWith('api/');
        if (isApi) {
            init = Object.assign({}, init);
            const h = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
            const studentApi = /\/api\/(student\/|submit-exam|report-cheat|get-warnings|mark-warning-read|log-student-login|get-questions)/.test(url);
            const tok = studentApi ? get(K_S) : get(K_T);
            if (tok && !h.has('Authorization')) h.set('Authorization', 'Bearer ' + tok);
            init.headers = h;
        }
        const res = await orig(input, init);
        if (isApi) {
            if (/\/api\/((teacher|superadmin|student)\/login|student\/register|student\/change-password|teacher\/change-own-password)/.test(url) && res.ok) {
                let d = null;
                try { d = await res.clone().json(); if (d && d.token) { set(d.student ? K_S : K_T, d.token); try { sessionStorage.removeItem('__authReload'); } catch (e) {} } } catch (e) {}
                // 🔐 แอดมินยังใช้รหัสเริ่มต้น → ต้องตั้งรหัสใหม่ก่อน หน้าเดิมจึงจะไปต่อได้
                if (d && d.success && d.mustChangePassword && !d.student) {
                    let oldPw = ''; try { oldPw = JSON.parse(init.body).password || ''; } catch (e) {}
                    await forceTeacherPw(oldPw);
                }
            }
            if ((res.status === 401 || res.status === 403) && isStudentPage && !/login|register|change-password/.test(url)) {
                res.clone().json().then(d => {
                    if (!d || window.__authRedirect || !(d.authRequired || d.mustChangePassword)) return;
                    window.__authRedirect = true;
                    if (d.authRequired) set(K_S, '');
                    alert(d.mustChangePassword ? 'กรุณาเปลี่ยนรหัสผ่านเริ่มต้นก่อนเข้าสอบ' : 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
                    if (d.authRequired) { try { localStorage.removeItem('currentStudent'); sessionStorage.removeItem('currentStudent'); } catch (e) {} }
                    if (/student-login/i.test(location.pathname)) { if (!sessionStorage.getItem('__authReload')) { sessionStorage.setItem('__authReload', '1'); location.reload(); } }
                    else location.href = 'Student-login.html' + location.search;
                }).catch(() => {});
            }
            if (res.status === 403 && !isStudentPage && !/login|change-own-password/.test(url)) {
                res.clone().json().then(d => {
                    if (d && d.mustChangePassword && !window.__authRedirect && !/login|register/i.test(location.pathname)) {
                        window.__authRedirect = true; set(K_T, '');
                        alert('กรุณาเข้าสู่ระบบและตั้งรหัสผ่านใหม่ก่อนใช้งาน');
                        location.href = 'admin-login.html';
                    }
                }).catch(() => {});
            }
            if (res.status === 401 && !isStudentPage && !/login/.test(url)) {
                res.clone().json().then(d => {
                    if (d && d.authRequired && !window.__authRedirect && !/login|register/i.test(location.pathname)) {
                        window.__authRedirect = true;
                        set(K_T, '');
                        alert('เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ กรุณาเข้าสู่ระบบใหม่');
                        location.href = get('admin_username') && /super-admin/.test(location.pathname) ? 'admin-login.html' : 'teacher-login.html';
                    }
                }).catch(() => {});
            }
        }
        return res;
    };
})();
