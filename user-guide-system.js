/**
 * Tab-Lock Online Proctoring System - Interactive User Guide & Onboarding Tour System
 * ออกแบบสำหรับช่วยแนะนำการใช้งานระบบสำหรับอาจารย์ผู้ใช้งานใหม่และทบทวนการใช้งาน
 */

(function () {
    'use strict';

    // ===== 1. ข้อมูลคู่มือการใช้งานแต่ละหน้า =====
    const GUIDE_DATA = {
        'dashboard': {
            title: 'แดชบอร์ดหลัก (Dashboard)',
            icon: '🏠',
            badge: 'หน้าเริ่มต้น',
            summary: 'ศูนย์กลางควบคุมและภาพรวมของระบบสอบออนไลน์ Tab-Lock',
            steps: [
                {
                    title: 'ยินดีต้อนรับสู่ Tab-Lock Proctoring',
                    badge: 'ภาพรวมระบบ',
                    icon: '🎓',
                    content: 'Tab-Lock คือระบบจัดสอบและประมวลผลอัจฉริยะ พร้อมระบบ <strong>AI Anti-Cheat</strong> ตรวจจับการสลับแท็บหน้าจอ และระบบวิเคราะห์ผลสอบอัตโนมัติ ช่วยให้อาจารย์จัดสอบได้อย่างสะดวก รวดเร็ว และโปร่งใส',
                    tip: '💡 คุณสามารถดูสถานะระบบ และสลับเมนูต่างๆ ได้จากแถบเมนูด้านซ้ายตลอดเวลา'
                },
                {
                    title: 'ปุ่มสร้างและจัดการข้อสอบใหม่',
                    badge: 'การเริ่มต้น',
                    icon: '✍️',
                    content: 'กดปุ่มสีชมพู <strong>"+ สร้างและจัดการข้อสอบใหม่"</strong> เพื่อเริ่มสร้างห้องสอบใหม่ ตั้งเวลานับถอยหลัง กำหนดรหัสผ่านเข้าสอบ และเพิ่มข้อสอบได้ทันที',
                    tip: '💡 สามารถสร้างห้องสอบได้หลายห้องตามรายวิชาหรือตอนเรียน (Section)'
                },
                {
                    title: 'ระบบ AI Generator & นำเข้า Excel',
                    badge: 'เครื่องมือช่วยออกข้อสอบ',
                    icon: '🧠',
                    content: 'ประหยัดเวลาการออกข้อสอบด้วย <strong>Gemini AI</strong> ที่ช่วยร่างโจทย์และตัวเลือกให้ หรือเลือกนำเข้าข้อสอบจากไฟล์ <strong>Excel</strong> ได้ครั้งละหลายสิบข้อในไม่กี่วินาที',
                    tip: '💡 มีไฟล์เทมเพลต Excel ให้ดาวน์โหลดในหน้าจัดการข้อสอบ'
                },
                {
                    title: 'ตรวจสอบผลคะแนน & พฤติกรรมนักศึกษา',
                    badge: 'การติดตามผล',
                    icon: '📊',
                    content: 'เมื่อนักศึกษาเริ่มสอบ คุณสามารถเข้าดูการสอบสดใน <strong>"กำลังดำเนินการสอบ"</strong>, ตรวจสอบคะแนนใน <strong>"ตรวจสอบผลการสอบ"</strong>, และดูประวัติการสลับหน้าจอใน <strong>"ตรวจจับพฤติกรรมน่าสงสัย"</strong>',
                    tip: '💡 ระบบจะบันทึกคะแนนและคำนวณสถิติ Mean, S.D., และ Item Analysis ให้อัตโนมัติ'
                }
            ],
            cheatSheet: [
                { name: 'สร้างข้อสอบใหม่', desc: 'กดปุ่ม "+ สร้างและจัดการข้อสอบใหม่" เพื่อเริ่มสร้างห้องสอบ' },
                { name: 'Gemini AI Generator', desc: 'ให้ AI ช่วยร่างข้อสอบตามหัวข้อวิชาที่ต้องการ' },
                { name: 'นำเข้า Excel', desc: 'อัปโหลดไฟล์ Excel เพื่อเพิ่มข้อสอบทีละหลายข้อ' },
                { name: 'ตรวจสอบผลสอบ', desc: 'ดูคะแนน สถิติห้องเรียน และดาวน์โหลดรายงาน Excel' },
                { name: 'ระบบจับทุจริต', desc: 'ดูประวัตินักศึกษาที่สลับหน้าจอหรือพยายามคัดลอกข้อสอบ' }
            ]
        },

        'questions': {
            title: 'จัดการข้อสอบ (Questions Management)',
            icon: '📝',
            badge: 'สร้างและแก้ไขข้อสอบ',
            summary: 'เครื่องมือสร้างข้อสอบ กำหนดจำนวนข้อ แนบรูป ช้อยส์ เฉลย และเผยแพร่ข้อสอบ',
            steps: [
                {
                    title: 'เลือกห้องสอบ & ตั้งค่าแบบทดสอบ',
                    badge: 'ขั้นตอนที่ 1',
                    icon: '🏠',
                    content: 'เลือกรหัสห้องสอบที่ต้องการจัดการที่มุมบนขวา จากนั้นกดปุ่ม <strong>"⚙️ ตั้งค่าแบบทดสอบ"</strong> เพื่อตั้งชื่อการสอบ, เวลาทำข้อสอบ (นาที), รหัสผ่านเข้าสอบ และเปิด/ปิดการสลับช้อยส์สุ่มคำถาม',
                    tip: '💡 หากยังไม่มีห้องสอบ สามารถกดเริ่มสร้างห้องสอบใหม่ได้ทันที'
                },
                {
                    title: 'เลือกจำนวนข้อสอบที่ต้องการสร้าง',
                    badge: 'ขั้นตอนที่ 2',
                    icon: '🔢',
                    content: 'ใช้ <strong>"ปุ่มลัดเลือกจำนวนข้อ"</strong> เช่น 5, 10, 20, 30 ข้อ หรือพิมพ์ระบุจำนวนข้อเอง แล้วกด <strong>"🎯 กำหนดเป็นจำนวนนี้"</strong> ระบบจะสร้างฟอร์มคำถามให้ครบตามจำนวนข้อทันที ไม่ต้องกดเพิ่มทีละข้อ!',
                    tip: '💡 สามารถกด "➕ เพิ่มอีกตามจำนวนนี้" เพื่อต่อท้ายข้อสอบเพิ่มได้ตลอดเวลา'
                },
                {
                    title: 'กรอกโจทย์ ช้อยส์ เฉลย และแนบรูปภาพ',
                    badge: 'ขั้นตอนที่ 3',
                    icon: '✍️',
                    content: 'พิมพ์โจทย์คำถาม กรอกตัวเลือกคำตอบ (A, B, C, D...) ติ๊กเลือกปุ่ม <strong>"🔘 เฉลย"</strong> สำหรับข้อที่ถูกต้อง และสามารถกด <strong>"📸 แนบรูปภาพ"</strong> ที่โจทย์หรือตัวเลือกได้',
                    tip: '💡 สามารถเพิ่มช้อยส์ได้สูงสุดถึง 10 ช้อยส์ต่อหนึ่งข้อคำถาม'
                },
                {
                    title: 'ดึงข้อสอบจากคลัง & บันทึกแบบร่าง',
                    badge: 'ขั้นตอนที่ 4',
                    icon: '📚',
                    content: 'สามารถกด <strong>"📂 เลือกข้อสอบจากคลังข้อสอบ"</strong> เพื่อนำข้อสอบเก่าที่เคยบันทึกไว้กลับมาใช้ซ้ำได้ และเมื่อกรอกข้อสอบเสร็จแล้ว ให้กดปุ่ม <strong>"💾 บันทึกแบบร่างส่งฐานข้อมูล"</strong>',
                    tip: '💡 อย่าลืมกดบันทึกแบบร่างทุกครั้งก่อนเปลี่ยนหน้า'
                },
                {
                    title: 'ตรวจสอบและยืนยันเผยแพร่ข้อสอบ',
                    badge: 'ขั้นตอนที่ 5',
                    icon: '🟢',
                    content: 'สลับไปที่แท็บ <strong>"🔍 ตรวจสอบข้อสอบปัจจุบัน"</strong> เพื่อดูภาพรวมข้อสอบทั้งหมด และกดปุ่ม <strong>"🟢 ยืนยันเผยแพร่ให้นักศึกษาเข้าสอบ"</strong> เพื่อเปิดระบบให้นักเรียนล็อกอินเข้าทำข้อสอบได้',
                    tip: '💡 หากยังไม่กดเผยแพร่ นักศึกษาจะไม่สามารถมองเห็นหรือทำข้อสอบชุดนี้ได้'
                }
            ],
            cheatSheet: [
                { name: 'ปุ่มลัดจำนวนข้อ', desc: 'กด 5, 10, 20... เพื่อสร้างช่องกรอกข้อสอบตามจำนวนที่ต้องการทันที' },
                { name: 'แนบรูปภาพ', desc: 'รองรับไฟล์รูปภาพทั้งในส่วนโจทย์และตัวเลือกคำตอบ' },
                { name: 'เลือกเฉลย', desc: 'ติ๊กวงกลม "เฉลย" ที่ตัวเลือกที่ถูกต้อง' },
                { name: 'คลังข้อสอบ', desc: 'ดึงชุดข้อสอบที่เคยบันทึกไว้กลับมาใช้งานใหม่ได้ง่ายดาย' },
                { name: 'ยืนยันเผยแพร่', desc: 'กดปุ่มสีเขียวเพื่อเปิดให้นักเรียนเริ่มเข้าสอบ' }
            ]
        },

        'active-exams': {
            title: 'กำลังดำเนินการสอบ (Active Exams)',
            icon: '▶️',
            badge: 'ห้องสอบสด',
            summary: 'ติดตามสถานะห้องสอบที่เปิดอยู่ จำนวนผู้เข้าสอบ และควบคุมการสอบแบบเรียลไทม์',
            steps: [
                {
                    title: 'ดูห้องสอบที่กำลังเปิดอยู่',
                    badge: 'ห้องสอบออนไลน์',
                    icon: '🟢',
                    content: 'หน้านี้จะแสดงห้องสอบทั้งหมดที่ผ่านการ <strong>เผยแพร่ (Publish)</strong> แล้ว พร้อมแสดงรหัสห้องสอบ (Room ID) จำนวนข้อสอบ และเวลาที่กำหนด',
                    tip: '💡 หากไม่พบห้องสอบ กรุณาไปที่หน้า "จัดการข้อสอบ" แล้วกดยืนยันเผยแพร่ก่อนครับ'
                },
                {
                    title: 'คัดลอกรหัสห้อง & ลิงก์เข้าสอบ',
                    badge: 'ส่งให้นักศึกษา',
                    icon: '📋',
                    content: 'กดปุ่มคัดลอกรหัสห้องสอบ (Room ID) หรือลิงก์เข้าสอบ เพื่อส่งให้นักศึกษาในชั้นเรียน นักศึกษาสามารถเข้าทำข้อสอบได้ทันทีผ่านคอมพิวเตอร์ แท็บเล็ต หรือสมาร์ตโฟน',
                    tip: '💡 นักศึกษาไม่ต้องลงโปรแกรมเพิ่ม เพียงเปิดเว็บเบราว์เซอร์ก็สอบได้ทันที'
                },
                {
                    title: 'มอนิเตอร์จำนวนผู้เข้าสอบแบบเรียลไทม์',
                    badge: 'การติดตามสด',
                    icon: '👥',
                    content: 'ระบบจะอัปเดตจำนวนนักศึกษาที่กำลังออนไลน์ทำข้อสอบ และจำนวนนักศึกษาที่กดส่งข้อสอบแล้วแบบวินาทีต่อวินาที',
                    tip: '💡 สามารถกดดูรายละเอียดของนักเรียนแต่ละคนได้'
                },
                {
                    title: 'ปิดรับข้อสอบ / สิ้นสุดการสอบ',
                    badge: 'การควบคุม',
                    icon: '🛑',
                    content: 'เมื่อหมดเวลาการสอบ อาจารย์สามารถกดปุ่ม <strong>"ปิดรับข้อสอบ"</strong> เพื่อไม่ให้นักศึกษาเข้าสอบเพิ่มเติม และเตรียมนำผลสอบไปประมวลผลคะแนนต่อไป',
                    tip: '💡 สามารถเปิดกลับมาใหม่ได้ทุกเมื่อที่ต้องการ'
                }
            ],
            cheatSheet: [
                { name: 'รหัสห้องสอบ (Room ID)', desc: 'รหัสประจำห้องสอบที่ใช้ส่งให้นักศึกษาล็อกอิน' },
                { name: 'สถานะออนไลน์', desc: 'แสดงจำนวนนักศึกษาที่กำลังทำข้อสอบอยู่ในขณะนี้' },
                { name: 'ผู้ส่งข้อสอบแล้ว', desc: 'แสดงจำนวนนักศึกษาที่ทำข้อสอบเสร็จสิ้นและส่งแล้ว' },
                { name: 'ปิดรับข้อสอบ', desc: 'ยุติการสอบและปิดไม่ให้นักศึกษาเข้าทำข้อสอบเพิ่ม' }
            ]
        },

        'library': {
            title: 'คลังข้อสอบ (Exam Library)',
            icon: '📚',
            badge: 'คลังส่วนตัว',
            summary: 'ศูนย์รวมชุดข้อสอบที่คุณบันทึกเก็บไว้ นำกลับมาใช้ซ้ำและจัดหมวดหมู่ได้ไม่จำกัด',
            steps: [
                {
                    title: 'คลังข้อสอบคืออะไร?',
                    badge: 'ประโยชน์ของคลัง',
                    icon: '🗄️',
                    content: 'คลังข้อสอบคือพื้นที่จัดเก็บชุดข้อสอบคุณภาพของคุณอย่างปลอดภัย ช่วยให้คุณไม่ต้องพิมพ์ข้อสอบใหม่ทุกเทอม สามารถหยิบชุดข้อสอบเก่ามาปรับปรุงหรือเปิดสอบใหม่ได้ทันที',
                    tip: '💡 บันทึกข้อสอบได้ไม่จำกัดจำนวนชุด'
                },
                {
                    title: 'การบันทึกข้อสอบเข้าคลัง',
                    badge: 'วิธีเพิ่มข้อสอบ',
                    icon: '📥',
                    content: 'เมื่อคุณสร้างข้อสอบในห้องเรียนเสร็จแล้ว สามารถเลือกบันทึกชุดข้อสอบนั้นเข้าสู่ <strong>"คลังข้อสอบ"</strong> พร้อมตั้งชื่อชุดข้อสอบและระบุวิชาเพื่อความสะดวกในการค้นหา',
                    tip: '💡 สามารถบันทึกข้อสอบพร้อมรูปภาพและเฉลยเก็บไว้ได้ครบถ้วน'
                },
                {
                    title: 'ดึงข้อสอบจากคลังไปใช้ในห้องสอบใหม่',
                    badge: 'การนำไปใช้',
                    icon: '🚀',
                    content: 'ในหน้า <strong>"จัดการข้อสอบ"</strong> เพียงกดปุ่ม <strong>"📂 เลือกข้อสอบจากคลังข้อสอบ"</strong> แล้วเลือกชุดข้อสอบที่ต้องการ ข้อสอบทั้งหมดจะถูกคัดลอกลงในห้องสอบใหม่ทันที',
                    tip: '💡 สามารถแก้ไขหรือปรับแต่งข้อสอบหลังดึงมาใช้งานได้โดยไม่กระทบต้นฉบับในคลัง'
                }
            ],
            cheatSheet: [
                { name: 'บันทึกเข้าคลัง', desc: 'เก็บชุดข้อสอบจากห้องเรียนเข้าคลังข้อสอบส่วนตัว' },
                { name: 'ดึงไปใช้ซ้ำ', desc: 'นำชุดข้อสอบจากคลังไปเปิดห้องสอบใหม่ได้ใน 1 คลิก' },
                { name: 'ค้นหาและจัดการ', desc: 'ค้นหา ลบ หรือแก้ไขชุดข้อสอบในคลังได้อย่างอิสระ' }
            ]
        },

        'results': {
            title: 'ตรวจสอบผลการสอบ (Exam Results & Analytics)',
            icon: '📊',
            badge: 'ผลคะแนนและสถิติ',
            summary: 'วิเคราะห์ผลคะแนนสอบ ค่าสถิติห้องเรียน สถิติรายข้อ (Item Analysis) และส่งออก Excel',
            steps: [
                {
                    title: 'เลือกรหัสห้องสอบเพื่อดูผลคะแนน',
                    badge: 'ขั้นตอนที่ 1',
                    icon: '🔍',
                    content: 'เลือกรหัสห้องสอบที่ต้องการตรวจสอบคะแนน ระบบจะดึงรายชื่อนักศึกษา คะแนนที่ได้ เวลาที่ส่งข้อสอบ และสถานะการสอบมาแสดงทันที',
                    tip: '💡 มีระบบค้นหาชื่อหรือรหัสนักศึกษาอย่างรวดเร็ว'
                },
                {
                    title: 'สถิติภาพรวมชั้นเรียน (Classroom Statistics)',
                    badge: 'ขั้นตอนที่ 2',
                    icon: '📈',
                    content: 'ระบบจะคำนวณค่าสถิติสำคัญให้อัตโนมัติ ได้แก่ <strong>คะแนนเฉลี่ย (Mean)</strong>, <strong>ส่วนเบี่ยงเบนมาตรฐาน (S.D.)</strong>, <strong>คะแนนสูงสุด (Max)</strong> และ <strong>คะแนนต่ำสุด (Min)</strong> พร้อมกราฟแจกแจงคะแนน',
                    tip: '💡 นำค่าสถิติไปใช้ในการประเมินผลการเรียนรู้ตามเกณฑ์มาตรฐานได้ทันที'
                },
                {
                    title: 'วิเคราะห์คุณภาพข้อสอบรายข้อ (Item Analysis)',
                    badge: 'ขั้นตอนที่ 3',
                    icon: '🎯',
                    content: 'ดูค่า <strong>ความยากง่าย (p-value)</strong> และ <strong>ค่าอำนาจจำแนก (r-value)</strong> ของข้อสอบแต่ละข้อ เพื่อดูว่าข้อสอบข้อใดยากเกินไป ง่ายเกินไป หรือมีคุณภาพดีเยี่ยม',
                    tip: '💡 ช่วยให้อาจารย์พัฒนาปรับปรุงข้อสอบให้มีมาตรฐานยิ่งขึ้น'
                },
                {
                    title: 'ส่งออกรายงาน Excel (Export to Excel)',
                    badge: 'ขั้นตอนที่ 4',
                    icon: '📥',
                    content: 'กดปุ่ม <strong>"📊 ส่งออกรายงาน Excel"</strong> เพื่อดาวน์โหลดไฟล์ตารางสรุปคะแนน รายชื่อนักศึกษา และคำตอบรายบุคคล นำไปตัดเกรดหรือส่งงานทะเบียนได้ทันที',
                    tip: '💡 ไฟล์ Excel มีการจัดรูปแบบสวยงามพร้อมใช้งานทันที'
                }
            ],
            cheatSheet: [
                { name: 'คะแนนเฉลี่ย (Mean)', desc: 'คะแนนเฉลี่ยของนักศึกษาทุกคนในห้องเรียน' },
                { name: 'ส่วนเบี่ยงเบน (S.D.)', desc: 'ค่าการกระจายของคะแนนในชั้นเรียน' },
                { name: 'Item Analysis', desc: 'วิเคราะห์ความยากง่ายและอำนาจจำแนกของข้อสอบรายข้อ' },
                { name: 'Export Excel', desc: 'ดาวน์โหลดไฟล์ผลคะแนนทั้งหมดลงคอมพิวเตอร์' }
            ]
        },

        'monitoring': {
            title: 'ตรวจจับพฤติกรรมน่าสงสัย (AI Anti-Cheat Monitor)',
            icon: '🛡️',
            badge: 'ความปลอดภัยการสอบ',
            summary: 'บันทึกประวัติการสลับหน้าจอ (Tab Switching) และพฤติกรรมส่อทุจริตแบบเรียลไทม์',
            steps: [
                {
                    title: 'ระบบ AI Anti-Cheat ทำงานอย่างไร?',
                    badge: 'เทคโนโลยีตรวจจับ',
                    icon: '👁️',
                    content: 'ระหว่างที่นักศึกษาทำข้อสอบ ระบบจะล็อกหน้าจอให้อยู่ในโหมดเต็มจอ หากนักศึกษามีการ <strong>สลับหน้าจอ (Tab Switch)</strong>, เปิดแท็บอื่นเพื่อหาคำตอบ, หรือออกจากโหมดเต็มจอ ระบบจะบันทึกเหตุการณ์และแจ้งเตือนทันที',
                    tip: '💡 ระบบทำงานโดยอัตโนมัติ ไม่ต้องคอยจับตาดูตลอดเวลา'
                },
                {
                    title: 'รายการบันทึกเหตุการณ์ความปลอดภัย (Security Logs)',
                    badge: 'บันทึกหลักฐาน',
                    icon: '🚨',
                    content: 'แสดงรายชื่อนักศึกษาที่ทำผิดกฎ พร้อมระบุ <strong>วันเวลาที่เกิดเหตุ (Timestamp)</strong>, <strong>จำนวนครั้งที่สลับหน้าจอ</strong>, และ <strong>ประเภทของพฤติกรรม</strong> เพื่อใช้เป็นหลักฐานอย่างชัดเจน',
                    tip: '💡 นักศึกษาที่สลับหน้าจอเกินเกณฑ์ที่กำหนดจะถูกระบบล็อกข้อสอบอัตโนมัติ'
                },
                {
                    title: 'การปลดล็อกและการจัดการนักศึกษา',
                    badge: 'การควบคุม',
                    icon: '🔓',
                    content: 'หากนักศึกษาเกิดเหตุสุดวิสัย (เช่น ไฟดับ เน็ตหลุด หรือข้อความแจ้งเตือนเด้ง) อาจารย์สามารถกดปุ่ม <strong>"ปลดล็อก"</strong> เพื่ออนุญาตให้นักศึกษาทำข้อสอบต่อได้ตามดุลยพินิจ',
                    tip: '💡 สามารถดูคะแนนควบคู่กับประวัติพฤติกรรมก่อนตัดสินใจได้'
                }
            ],
            cheatSheet: [
                { name: 'Tab Switch Alert', desc: 'บันทึกทุกครั้งที่มีการเปลี่ยนแท็บหรือเปิดหน้าต่างอื่น' },
                { name: 'Full-Screen Lock', desc: 'บังคับให้ทำข้อสอบในโหมดเต็มจอตลอดเวลา' },
                { name: 'Auto Lock', desc: 'ล็อกการทำข้อสอบอัตโนมัติเมื่อทำผิดกฎเกินจำนวนครั้ง' },
                { name: 'Teacher Unlock', desc: 'อาจารย์สามารถกดปลดล็อกให้นักเรียนสอบต่อได้' }
            ]
        },

        'excel': {
            title: 'นำเข้าข้อสอบ Excel (Excel Import)',
            icon: '📊',
            badge: 'นำเข้าข้อมูลด่วน',
            summary: 'อัปโหลดไฟล์ตาราง Excel เพื่อแปลงเป็นชุดข้อสอบในระบบอัตโนมัติ',
            steps: [
                {
                    title: 'ดาวน์โหลดเทมเพลต Excel แม่แบบ',
                    badge: 'ขั้นตอนที่ 1',
                    icon: '📥',
                    content: 'กดปุ่ม <strong>"ดาวน์โหลดแม่แบบ Excel"</strong> เพื่อรับไฟล์ตารางตัวอย่างที่มีหัวคอลัมน์ถูกต้องตามรูปแบบของระบบ',
                    tip: '💡 ใช้โปรแกรม Microsoft Excel, Google Sheets หรือ Numbers เปิดแก้ไขได้'
                },
                {
                    title: 'กรอกโจทย์ ช้อยส์ และเฉลยในตาราง',
                    badge: 'ขั้นตอนที่ 2',
                    icon: '📝',
                    content: 'กรอกโจทย์คำถามในคอลัมน์ Question, กรอกตัวเลือกในคอลัมน์ Choice A, B, C, D และระบุตัวอักษรเฉลย (เช่น A หรือ B) ในคอลัมน์ Answer',
                    tip: '💡 1 แถวใน Excel เท่ากับ 1 ข้อคำถาม สามารถใส่ได้หลายสิบข้อ'
                },
                {
                    title: 'อัปโหลดและตรวจสอบข้อสอบ',
                    badge: 'ขั้นตอนที่ 3',
                    icon: '📤',
                    content: 'ลากไฟล์ Excel ที่กรอกเสร็จแล้วมาวางในกล่องอัปโหลด ระบบจะอ่านข้อมูลและแปลงเป็นข้อสอบให้คุณตรวจสอบความถูกต้องก่อนบันทึก',
                    tip: '💡 สามารถแก้ไขเพิ่มเติมหรือแนบรูปภาพหลังจากนำเข้าเสร็จได้'
                }
            ],
            cheatSheet: [
                { name: 'ดาวน์โหลดแม่แบบ', desc: 'รับไฟล์ Excel ตัวอย่างสำหรับกรอกข้อมูล' },
                { name: 'กรอกข้อมูล', desc: 'ใส่โจทย์ ช้อยส์ A-D และเฉลยตามคอลัมน์' },
                { name: 'อัปโหลดไฟล์', desc: 'ลากไฟล์มาวางเพื่อนำเข้าข้อสอบอัตโนมัติ' }
            ]
        }
    };

    // ===== 2. ตรวจสอบหน้าปัจจุบัน =====
    function getCurrentPageKey() {
        const path = window.location.pathname.toLowerCase();
        if (path.includes('questions') || path.includes('portal')) return 'questions';
        if (path.includes('active-exams')) return 'active-exams';
        if (path.includes('library')) return 'library';
        if (path.includes('results') || path.includes('analysis')) return 'results';
        if (path.includes('monitoring')) return 'monitoring';
        if (path.includes('excel')) return 'excel';
        if (path.includes('dashboard') || path.includes('index')) return 'dashboard';
        return 'dashboard';
    }

    // ===== 3. จัดการสถานะการเปิดครั้งแรก (LocalStorage) =====
    const STORAGE_KEY_PREFIX = 'tablock_guide_seen_';

    function hasSeenGuide(pageKey) {
        return localStorage.getItem(STORAGE_KEY_PREFIX + pageKey) === 'true';
    }

    function markGuideAsSeen(pageKey) {
        localStorage.setItem(STORAGE_KEY_PREFIX + pageKey, 'true');
    }

    // ===== 4. สร้างและฝัง CSS สไตล์ที่สวยงาม =====
    function injectGuideStyles() {
        if (document.getElementById('tablock-guide-styles')) return;

        const style = document.createElement('style');
        style.id = 'tablock-guide-styles';
        style.textContent = `
            /* Floating Guide Button */
            .tablock-floating-guide-btn {
                position: fixed;
                bottom: 24px;
                right: 24px;
                z-index: 9990;
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 18px;
                background: linear-gradient(135deg, #06b6d4, #6366f1);
                color: #ffffff;
                font-family: 'Kanit', sans-serif;
                font-size: 13px;
                font-weight: 800;
                border-radius: 9999px;
                border: 2px solid rgba(255, 255, 255, 0.85);
                box-shadow: 0 10px 25px -5px rgba(6, 182, 212, 0.4), 0 8px 10px -6px rgba(99, 102, 241, 0.3);
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                user-select: none;
            }
            .tablock-floating-guide-btn:hover {
                transform: translateY(-3px) scale(1.03);
                box-shadow: 0 15px 30px -5px rgba(6, 182, 212, 0.5), 0 10px 15px -5px rgba(99, 102, 241, 0.4);
            }
            .tablock-floating-guide-btn:active {
                transform: scale(0.96);
            }
            .tablock-guide-pulse-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background-color: #34d399;
                box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.7);
                animation: tablockGuidePulse 2s infinite;
            }
            @keyframes tablockGuidePulse {
                0% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.7); }
                70% { box-shadow: 0 0 0 8px rgba(52, 211, 153, 0); }
                100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); }
            }

            /* First-Time Welcome Banner */
            .tablock-welcome-banner {
                background: linear-gradient(135deg, rgba(238, 242, 255, 0.95), rgba(240, 253, 250, 0.95));
                backdrop-filter: blur(12px);
                border: 1px solid rgba(199, 210, 254, 0.85);
                border-radius: 20px;
                padding: 16px 20px;
                margin-bottom: 24px;
                box-shadow: 0 4px 20px rgba(99, 102, 241, 0.08);
                display: flex;
                flex-direction: column;
                gap: 12px;
                animation: tablockSlideDown 0.4s ease-out;
                font-family: 'Kanit', sans-serif;
            }
            @media (min-width: 640px) {
                .tablock-welcome-banner {
                    flex-direction: row;
                    align-items: center;
                    justify-content: space-between;
                }
            }
            @keyframes tablockSlideDown {
                from { opacity: 0; transform: translateY(-12px); }
                to { opacity: 1; transform: translateY(0); }
            }

            /* Guide Modal Backdrop & Container */
            .tablock-guide-modal {
                position: fixed;
                inset: 0;
                z-index: 99999;
                background: rgba(15, 23, 42, 0.65);
                backdrop-filter: blur(10px);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
                opacity: 0;
                visibility: hidden;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                font-family: 'Kanit', sans-serif;
            }
            .tablock-guide-modal.active {
                opacity: 1;
                visibility: visible;
            }
            .tablock-guide-card {
                background: #ffffff;
                width: 100%;
                max-width: 680px;
                max-height: 90vh;
                border-radius: 28px;
                border: 1px solid rgba(226, 232, 240, 0.9);
                box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.25);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                transform: scale(0.95) translateY(10px);
                transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .tablock-guide-modal.active .tablock-guide-card {
                transform: scale(1) translateY(0);
            }

            /* Tabs switcher in modal */
            .tablock-guide-nav-tab {
                padding: 8px 16px;
                border-radius: 12px;
                font-size: 12px;
                font-weight: 700;
                color: #64748b;
                transition: all 0.2s;
                cursor: pointer;
                background: transparent;
                border: none;
            }
            .tablock-guide-nav-tab.active {
                background: #ffffff;
                color: #0f172a;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
            }

            /* Step Dots */
            .tablock-step-dot {
                width: 8px;
                height: 8px;
                border-radius: 9999px;
                background-color: #cbd5e1;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                cursor: pointer;
            }
            .tablock-step-dot.active {
                width: 28px;
                background: linear-gradient(135deg, #06b6d4, #6366f1);
            }
        `;
        document.head.appendChild(style);
    }

    // ===== 5. UI State Management =====
    let currentGuideKey = 'dashboard';
    let currentStepIndex = 0;
    let currentGuideTab = 'tour'; // 'tour' หรือ 'cheatsheet'

    // ===== 6. สร้างและจัดการ Modal =====
    function createGuideModal() {
        if (document.getElementById('tablock-guide-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'tablock-guide-modal';
        modal.className = 'tablock-guide-modal';
        modal.innerHTML = `
            <div class="tablock-guide-card" onclick="event.stopPropagation()">
                <!-- Header -->
                <div class="p-6 pb-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 via-cyan-50/30 to-indigo-50/40">
                    <div class="flex items-center gap-3">
                        <span id="guide-modal-icon" class="text-3xl p-2 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center">💡</span>
                        <div>
                            <div class="flex items-center gap-2">
                                <h3 id="guide-modal-title" class="text-base sm:text-lg font-extrabold text-slate-800">คู่มือแนะนำการใช้งาน</h3>
                                <span id="guide-modal-badge" class="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-cyan-100 text-cyan-700 border border-cyan-200">แนะนำ</span>
                            </div>
                            <p id="guide-modal-summary" class="text-xs text-slate-500 font-medium mt-0.5">เรียนรู้วิธีใช้งานระบบอย่างละเอียดและรวดเร็ว</p>
                        </div>
                    </div>
                    <button onclick="window.TabLockGuide.close()" class="w-9 h-9 rounded-full bg-white hover:bg-slate-100 border border-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center font-bold text-lg transition active:scale-95 shadow-xs cursor-pointer">
                        &times;
                    </button>
                </div>

                <!-- Mode Switcher (Walkthrough vs CheatSheet) & Page Switcher -->
                <div class="px-6 py-2.5 bg-slate-100/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 select-none">
                    <div class="flex p-1 bg-slate-200/70 rounded-xl">
                        <button id="guide-tab-tour-btn" onclick="window.TabLockGuide.switchGuideTab('tour')" class="tablock-guide-nav-tab active">
                            🚀 แนะนำทีละขั้นตอน
                        </button>
                        <button id="guide-tab-cheat-btn" onclick="window.TabLockGuide.switchGuideTab('cheatsheet')" class="tablock-guide-nav-tab">
                            📖 สรุปทุกฟังก์ชันในหน้านี้
                        </button>
                    </div>

                    <!-- Switch to other pages dropdown -->
                    <div class="flex items-center gap-1.5">
                        <span class="text-[11px] font-bold text-slate-500">ดูคู่มือหน้าอื่น:</span>
                        <select id="guide-page-select" onchange="window.TabLockGuide.changePage(this.value)" class="text-xs font-bold bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 focus:outline-none focus:border-cyan-500 cursor-pointer">
                            <option value="dashboard">🏠 แดชบอร์ดหลัก</option>
                            <option value="questions">📝 จัดการข้อสอบ</option>
                            <option value="active-exams">▶️ กำลังดำเนินการสอบ</option>
                            <option value="library">📚 คลังข้อสอบ</option>
                            <option value="results">📊 ตรวจสอบผลการสอบ</option>
                            <option value="monitoring">🛡️ ตรวจจับพฤติกรรม</option>
                            <option value="excel">📊 นำเข้า Excel</option>
                        </select>
                    </div>
                </div>

                <!-- Modal Body -->
                <div class="p-6 flex-grow overflow-y-auto min-h-[280px]">
                    <!-- 1. Tour Content View -->
                    <div id="guide-tour-view" class="space-y-4">
                        <div class="flex items-center justify-between">
                            <span id="guide-step-badge" class="text-xs font-black uppercase tracking-wider text-cyan-600 bg-cyan-50 border border-cyan-200/60 px-3 py-1 rounded-full">
                                ขั้นตอนที่ 1 จาก 4
                            </span>
                            <!-- Step Dots Container -->
                            <div id="guide-step-dots" class="flex items-center gap-1.5"></div>
                        </div>

                        <!-- Main Step Card -->
                        <div class="p-6 bg-gradient-to-b from-slate-50 to-white border border-slate-200/80 rounded-2xl shadow-xs space-y-4">
                            <div class="flex items-start gap-4">
                                <div id="guide-step-icon" class="text-3xl p-3 bg-gradient-to-tr from-cyan-500 to-indigo-500 text-white rounded-2xl shadow-md shrink-0 flex items-center justify-center">
                                    ✍️
                                </div>
                                <div class="space-y-1">
                                    <h4 id="guide-step-title" class="text-base sm:text-lg font-black text-slate-900 leading-snug">
                                        หัวข้อขั้นตอน
                                    </h4>
                                    <div id="guide-step-content" class="text-xs sm:text-sm text-slate-600 leading-relaxed font-normal">
                                        คำอธิบายขั้นตอน
                                    </div>
                                </div>
                            </div>

                            <!-- Pro Tip Box -->
                            <div id="guide-step-tip-box" class="p-3.5 bg-amber-50/70 border border-amber-200/70 rounded-xl text-xs text-amber-900 font-medium flex items-start gap-2">
                                <span id="guide-step-tip">💡 เคล็ดลับเพิ่มเติม</span>
                            </div>
                        </div>
                    </div>

                    <!-- 2. Cheat Sheet Content View -->
                    <div id="guide-cheatsheet-view" class="hidden space-y-4">
                        <div class="text-xs text-slate-500 font-medium">
                            สรุปฟังก์ชันและปุ่มสำคัญทั้งหมดของหน้านี้ เพื่อให้อาจารย์ใช้งานได้อย่างคล่องแคล่ว:
                        </div>
                        <div id="guide-cheatsheet-list" class="space-y-2.5">
                            <!-- Items will be rendered here -->
                        </div>
                    </div>
                </div>

                <!-- Footer Navigation -->
                <div class="p-5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3">
                    <button id="guide-prev-btn" onclick="window.TabLockGuide.prevStep()" class="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-extrabold text-xs transition active:scale-95 shadow-xs flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                        <span>⬅️ ก่อนหน้า</span>
                    </button>

                    <div class="flex items-center gap-2">
                        <button onclick="window.TabLockGuide.close()" class="px-4 py-2.5 rounded-xl text-slate-500 hover:text-slate-800 font-extrabold text-xs transition cursor-pointer">
                            ปิดคู่มือ
                        </button>
                        <button id="guide-next-btn" onclick="window.TabLockGuide.nextStep()" class="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-700 hover:to-indigo-700 text-white font-extrabold text-xs transition shadow-md shadow-cyan-500/20 active:scale-95 flex items-center gap-1.5 cursor-pointer">
                            <span>ถัดไป ➡️</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        modal.addEventListener('click', (e) => {
            if (e.target === modal) window.TabLockGuide.close();
        });

        document.body.appendChild(modal);
    }

    // ===== 7. สร้าง Floating Button =====
    function createFloatingGuideButton() {
        if (document.getElementById('tablock-floating-guide-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'tablock-floating-guide-btn';
        btn.className = 'tablock-floating-guide-btn';
        btn.setAttribute('title', 'กดเพื่อเปิดคู่มือสอนการใช้งานหน้านี้');
        btn.innerHTML = `
            <span class="tablock-guide-pulse-dot"></span>
            <span class="text-base">💡</span>
            <span>แนะนำวิธีใช้งาน</span>
        `;
        btn.onclick = () => {
            window.TabLockGuide.open(getCurrentPageKey());
        };

        document.body.appendChild(btn);
    }

    // ===== 8. สร้าง Welcome Banner สำหรับผู้ใช้ใหม่ =====
    function checkAndShowFirstTimeBanner() {
        const pageKey = getCurrentPageKey();
        if (hasSeenGuide(pageKey)) return;

        // หาจุดที่จะแทรก Banner
        const targetContainer = document.querySelector('main') || document.querySelector('#main-area') || document.body;
        if (!targetContainer) return;

        const data = GUIDE_DATA[pageKey] || GUIDE_DATA['dashboard'];

        const banner = document.createElement('div');
        banner.id = 'tablock-first-time-banner';
        banner.className = 'tablock-welcome-banner max-w-5xl mx-auto';
        banner.innerHTML = `
            <div class="flex items-center gap-3">
                <span class="text-3xl p-2.5 bg-white rounded-2xl shadow-sm border border-indigo-100 flex items-center justify-center">${data.icon}</span>
                <div>
                    <div class="flex items-center gap-2">
                        <h4 class="text-sm md:text-base font-black text-slate-800">
                            👋 เพิ่งเริ่มใช้งานหน้า ${data.title.split('(')[0].trim()} ใช่ไหมครับ?
                        </h4>
                        <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">คู่มือแนะนำ</span>
                    </div>
                    <p class="text-xs text-slate-600 font-medium mt-0.5">
                        ดูคำแนะนำวิธีใช้งานหน้านี้สั้นๆ (1 นาที) เพื่อช่วยให้คุณจัดการข้อสอบได้อย่างคล่องแคล่ว
                    </p>
                </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <button onclick="window.TabLockGuide.open('${pageKey}'); window.TabLockGuide.dismissFirstTimeBanner();" class="px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-700 hover:to-indigo-700 text-white font-extrabold text-xs rounded-xl transition shadow-md active:scale-95 flex items-center gap-1.5 cursor-pointer">
                    <span>✨ เริ่มดูวิธีใช้งาน</span>
                </button>
                <button onclick="window.TabLockGuide.dismissFirstTimeBanner()" class="px-3 py-2.5 bg-white/80 hover:bg-white text-slate-600 hover:text-slate-800 font-bold text-xs rounded-xl border border-slate-200 transition cursor-pointer">
                    ✕ ข้ามไปก่อน
                </button>
            </div>
        `;

        // แทรกเป็นชิ้นแรกใน main
        if (targetContainer.firstChild) {
            targetContainer.insertBefore(banner, targetContainer.firstChild);
        } else {
            targetContainer.appendChild(banner);
        }
    }

    // ===== 9. เรนเดอร์ข้อมูลใน Modal =====
    function renderModalContent() {
        const data = GUIDE_DATA[currentGuideKey] || GUIDE_DATA['dashboard'];

        // Header info
        document.getElementById('guide-modal-icon').innerText = data.icon;
        document.getElementById('guide-modal-title').innerText = data.title;
        document.getElementById('guide-modal-badge').innerText = data.badge;
        document.getElementById('guide-modal-summary').innerText = data.summary;
        document.getElementById('guide-page-select').value = currentGuideKey;

        // Tab views toggle
        const tourView = document.getElementById('guide-tour-view');
        const cheatView = document.getElementById('guide-cheatsheet-view');
        const tourBtn = document.getElementById('guide-tab-tour-btn');
        const cheatBtn = document.getElementById('guide-tab-cheat-btn');
        const prevBtn = document.getElementById('guide-prev-btn');
        const nextBtn = document.getElementById('guide-next-btn');

        if (currentGuideTab === 'tour') {
            tourView.classList.remove('hidden');
            cheatView.classList.add('hidden');
            tourBtn.classList.add('active');
            cheatBtn.classList.remove('active');
            prevBtn.classList.remove('hidden');

            // Render Current Step
            const steps = data.steps;
            const step = steps[currentStepIndex] || steps[0];

            document.getElementById('guide-step-badge').innerText = `ขั้นตอนที่ ${currentStepIndex + 1} จาก ${steps.length} • ${step.badge}`;
            document.getElementById('guide-step-icon').innerText = step.icon;
            document.getElementById('guide-step-title').innerText = step.title;
            document.getElementById('guide-step-content').innerHTML = step.content;
            document.getElementById('guide-step-tip').innerHTML = step.tip;

            // Render Dots
            const dotsContainer = document.getElementById('guide-step-dots');
            dotsContainer.innerHTML = steps.map((_, idx) => `
                <div onclick="window.TabLockGuide.goToStep(${idx})" class="tablock-step-dot ${idx === currentStepIndex ? 'active' : ''}" title="ขั้นตอนที่ ${idx + 1}"></div>
            `).join('');

            // Prev / Next button states
            prevBtn.disabled = currentStepIndex === 0;
            if (currentStepIndex === steps.length - 1) {
                nextBtn.innerHTML = `<span>🎉 เข้าใจแล้ว / เริ่มใช้งาน</span>`;
            } else {
                nextBtn.innerHTML = `<span>ถัดไป ➡️</span>`;
            }
        } else {
            tourView.classList.add('hidden');
            cheatView.classList.remove('hidden');
            tourBtn.classList.remove('active');
            cheatBtn.classList.add('active');
            prevBtn.classList.add('hidden');
            nextBtn.innerHTML = `<span>✨ ปิดคู่มือ</span>`;

            // Render CheatSheet
            const cheatList = document.getElementById('guide-cheatsheet-list');
            cheatList.innerHTML = (data.cheatSheet || []).map(item => `
                <div class="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-start gap-3">
                    <span class="text-cyan-600 font-black text-sm shrink-0">🔹</span>
                    <div>
                        <div class="text-xs sm:text-sm font-extrabold text-slate-800">${item.name}</div>
                        <div class="text-xs text-slate-600 font-medium mt-0.5">${item.desc}</div>
                    </div>
                </div>
            `).join('');
        }
    }

    // ===== 10. Public API Object =====
    window.TabLockGuide = {
        open: function (pageKey) {
            currentGuideKey = pageKey || getCurrentPageKey();
            currentStepIndex = 0;
            currentGuideTab = 'tour';
            createGuideModal();
            renderModalContent();

            const modal = document.getElementById('tablock-guide-modal');
            if (modal) modal.classList.add('active');
            markGuideAsSeen(currentGuideKey);
        },

        close: function () {
            const modal = document.getElementById('tablock-guide-modal');
            if (modal) modal.classList.remove('active');
        },

        nextStep: function () {
            if (currentGuideTab === 'cheatsheet') {
                this.close();
                return;
            }
            const steps = (GUIDE_DATA[currentGuideKey] || {}).steps || [];
            if (currentStepIndex < steps.length - 1) {
                currentStepIndex++;
                renderModalContent();
            } else {
                this.close();
            }
        },

        prevStep: function () {
            if (currentStepIndex > 0) {
                currentStepIndex--;
                renderModalContent();
            }
        },

        goToStep: function (index) {
            currentStepIndex = index;
            renderModalContent();
        },

        switchGuideTab: function (tab) {
            currentGuideTab = tab;
            renderModalContent();
        },

        changePage: function (pageKey) {
            currentGuideKey = pageKey;
            currentStepIndex = 0;
            renderModalContent();
        },

        dismissFirstTimeBanner: function () {
            const pageKey = getCurrentPageKey();
            markGuideAsSeen(pageKey);
            const banner = document.getElementById('tablock-first-time-banner');
            if (banner) banner.remove();
        },

        resetGuideSeen: function () {
            Object.keys(GUIDE_DATA).forEach(k => {
                localStorage.removeItem(STORAGE_KEY_PREFIX + k);
            });
            alert('รีเซ็ตสถานะคู่มือเรียบร้อยแล้ว หน้าเว็บจะแสดงคำแนะนำเหมือนผู้ใช้ใหม่ครับ');
            location.reload();
        }
    };

    // Keyboard support (Esc to close, Left/Right for steps)
    window.addEventListener('keydown', (e) => {
        const modal = document.getElementById('tablock-guide-modal');
        if (!modal || !modal.classList.contains('active')) return;
        if (e.key === 'Escape') window.TabLockGuide.close();
        if (e.key === 'ArrowRight') window.TabLockGuide.nextStep();
        if (e.key === 'ArrowLeft') window.TabLockGuide.prevStep();
    });

    // ===== 11. Initializer =====
    function init() {
        injectGuideStyles();
        createGuideModal();
        createFloatingGuideButton();
        setTimeout(checkAndShowFirstTimeBanner, 400);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
