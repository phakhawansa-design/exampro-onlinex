/* ตรีเนตร e-Exam · รหัสระบุตัวตนบนกระดาษคำตอบ (Trinetra Mark)
 * สี่เหลี่ยมกรอบดำ + ตาราง 8×6 ช่อง = 48 บิต พิมพ์ที่มุมขวาบนของกระดาษคำตอบทุกแผ่น
 *   [รุ่น 2 บิต][รหัสงาน 14 บิต][รหัสแถวในรายชื่อรายวิชา 20 บิต][เลขแผ่น 4 บิต][CRC-8 8 บิต]
 * ใช้ได้ทั้งตอนสร้าง (svg) และตอนอ่านจากภาพสแกน (decodeCanvas) ไม่ต้องพึ่งไลบรารีภายนอก
 */
(function (root) {
    'use strict';
    const COLS = 8, ROWS = 6, FW = 11, FH = 9, CELL_MM = 3, VER = 1;

    function crc8(bits) {
        let c = 0;
        for (let i = 0; i < bits.length; i += 8) {
            let b = 0;
            for (let j = 0; j < 8; j++) b = (b << 1) | (bits[i + j] || 0);
            c ^= b;
            for (let k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
        }
        return c;
    }
    const put = (arr, v, n) => { for (let i = n - 1; i >= 0; i--) arr.push((v >>> i) & 1); };
    const take = (bits, at, n) => { let v = 0; for (let i = 0; i < n; i++) v = v * 2 + bits[at + i]; return v; };

    function encode(o) {
        const aid = Number(o.assignmentId), rid = Number(o.rosterId), page = Number(o.page || 1);
        if (!(aid >= 0 && aid < 16384)) throw new Error('รหัสงานเกินช่วงที่รองรับ');
        if (!(rid >= 0 && rid < 1048576)) throw new Error('รหัสนักศึกษาในระบบเกินช่วงที่รองรับ');
        if (!(page >= 1 && page <= 16)) throw new Error('รองรับสูงสุด 16 แผ่นต่อคน');
        const bits = [];
        put(bits, VER, 2); put(bits, aid, 14); put(bits, rid, 20); put(bits, page - 1, 4);
        put(bits, crc8(bits), 8);
        return bits;
    }
    function parse(bits) {
        if (bits.length !== 48) return null;
        if (crc8(bits.slice(0, 40)) !== take(bits, 40, 8)) return null;
        if (take(bits, 0, 2) !== VER) return null;
        return { assignmentId: take(bits, 2, 14), rosterId: take(bits, 16, 20), page: take(bits, 36, 4) + 1 };
    }

    /* ---------- สร้าง SVG (ขนาดจริงเป็นมิลลิเมตร) ---------- */
    function svg(o) {
        const bits = encode(o);
        let cells = '';
        bits.forEach((b, i) => { if (b) cells += `M${1.5 + (i % COLS)} ${1.5 + Math.floor(i / COLS)}h1v1h-1z`; });
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${FW} ${FH}" width="${FW * CELL_MM}mm" height="${FH * CELL_MM}mm" shape-rendering="crispEdges" style="display:block">` +
            `<rect width="${FW}" height="${FH}" fill="#fff"/>` +
            `<path fill="#000" fill-rule="evenodd" d="M0 0H${FW}V${FH}H0z M1 1V${FH - 1}H${FW - 1}V1z"/>` +
            `<path fill="#000" d="${cells}"/></svg>`;
    }

    /* ---------- อ่านจากภาพ ---------- */
    function homography(src, dst) { // หา H ที่แปลง src(x,y) → dst(u,v) จาก 4 จุด
        const A = [], b = [];
        for (let i = 0; i < 4; i++) {
            const [x, y] = src[i], [u, v] = dst[i];
            A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
            A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
        }
        for (let c = 0; c < 8; c++) {
            let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
            [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
            if (Math.abs(A[c][c]) < 1e-12) return null;
            for (let r = 0; r < 8; r++) if (r !== c) {
                const f = A[r][c] / A[c][c];
                for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
                b[r] -= f * b[c];
            }
        }
        const h = b.map((v, i) => v / A[i][i]);
        return (x, y) => { const w = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; };
    }

    function otsu(g, idx) {
        const hist = new Uint32Array(256);
        for (const i of idx) hist[g[i]]++;
        const total = idx.length; let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
        let sB = 0, wB = 0, best = 0, th = 128;
        for (let t = 0; t < 256; t++) {
            wB += hist[t]; if (!wB) continue; const wF = total - wB; if (!wF) break;
            sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
            if (v > best) { best = v; th = t; }
        }
        return th;
    }

    // หาเครื่องหมายในพื้นที่ [x0,y0,x1,y1] ของภาพสีเทา g (กว้าง W)
    function findInRegion(g, W, H, x0, y0, x1, y1, pxPerMm) {
        x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0); x1 = Math.min(W, x1 | 0); y1 = Math.min(H, y1 | 0);
        const rw = x1 - x0, rh = y1 - y0; if (rw < 20 || rh < 20) return null;
        const idx = []; for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) idx.push(y * W + x);
        const th = Math.min(otsu(g, idx), 170);
        const lab = new Int32Array(rw * rh), stack = [];
        const expW = FW * CELL_MM * pxPerMm, expH = FH * CELL_MM * pxPerMm;
        let found = null, comp = 0;
        for (let sy = 0; sy < rh; sy++) for (let sx = 0; sx < rw; sx++) {
            const si = sy * rw + sx;
            if (lab[si] || g[(sy + y0) * W + sx + x0] > th) continue;
            comp++; lab[si] = comp; stack.push(si);
            let n = 0, mnx = sx, mxx = sx, mny = sy, mxy = sy;
            let tl = [sx, sy, sx + sy], tr = [sx, sy, sx - sy], bl = [sx, sy, sy - sx], br = [sx, sy, sx + sy];
            while (stack.length) {
                const p = stack.pop(), px = p % rw, py = (p - px) / rw; n++;
                if (px < mnx) mnx = px; if (px > mxx) mxx = px; if (py < mny) mny = py; if (py > mxy) mxy = py;
                if (px + py < tl[2]) tl = [px, py, px + py]; if (px + py > br[2]) br = [px, py, px + py];
                if (px - py > tr[2]) tr = [px, py, px - py]; if (py - px > bl[2]) bl = [px, py, py - px];
                const nb = [p - 1, p + 1, p - rw, p + rw];
                for (let k = 0; k < 4; k++) {
                    const q = nb[k];
                    if (q < 0 || q >= lab.length || lab[q]) continue;
                    if ((k === 0 && px === 0) || (k === 1 && px === rw - 1)) continue;
                    const qx = q % rw, qy = (q - qx) / rw;
                    if (g[(qy + y0) * W + qx + x0] > th) continue;
                    lab[q] = comp; stack.push(q);
                }
            }
            const bw = mxx - mnx + 1, bh = mxy - mny + 1;
            if (bw < expW * 0.5 || bw > expW * 2 || bh < expH * 0.5 || bh > expH * 2) continue;
            const fill = n / (bw * bh), asp = bw / bh;
            if (fill < 0.2 || fill > 0.65 || asp < 0.85 || asp > 1.75) continue;
            const c = [tl, tr, br, bl].map(p => [p[0] + x0, p[1] + y0]);
            const r = readCells(g, W, H, c, th);
            if (r) { found = r; break; }
        }
        return found;
    }

    function readCells(g, W, H, corners, th) {
        const map = homography([[0, 0], [FW, 0], [FW, FH], [0, FH]], corners);
        if (!map) return null;
        const [ax, ay] = map(0, 0), [bx, by] = map(1, 0);
        const cell = Math.hypot(bx - ax, by - ay), rad = Math.max(1, Math.round(cell * 0.22));
        const vals = [];
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            const [cx, cy] = map(2 + c, 2 + r);
            let s = 0, n = 0;
            for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
                const x = Math.round(cx + dx), y = Math.round(cy + dy);
                if (x < 0 || y < 0 || x >= W || y >= H) continue;
                s += g[y * W + x]; n++;
            }
            vals.push(n ? s / n : 255);
        }
        const bits = vals.map(v => (v < th ? 1 : 0));
        return parse(bits) || parse(bits.slice().reverse()); // กลับหัว 180° = อ่านย้อน
    }

    // อ่านรหัสจาก canvas ของหน้าเอกสารทั้งหน้า (คืน null ถ้าไม่พบ)
    function decodeCanvas(cv) {
        const W = cv.width, H = cv.height, d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
        const g = new Uint8Array(W * H);
        for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000;
        const pxPerMm = Math.min(W, H) / 210; // สมมติว่าเป็นกระดาษ A4
        return findInRegion(g, W, H, W * 0.45, 0, W, H * 0.32, pxPerMm)       // ปกติ: มุมขวาบน
            || findInRegion(g, W, H, 0, H * 0.68, W * 0.55, H, pxPerMm)        // สแกนกลับหัว: มุมซ้ายล่าง
            || findInRegion(g, W, H, 0, 0, W, H, pxPerMm);                     // หาไม่เจอ: ค้นทั้งหน้า
    }

    root.TrinetraMark = { svg, encode, parse, decodeCanvas, CELL_MM, SIZE_MM: [FW * CELL_MM, FH * CELL_MM] };
})(typeof window !== 'undefined' ? window : globalThis);
