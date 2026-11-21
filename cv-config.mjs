// ตั้งค่าโหมดการทำงานของตัวแปลง
//
//  "direct" = ผู้ใช้กรอก Gemini API Key เอง เบราว์เซอร์เรียก Google โดยตรง
//             ใช้ตอนนี้ และใช้กับเวอร์ชัน GitHub Pages
//  "server" = เบราว์เซอร์ส่งไฟล์ไปที่เซิร์ฟเวอร์ ExamPro ซึ่งถือ API Key ไว้เอง
//             เฉพาะผู้ที่ล็อกอิน ExamPro เท่านั้นที่ใช้ได้ (ดู server/README.md)
//
// ทดสอบโหมด server ชั่วคราวได้โดยเติม ?mode=server ท้าย URL

const params = new URLSearchParams(typeof location !== "undefined" ? location.search : "");

export const CONFIG = {
  // เปลี่ยนค่าเริ่มต้นเป็น "server" เมื่อย้ายเข้าระบบจริง
  // อยู่ใน ExamPro แล้ว → ใช้ API Key ของระบบ (server) · ?mode=direct สำหรับกรอก Key เอง (เช่น วางบน GitHub Pages)
  mode: ["direct", "server"].includes(params.get("mode")) ? params.get("mode") : "server",

  // URL ฐานของ API ฝั่งเซิร์ฟเวอร์
  // - ถ้าหน้านี้อยู่ใน ExamPro (โดเมนเดียวกัน) ใช้ "/api/ai" ได้เลย
  // - ถ้าอยู่คนละโดเมน ใส่เต็ม เช่น "https://exampro-onlinex.onrender.com/api/ai" (ต้องเปิด CORS ที่เซิร์ฟเวอร์)
  serverBase: "/api/ai",

  // token ล็อกอินของ ExamPro (auth-client.js เก็บไว้ใน localStorage ชื่อ auth_token)
  getAuthToken() {
    try { return localStorage.getItem("auth_token") || ""; } catch { return ""; }
  },

  // หน้าล็อกอินที่จะพาไปเมื่อยังไม่ได้เข้าสู่ระบบ (โหมด server)
  loginUrl: "login.html",
};
