/* ตรีเนตร e-Exam · ตัวสร้าง QR Code ในเว็บ (ไม่ส่งลิงก์ห้องสอบไปเว็บภายนอก)
 * รองรับโหมด byte (UTF-8) ระดับแก้ผิด L/M/Q/H รุ่น 1–40 ตามมาตรฐาน ISO/IEC 18004
 * ใช้งาน: TrinetraQR.svgDataUrl(text, { size: 250, ecl: 'M' }) หรือ TrinetraQR.matrix(text)
 */
(function (root) {
    'use strict';
    var ECC_CODEWORDS = {
        L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
        M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
        Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
        H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]
    };
    var NUM_BLOCKS = {
        L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
        M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
        Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
        H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]
    };
    var FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

    function rawModules(ver) {
        var r = (16 * ver + 128) * ver + 64;
        if (ver >= 2) { var n = Math.floor(ver / 7) + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36; }
        return r;
    }
    function dataCodewords(ver, ecl) { return Math.floor(rawModules(ver) / 8) - ECC_CODEWORDS[ecl][ver] * NUM_BLOCKS[ecl][ver]; }

    // ---- Reed-Solomon บน GF(256) ----
    function gfMul(x, y) { var z = 0; for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 0xFF; }
    function rsDivisor(deg) {
        var r = []; for (var i = 0; i < deg - 1; i++) r.push(0); r.push(1);
        var root = 1;
        for (i = 0; i < deg; i++) {
            for (var j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
            root = gfMul(root, 0x02);
        }
        return r;
    }
    function rsRemainder(data, div) {
        var r = div.map(function () { return 0; });
        data.forEach(function (b) {
            var f = b ^ r.shift(); r.push(0);
            div.forEach(function (c, i) { r[i] ^= gfMul(c, f); });
        });
        return r;
    }

    function utf8(s) {
        if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(s));
        var out = [], e = unescape(encodeURIComponent(s)); for (var i = 0; i < e.length; i++) out.push(e.charCodeAt(i)); return out;
    }

    function encode(text, ecl) {
        ecl = FORMAT_BITS.hasOwnProperty(ecl) ? ecl : 'M';
        var bytes = utf8(String(text)), ver, cap, ccBits;
        for (ver = 1; ver <= 40; ver++) {
            ccBits = ver < 10 ? 8 : 16;
            cap = dataCodewords(ver, ecl) * 8;
            if (4 + ccBits + bytes.length * 8 <= cap) break;
        }
        if (ver > 40) throw new Error('ข้อความยาวเกินกว่าจะทำเป็น QR');
        // บิตข้อมูล
        var bits = [];
        var put = function (v, n) { for (var i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
        put(4, 4); put(bytes.length, ccBits); bytes.forEach(function (b) { put(b, 8); });
        put(0, Math.min(4, cap - bits.length));
        put(0, (8 - bits.length % 8) % 8);
        for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
        var data = []; for (var i = 0; i < bits.length; i += 8) { var b = 0; for (var k = 0; k < 8; k++) b = (b << 1) | bits[i + k]; data.push(b); }

        // แบ่งบล็อก + ECC + สลับลำดับ
        var nb = NUM_BLOCKS[ecl][ver], eccLen = ECC_CODEWORDS[ecl][ver], raw = Math.floor(rawModules(ver) / 8);
        var nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), div = rsDivisor(eccLen), blocks = [], pos = 0;
        for (i = 0; i < nb; i++) {
            var dat = data.slice(pos, pos + shortLen - eccLen + (i < nShort ? 0 : 1)); pos += dat.length;
            var ecc = rsRemainder(dat, div);
            if (i < nShort) dat.push(0);
            blocks.push(dat.concat(ecc));
        }
        var all = [];
        for (i = 0; i < blocks[0].length; i++) for (var j = 0; j < nb; j++) if (i !== shortLen - eccLen || j >= nShort) all.push(blocks[j][i]);

        // วาดรูปแบบตายตัว
        var size = ver * 4 + 17, M = [], F = [];
        for (i = 0; i < size; i++) { M.push(new Array(size).fill(false)); F.push(new Array(size).fill(false)); }
        var setF = function (x, y, d) { M[y][x] = d; F[y][x] = true; };
        for (i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
        var finder = function (cx, cy) {
            for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
                var d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
                if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d !== 2 && d !== 4);
            }
        };
        finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
        if (ver > 1) {
            var na = Math.floor(ver / 7) + 2, step = Math.floor((ver * 8 + na * 3 + 5) / (na * 4 - 4)) * 2, al = [6];
            for (var p = size - 7; al.length < na; p -= step) al.splice(1, 0, p);
            for (i = 0; i < na; i++) for (j = 0; j < na; j++) {
                if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
                for (var dy2 = -2; dy2 <= 2; dy2++) for (var dx2 = -2; dx2 <= 2; dx2++) setF(al[i] + dx2, al[j] + dy2, Math.max(Math.abs(dx2), Math.abs(dy2)) !== 1);
            }
        }
        var drawFormat = function (mask) {
            var d = FORMAT_BITS[ecl] << 3 | mask, r = d;
            for (var t = 0; t < 10; t++) r = (r << 1) ^ ((r >>> 9) * 0x537);
            var fb = (d << 10 | r) ^ 0x5412, bit = function (n) { return ((fb >>> n) & 1) !== 0; };
            for (var q = 0; q <= 5; q++) setF(8, q, bit(q));
            setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8));
            for (q = 9; q < 15; q++) setF(14 - q, 8, bit(q));
            for (q = 0; q < 8; q++) setF(size - 1 - q, 8, bit(q));
            for (q = 8; q < 15; q++) setF(8, size - 15 + q, bit(q));
            setF(8, size - 8, true);
        };
        drawFormat(0);
        if (ver >= 7) {
            var r2 = ver; for (i = 0; i < 12; i++) r2 = (r2 << 1) ^ ((r2 >>> 11) * 0x1F25);
            var vb = ver << 12 | r2;
            for (i = 0; i < 18; i++) { var vbit = ((vb >>> i) & 1) !== 0, a = size - 11 + i % 3, c = Math.floor(i / 3); setF(a, c, vbit); setF(c, a, vbit); }
        }
        // วางข้อมูลแบบซิกแซก
        var bi = 0;
        for (var right = size - 1; right >= 1; right -= 2) {
            if (right === 6) right = 5;
            for (var v = 0; v < size; v++) for (j = 0; j < 2; j++) {
                var x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
                if (!F[y][x] && bi < all.length * 8) { M[y][x] = ((all[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0; bi++; }
            }
        }
        // เลือก mask ที่ได้คะแนนโทษต่ำสุด
        var maskFn = [
            function (x, y) { return (x + y) % 2 === 0; }, function (x, y) { return y % 2 === 0; },
            function (x) { return x % 3 === 0; }, function (x, y) { return (x + y) % 3 === 0; },
            function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
            function (x, y) { return x * y % 2 + x * y % 3 === 0; },
            function (x, y) { return (x * y % 2 + x * y % 3) % 2 === 0; },
            function (x, y) { return ((x + y) % 2 + x * y % 3) % 2 === 0; }
        ];
        var applyMask = function (m) { for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) if (!F[yy][xx] && maskFn[m](xx, yy)) M[yy][xx] = !M[yy][xx]; };
        var best = 0, bestScore = Infinity;
        for (var m = 0; m < 8; m++) {
            applyMask(m); drawFormat(m);
            var s = penalty(M, size);
            if (s < bestScore) { bestScore = s; best = m; }
            applyMask(m);
        }
        applyMask(best); drawFormat(best);
        return M;
    }

    function penalty(M, n) {
        var s = 0, x, y, run, i;
        var lines = function (get) {
            for (var a = 0; a < n; a++) {
                run = 1;
                for (var b = 1; b < n; b++) {
                    if (get(a, b) === get(a, b - 1)) { run++; if (run === 5) s += 3; else if (run > 5) s++; }
                    else run = 1;
                }
                // รูปแบบคล้าย finder 1:1:3:1:1 พร้อมขอบขาว 4 ช่อง
                for (b = 0; b + 10 < n; b++) {
                    var p1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], p2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1], ok1 = true, ok2 = true;
                    for (i = 0; i < 11; i++) { var v = get(a, b + i) ? 1 : 0; if (v !== p1[i]) ok1 = false; if (v !== p2[i]) ok2 = false; }
                    if (ok1) s += 40; if (ok2) s += 40;
                }
            }
        };
        lines(function (a, b) { return M[a][b]; });
        lines(function (a, b) { return M[b][a]; });
        for (y = 0; y < n - 1; y++) for (x = 0; x < n - 1; x++) { var c = M[y][x]; if (c === M[y][x + 1] && c === M[y + 1][x] && c === M[y + 1][x + 1]) s += 3; }
        var dark = 0; for (y = 0; y < n; y++) for (x = 0; x < n; x++) if (M[y][x]) dark++;
        s += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
        return s;
    }

    function svg(text, opt) {
        opt = opt || {};
        var M = encode(text, opt.ecl || 'M'), n = M.length, q = 4, w = n + q * 2, d = '';
        for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (M[y][x]) d += 'M' + (x + q) + ' ' + (y + q) + 'h1v1h-1z';
        var px = opt.size || 250;
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + w + '" width="' + px + '" height="' + px + '" shape-rendering="crispEdges">' +
            '<rect width="' + w + '" height="' + w + '" fill="#fff"/><path fill="' + (opt.color || '#000') + '" d="' + d + '"/></svg>';
    }
    function svgDataUrl(text, opt) { return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(text, opt)); }

    root.TrinetraQR = { matrix: encode, svg: svg, svgDataUrl: svgDataUrl };
})(typeof window !== 'undefined' ? window : globalThis);
