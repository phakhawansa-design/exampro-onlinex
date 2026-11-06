/* ตรีเนตร e-Exam · กันการเปิดหน้าสอบในเบราว์เซอร์ของแอปแชต (LINE, Facebook, Messenger, IG, TikTok ฯลฯ)
 * เบราว์เซอร์ในแอปเหล่านี้แจ้งเหตุการณ์สลับหน้าจอได้ไม่ครบ ระบบตาเฝ้าจึงตรวจจับไม่ได้
 *  - LINE: ส่งต่อไปเปิดใน Safari/Chrome อัตโนมัติด้วย openExternalBrowser=1
 *  - แอปอื่น: ขึ้นหน้าแนะนำวิธีเปิดในเบราว์เซอร์หลัก พร้อมปุ่มคัดลอกลิงก์ / เปิดใน Chrome (Android)
 * หน้าในแอปจะถูกปิดทับไว้เสมอ จึงใช้สอบต่อในแอปไม่ได้แม้การส่งต่อจะไม่สำเร็จ
 */
(function () {
    'use strict';
    var ua = navigator.userAgent || '';
    var isAndroid = /Android/i.test(ua), isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    var apps = [
        ['LINE', /\bLine\//i],
        ['Messenger', /FBAN\/Messenger|MessengerForiOS|FB_IAB\/Orca|\bMessenger\b/i],
        ['Facebook', /FBAN|FBAV|FB_IAB|FBIOS|FB4A/i],
        ['Instagram', /Instagram/i],
        ['TikTok', /musical_ly|Bytedance|TikTok|BytedanceWebview/i],
        ['WeChat', /MicroMessenger/i],
        ['X (Twitter)', /Twitter/i],
        ['Discord', /Discord/i],
        ['Telegram', /Telegram/i]
    ];
    var app = null;
    for (var i = 0; i < apps.length; i++) if (apps[i][1].test(ua)) { app = apps[i][0]; break; }
    // WebView ทั่วไปที่ไม่ระบุชื่อแอป
    if (!app && isAndroid && /;\s*wv\)/.test(ua)) app = 'แอปนี้';
    if (!app && isIOS && !/Safari\//.test(ua) && !navigator.standalone && /AppleWebKit/.test(ua)) app = 'แอปนี้';
    if (!app) return;

    window.__TRINETRA_INAPP = app;
    var url = location.href;

    // โหมดเบา (<script src="inapp-guard.js" data-soft>) สำหรับหน้าที่ไม่ใช่หน้าสอบ เช่น หน้าแรก:
    // LINE → ส่งต่อไปเบราว์เซอร์หลักครั้งเดียว แต่ไม่ปิดทับหน้า (อาจารย์ยังดูหน้าเว็บใน LINE ได้)
    var me = document.currentScript;
    if (me && me.hasAttribute('data-soft')) {
        if (app === 'LINE' && !/[?&]openExternalBrowser=1/.test(location.search)) {
            try { var su = new URL(url); su.searchParams.set('openExternalBrowser', '1'); location.replace(su.toString()); } catch (e) { }
        }
        return;
    }

    // LINE: ส่งต่อไปเบราว์เซอร์หลักทันที (ยังปิดทับหน้านี้ไว้ ถ้า LINE ไม่ยอมเปิดให้)
    var lineTried = false;
    if (app === 'LINE' && !/[?&]openExternalBrowser=1/.test(location.search)) {
        var u = new URL(url);
        u.searchParams.set('openExternalBrowser', '1');
        url = u.toString();
        lineTried = true;
        try { location.replace(url); } catch (e) { }
    } else if (app === 'LINE') {
        // มีพารามิเตอร์แล้วแต่ยังอยู่ใน LINE (เช่น สแกน QR ด้วยกล้องใน LINE, เปิดจากโน้ต/อัลบั้ม หรือ LINE รุ่นเก่า)
        // LINE อ่านพารามิเตอร์ตอนแตะลิงก์ในแชตเท่านั้น จึงลองเปลี่ยนหน้าอีกครั้ง 1 ครั้ง (กันวนซ้ำด้วย sessionStorage)
        url = location.href;
        var retried = true;
        try { retried = sessionStorage.getItem('tn_line_ext') === '1'; if (!retried) sessionStorage.setItem('tn_line_ext', '1'); } catch (e) { }
        if (!retried) {
            var u2 = new URL(url);
            u2.searchParams.set('tnx', Date.now().toString(36));
            lineTried = true;
            try { location.replace(u2.toString()); } catch (e) { }
        }
    }

    function chromeIntent(href) {
        var u = new URL(href);
        return 'intent://' + u.host + u.pathname + u.search + u.hash + '#Intent;scheme=' + u.protocol.replace(':', '') +
            ';package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(href) + ';end';
    }

    function copy(text, btn) {
        var done = function () { btn.textContent = '✓ คัดลอกลิงก์แล้ว นำไปวางใน Chrome/Safari'; btn.classList.add('ok'); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, fallback);
        } else fallback();
        function fallback() {
            var t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', '');
            t.style.cssText = 'position:fixed;top:0;left:0;opacity:0'; document.body.appendChild(t); t.select();
            try { document.execCommand('copy'); done(); } catch (e) { prompt('คัดลอกลิงก์นี้ไปเปิดใน Chrome/Safari', text); }
            t.remove();
        }
    }

    function show() {
        if (document.getElementById('tn-inapp')) return;
        var st = document.createElement('style');
        st.textContent =
            '#tn-inapp{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;' +
            'background:radial-gradient(ellipse at 50% 30%,#0d3b8e 0,#061a4a 60%,#020b26 100%);font-family:Kanit,Prompt,"Leelawadee UI",Tahoma,sans-serif;color:#0f1d3a;overflow:auto}' +
            '#tn-inapp .bx{width:100%;max-width:420px;background:#fff;border-radius:22px;padding:26px 22px 22px;box-shadow:0 30px 70px -20px rgba(0,0,0,.6);text-align:center}' +
            '#tn-inapp .ic{width:64px;height:64px;margin:0 auto 12px;border-radius:18px;display:grid;place-items:center;background:#fff4e5;color:#e8663d}' +
            '#tn-inapp h2{margin:0 0 6px;font-size:21px;line-height:1.35;color:#0d3b8e}' +
            '#tn-inapp p{margin:0 0 14px;font-size:14.5px;line-height:1.6;color:#4a5872}' +
            '#tn-inapp .st{text-align:left;background:#f3f6fb;border-radius:14px;padding:12px 14px;margin:0 0 16px;font-size:14px;line-height:1.65;color:#22324f}' +
            '#tn-inapp .st b{color:#0d3b8e}' +
            '#tn-inapp button,#tn-inapp a.bt{display:block;width:100%;box-sizing:border-box;border:0;border-radius:14px;padding:13px 14px;margin-top:10px;font-weight:600;font-size:15.5px;font-family:inherit;cursor:pointer;text-decoration:none}' +
            '#tn-inapp .pr{background:#e8663d;color:#fff}#tn-inapp .sc{background:#e9eef7;color:#0d3b8e}#tn-inapp .ok{background:#10a36a!important;color:#fff!important}' +
            '#tn-inapp .ft{margin-top:14px;font-size:12px;color:#8a96ab}';
        document.head.appendChild(st);

        var steps = isIOS
            ? 'แตะปุ่ม <b>•••</b> หรือ <b>⤴︎ แชร์</b> มุมจอ แล้วเลือก <b>"เปิดใน Safari"</b> / <b>"Open in browser"</b>'
            : 'แตะปุ่ม <b>⋮</b> มุมขวาบน แล้วเลือก <b>"เปิดในเบราว์เซอร์"</b> / <b>"Open in Chrome"</b>';
        var lead = (app === 'LINE' && lineTried)
            ? 'ระบบกำลังส่งไปเปิดใน ' + (isIOS ? 'Safari' : 'Chrome') + ' ให้อัตโนมัติ ถ้ายังไม่เด้ง ให้ทำตามขั้นตอนด้านล่าง'
            : 'การสอบต้องเปิดใน ' + (isIOS ? 'Safari' : 'Chrome') + ' เท่านั้น เพราะเบราว์เซอร์ใน ' + app + ' ตรวจจับการสลับหน้าจอไม่ได้';

        var d = document.createElement('div');
        d.id = 'tn-inapp';
        d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true');
        d.innerHTML =
            '<div class="bx">' +
            '<div class="ic"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg></div>' +
            '<h2>กรุณาเปิดหน้าสอบใน<br>' + (isIOS ? 'Safari' : 'Chrome') + '</h2>' +
            '<p>' + lead + '</p>' +
            '<div class="st">' + steps + '</div>' +
            (app === 'LINE' ? '<a class="bt pr" id="tn-go" href="' + url.replace(/"/g, '&quot;') + '">เปิดในเบราว์เซอร์อีกครั้ง</a>' : '') +
            (isAndroid ? '<a class="bt ' + (app === 'LINE' ? 'sc' : 'pr') + '" href="' + chromeIntent(url).replace(/"/g, '&quot;') + '">เปิดใน Chrome</a>' : '') +
            '<button type="button" class="' + (app === 'LINE' || isAndroid ? 'sc' : 'pr') + '" id="tn-copy">คัดลอกลิงก์ไปเปิดเอง</button>' +
            '<div class="ft">ตรีเนตร e-Exam · ตาเฝ้าทำงานได้เต็มที่เฉพาะในเบราว์เซอร์หลัก</div>' +
            '</div>';
        document.body.appendChild(d);
        document.documentElement.style.overflow = 'hidden';
        document.getElementById('tn-copy').addEventListener('click', function () { copy(url, this); });
        // กันไม่ให้สคริปต์หน้าเดิมเอาออก
        new MutationObserver(function () { if (!document.getElementById('tn-inapp')) document.body.appendChild(d); })
            .observe(document.body, { childList: true });
    }

    if (document.body) show();
    else document.addEventListener('DOMContentLoaded', show);
})();
