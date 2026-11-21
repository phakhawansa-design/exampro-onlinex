// แปลงไฟล์ที่ผู้ใช้อัปโหลดให้เป็น "parts" ที่ Gemini อ่านได้
// - PDF / รูปภาพ  -> ส่งไฟล์ตรง ๆ (Gemini อ่าน PDF รวมถึงหน้าสแกนได้เอง)
// - Word (.docx)  -> ใช้ mammoth แปลงเป็น HTML (เก็บตัวหนา/ขีดเส้นใต้ที่มักใช้บอกเฉลย) + แนบรูปในเอกสาร
// - .txt          -> ส่งเป็นข้อความ

export const MAX_INLINE_BYTES = 18 * 1024 * 1024; // Gemini รับ inline ได้ราว 20MB ต่อคำขอ
const MAMMOTH_URL = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js";

let mammothLoading;
/** โหลดตัวอ่าน Word เมื่อจำเป็น (หน้าที่ฝังตัวแปลงไม่ต้องใส่ <script> เอง) */
function ensureMammoth() {
  if (window.mammoth) return Promise.resolve(window.mammoth);
  mammothLoading ||= new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement("script"), { src: MAMMOTH_URL, async: true });
    s.onload = () => (window.mammoth ? resolve(window.mammoth) : reject(new Error("โหลดตัวอ่านไฟล์ Word ไม่สำเร็จ")));
    s.onerror = () => { mammothLoading = null; reject(new Error("โหลดตัวอ่านไฟล์ Word ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ต")); };
    document.head.appendChild(s);
  });
  return mammothLoading;
}

/** รูป (base64) → JPEG ด้านยาวไม่เกิน 1600px · คืน null ถ้าเบราว์เซอร์อ่านรูปไม่ได้ (เช่น EMF/WMF) */
async function toJpeg(mime, b64, maxSide = 1600) {
  try {
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([bytes], { type: mime || "image/png" }));
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    return { mime: "image/jpeg", data: c.toDataURL("image/jpeg", 0.85).split(",")[1] };
  } catch (e) { return null; }
}

export const ACCEPT = ".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp";

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function ext(name) {
  return (name.split(".").pop() || "").toLowerCase();
}

/** @returns {Promise<Array>} Gemini parts */
export async function fileToParts(file) {
  const e = ext(file.name);
  if (e === "doc") throw new Error(`"${file.name}" เป็น Word รุ่นเก่า (.doc) กรุณาเปิดแล้ว Save As เป็น .docx ก่อน`);
  if (file.size > MAX_INLINE_BYTES) {
    throw new Error(`"${file.name}" ใหญ่เกิน 18MB กรุณาแบ่งไฟล์หรือบีบอัดก่อน`);
  }

  const buf = await file.arrayBuffer();

  if (e === "pdf") {
    return [{ inline_data: { mime_type: "application/pdf", data: toBase64(buf) } }];
  }

  if (["png", "jpg", "jpeg", "webp"].includes(e)) {
    const mime = e === "jpg" ? "image/jpeg" : `image/${e}`;
    return [{ inline_data: { mime_type: mime, data: toBase64(buf) } }];
  }

  if (e === "txt") {
    return [{ text: `เนื้อหาไฟล์ ${file.name}:\n\n${new TextDecoder().decode(buf)}` }];
  }

  if (e === "docx") {
    const mammoth = await ensureMammoth();
    const rawImages = [];
    const result = await mammoth.convertToHtml(
      { arrayBuffer: buf },
      {
        styleMap: ["u => u", "highlight => mark"],
        convertImage: mammoth.images.imgElement(async (img) => {
          const n = rawImages.length + 1;
          if (rawImages.length < 30) rawImages.push({ mime: img.contentType, data: await img.read("base64") });
          return { src: "", alt: `[รูปภาพที่ ${n}]` };
        }),
      }
    );
    const html = result.value.replace(/<img [^>]*alt="([^"]*)"[^>]*>/g, "$1");
    // Gemini รับรูปได้แค่ PNG/JPEG/WEBP · รูปใน Word มักเป็น GIF/EMF หรือใหญ่มาก → แปลงเป็น JPEG ย่อขนาด อ่านไม่ได้ก็ข้าม
    const images = [];
    for (const im of rawImages) { const ok = await toJpeg(im.mime, im.data); if (ok) images.push(ok); }
    if (!html.replace(/<[^>]+>/g, "").trim()) {
      throw new Error(`ไม่พบข้อความใน "${file.name}" (อาจเป็นรูปสแกนทั้งหมด ลอง Export เป็น PDF แล้วอัปโหลดแทน)`);
    }
    const parts = [
      {
        text:
          `เนื้อหาไฟล์ Word "${file.name}" แปลงเป็น HTML ` +
          `(<strong>/<b> = ตัวหนา, <u> = ขีดเส้นใต้, <mark> = ไฮไลต์ ซึ่งมักใช้บอกตัวเลือกที่ถูก):\n\n${html}`,
      },
    ];
    images.forEach((img, i) => {
      parts.push({ text: `[รูปภาพที่ ${i + 1}]` });
      parts.push({ inline_data: { mime_type: img.mime, data: img.data } });
    });
    return parts;
  }

  throw new Error(`ไม่รองรับไฟล์ "${file.name}" (รองรับ PDF, Word .docx, รูปภาพ, .txt)`);
}
