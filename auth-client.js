// 🔐 auth-client.js — แนบ token ให้ทุกคำขอ /api อัตโนมัติ และเก็บ token ตอนล็อกอิน
(function () {
    if (window.__authClient) return; window.__authClient = true;
    const K_T = 'auth_token', K_S = 'student_auth_token';
    const get = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
    const set = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} };
    const isStudentPage = /student|index\.html|finish\.html|quiz-ppt/i.test(location.pathname) && !/admin-students/i.test(location.pathname);
    window.AuthClient = { token: () => get(K_T), studentToken: () => get(K_S) };

    const orig = window.fetch.bind(window);
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
            if (/\/api\/((teacher|superadmin|student)\/login|student\/register|student\/change-password)/.test(url) && res.ok) {
                try { const d = await res.clone().json(); if (d && d.token) { set(d.student ? K_S : K_T, d.token); try { sessionStorage.removeItem('__authReload'); } catch (e) {} } } catch (e) {}
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
