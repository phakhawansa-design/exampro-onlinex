# ตัวแปลงข้อสอบ AI · ExamPro

เว็บแปลงข้อสอบจาก **PDF / Word (.docx) / รูปถ่าย** เป็นไฟล์ **Excel (.xlsx)** ด้วย Google Gemini
ได้ไฟล์ที่นำเข้าหน้า **สร้างข้อสอบ → นำเข้า Excel** ของ ExamPro ได้เลย

ทำงานในเบราว์เซอร์ทั้งหมด ไม่ต้องมีเซิร์ฟเวอร์ จึงวางบน GitHub Pages ได้ฟรี

## รูปแบบไฟล์ Excel ที่ได้

| question | a | b | c | d | answer |
|---|---|---|---|---|---|
| เมืองหลวงของประเทศไทยคือเมืองใด? | เชียงใหม่ | กรุงเทพมหานคร | ภูเก็ต | ขอนแก่น | b |

- แถวแรกเป็น header เสมอ ข้อมูลเริ่มที่แถว 2
- ถ้ามีข้อที่ตัวเลือกเกิน 4 ข้อ จะเพิ่มคอลัมน์ `e`, `f`, `g` และช่องที่ไม่มีตัวเลือกจะใส่ `-` (ห้ามเว้นช่องว่าง)
- ⚠️ ตอนนี้ตัวนำเข้า Excel ของ ExamPro อ่านได้แค่ `a–d` ถ้าต้องการรองรับ e–g ต้องแก้ `handleExcelFileSelected` ใน `admin-questions.html`

## วิธีใช้

1. ขอ API Key ฟรีที่ <https://aistudio.google.com/apikey>
   > หมายเหตุ: แพ็กเกจ Gemini Pro / Google AI Pro ที่ใช้ในแอป Gemini **ไม่ได้รวมโควตา API**
   > แต่ API มีโควตาฟรีที่ใช้แปลงข้อสอบได้สบาย ถ้าใช้เยอะค่อยเปิด billing ใน AI Studio
2. เปิดเว็บ ใส่ API Key แล้วเลือกโมเดล (แนะนำ Flash-Lite: เร็ว โควตาฟรี 500 ครั้ง/วัน · Flash ฟรีแค่ 20 ครั้ง/วัน)
3. อัปโหลดไฟล์ข้อสอบ กด **แปลงข้อสอบ**
4. ตรวจทานในตาราง (คลิกแก้ได้) แล้วกด **ดาวน์โหลด Excel**

API Key แต่ละคนใช้ของตัวเอง เก็บไว้ในเบราว์เซอร์ของผู้ใช้เท่านั้น **ห้าม commit API Key ลงใน repo**
เพราะ repo บน GitHub Pages เป็นสาธารณะ ใครก็เห็นได้

## เอาขึ้น GitHub Pages

1. สร้าง repository ใหม่บน GitHub (Public) เช่น `exam-converter`
2. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้ (ลากใส่หน้า *Add file → Upload files* ได้เลย) หรือใช้ git:
   ```powershell
   git init
   git add .
   git commit -m "Exam converter"
   git branch -M main
   git remote add origin https://github.com/<ชื่อผู้ใช้>/exam-converter.git
   git push -u origin main
   ```
3. ไปที่ **Settings → Pages → Build and deployment** เลือก *Deploy from a branch*, branch `main`, โฟลเดอร์ `/ (root)` แล้ว Save
4. รอ 1–2 นาที เว็บจะอยู่ที่ `https://<ชื่อผู้ใช้>.github.io/exam-converter/`

## ทดสอบในเครื่อง

ไฟล์ใช้ ES modules จึงต้องเปิดผ่าน web server (ดับเบิลคลิก index.html ตรง ๆ จะไม่ทำงาน):

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

แล้วเปิด <http://localhost:8000>

## โครงสร้างไฟล์

```
index.html             หน้าเว็บ
css/style.css          ธีมเดียวกับ ExamPro
js/config.js           เลือกโหมด direct (กรอก Key เอง) / server (ใช้ Key ของระบบ)
js/app.js              หน้าจอ / ตารางตรวจทาน / ดาวน์โหลด
js/converter.js        API หลัก convertFiles() + toExamProQuestion() — ใช้ซ้ำจากหน้าอื่นได้
js/exam-dropzone.js    ลากไฟล์วางในหน้าสร้างข้อสอบของ ExamPro แล้วใส่ข้อสอบให้ทันที
demo/exampro-mock.html หน้าจำลอง ExamPro สำหรับทดลองลากวาง
js/prompt.js           prompt + schema ที่ส่งให้ Gemini (ใช้ร่วมกับฝั่งเซิร์ฟเวอร์)
js/gemini-core.js      เรียก Gemini แบบทนทาน: ลองใหม่อัตโนมัติ, timeout, สลับโมเดลสำรอง (ใช้ร่วมกัน)
js/gemini.js           โหมด direct: เบราว์เซอร์เรียก Gemini เอง
js/server-client.js    โหมด server: ส่งไฟล์ให้เซิร์ฟเวอร์ ExamPro
js/extract.js          อ่าน PDF / Word / รูป เป็นข้อมูลที่ส่งให้ Gemini
js/excel.js            จัดรูปแบบและสร้างไฟล์ .xlsx
server/                API ฝั่งเซิร์ฟเวอร์ที่เตรียมไว้ใส่ ExamPro (ดู server/README.md)
```

## สองโหมดการทำงาน

| | direct (ตอนนี้) | server (อนาคต) |
|---|---|---|
| API Key | ผู้ใช้กรอกเอง เก็บในเบราว์เซอร์ | อยู่ใน environment ของเซิร์ฟเวอร์ ExamPro |
| ใครใช้ได้ | ทุกคนที่มี Key | เฉพาะครูที่ล็อกอิน ExamPro |
| ต้องมีเซิร์ฟเวอร์ | ไม่ต้อง (GitHub Pages) | ต้อง (Render ที่มีอยู่แล้ว) |
| เปิดใช้ | ค่าเริ่มต้น | ตั้ง `mode: "server"` ใน `js/config.js` หรือเติม `?mode=server` |

วิธีย้ายเข้า ExamPro อยู่ใน [server/README.md](server/README.md)

## ความทนทานที่มีในระบบ

- AI ไม่ว่าง / เน็ตสะดุด / ช้าเกิน → ลองใหม่อัตโนมัติ 2 ครั้ง แล้วสลับไป Flash-Lite ถ้ายังไม่ได้
- โมเดลถูกปิดหรือไม่อยู่ในแพ็กเกจ → สลับโมเดลสำรองทันที
- Key ผิด / ข้อสอบยาวเกิน → แจ้งทันทีโดยไม่ลองซ้ำให้เสียเวลา
- งานที่แปลงแล้วบันทึกในเบราว์เซอร์อัตโนมัติ รีเฟรชหรือปิดแท็บก็เปิดต่อได้
- ตัดข้อที่ซ้ำกันทุกตัวอักษร และเตือนข้อที่ตัวเลือกซ้ำ/โจทย์ซ้ำ/เฉลยชี้ช่องว่าง

## ทดสอบอัตโนมัติ

```powershell
cd server
npm test
```

ทดสอบ 30 กรณี: การลองใหม่/สลับโมเดล, โควตาหมด, รูปแบบ Excel, การตรวจสิทธิ์, โควตา และการส่งซ้อน (ใช้ Gemini ปลอม ไม่เสียโควตาจริง)

## นำไปใส่เว็บแอปของคุณเอง (สำหรับนักศึกษา)

### เริ่มต้น
1. แตกไฟล์ zip แล้วติดตั้ง [Node.js 20.12+](https://nodejs.org)
2. ขอ API Key ของตัวเองที่ <https://aistudio.google.com/apikey>
3. ```powershell
   cd server
   npm install
   copy .env.example .env      # แล้วใส่ GEMINI_API_KEY ในไฟล์ .env
   npm test                    # ควรผ่านทั้งหมด (ไม่ใช้โควตาจริง)
   npm run dev
   ```
4. เปิด <http://localhost:3000/demo/exampro-mock.html> แล้วลองลากไฟล์ข้อสอบมาวาง

> ⚠️ **ห้าม commit ไฟล์ `.env` หรือใส่ API Key ในโค้ดฝั่งเบราว์เซอร์** (`.gitignore` กันไว้ให้แล้ว)
> ใครเห็น Key ก็ใช้โควตาของคุณได้

### เลือกวิธีเชื่อม
| ต้องการ | ใช้ไฟล์ | ตัวอย่าง |
|---|---|---|
| หน้าต่างลากวาง + ตรวจก่อนเพิ่ม (สำเร็จรูป) | `js/exam-dropzone.js` | ด้านล่าง |
| แค่ฟังก์ชันแปลงไฟล์ → ข้อสอบ แล้วทำ UI เอง | `js/converter.js` | `const { rows } = await convertFiles(files, { mode: "server" })` |
| API ฝั่งเซิร์ฟเวอร์ (Express) ถือ Key + ตรวจสิทธิ์ + โควตา | `server/exam-converter-router.js` | ดู [server/README.md](server/README.md) |
| สร้างไฟล์ Excel | `js/excel.js` | `downloadXlsx(rows, "ชื่อไฟล์")` |

### ใช้หน้าต่างลากวางกับเว็บที่เก็บข้อสอบแบบอื่น
หน้าต่างไม่ผูกกับ ExamPro ส่ง `adapter` บอกวิธีอ่าน/เขียนรายการข้อสอบของเว็บคุณ:

```html
<script type="module">
  import { mountExamDropzone } from "./exam-converter/js/exam-dropzone.js";

  mountExamDropzone({
    mode: "server",                 // เรียก API /api/ai ของเซิร์ฟเวอร์คุณ
    adapter: {
      ready: () => true,
      get: () => myQuiz.questions,  // รายการข้อสอบปัจจุบัน
      set: (list, activeIndex) => { myQuiz.questions = list; renderQuiz(activeIndex); },
      focus: (i) => openQuestion(i), // ไม่บังคับ: คลิก "ไปที่ข้อสอบ" แล้วเปิดข้อนี้
    },
  });
</script>
```

แต่ละข้อที่ได้มีรูปแบบ
`{ question, question_img: "", choices: [ก, ข, ค, ง], choices_img: ["","","",""], answer: "a"|"b"|"c"|"d", timeLimit: 20, type: "quiz"|"true_false" }`
ถ้าเว็บคุณเก็บข้อมูลแบบอื่น ให้แปลงใน `get`/`set` หรือแก้ `planInsert()` ใน `js/exam-dropzone.js`

ตัวเลือกอื่น: `fab: false` (ไม่แสดงปุ่มลอย แล้วผูกปุ่มของเว็บเองกับ `.open()`), `solveMissing`, `model`, `serverBase`

### ข้อจำกัดที่ควรรู้
- โควตาฟรีของ Gemini: Flash-Lite 500 ครั้ง/วัน, 15 ครั้ง/นาที — ไฟล์ละ 1 ครั้ง (50 ข้อใช้ ~14,000 token ~14 วินาที) รีเซ็ต 15:00 น. เวลาไทย
- แบบฟรี Google นำข้อมูลไปปรับปรุงบริการได้ ไม่เหมาะกับข้อสอบจริงที่เป็นความลับ
- โควตารายคนในเซิร์ฟเวอร์ตัวอย่างเก็บในหน่วยความจำ ใช้จริงควรเก็บลงฐานข้อมูล (`usageStore`)

## เรียกใช้จากหน้าอื่นของ ExamPro

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js"></script>
<script type="module">
  import { convertFiles, toExamProQuestion } from "./exam-converter/js/converter.js";
  const { rows } = await convertFiles(fileInput.files, { mode: "server" });
  questions = questions.concat(rows.map(toExamProQuestion));   // ใส่ลงหน้าสร้างข้อสอบได้เลย
</script>
```
