/**
 * Tab-Lock Online Proctoring System - Interactive User Guide & Onboarding Tour System
 * ระบบคู่มือแนะแนวการใช้งานอัจฉริยะ แสดงอัตโนมัติเฉพาะครั้งแรกที่เข้าใช้งานแต่ละหน้า
 * และคงปุ่ม "💡 แนะนำวิธีใช้งาน" เพื่อให้อาจารย์และนักศึกษากดเปิดดูคู่มือซ้ำได้ตลอดเวลา
 */

(function () {
    'use strict';

    // ===== 1. ข้อมูลคู่มือการใช้งานแบบครอบคลุมทุกหน้า =====
    const GUIDE_DATA = {
        'dashboard': {
            title: 'แดชบอร์ดหลัก (Dashboard)',
            icon: '🏠',
            badge: 'หน้าเริ่มต้น',
            summary: 'ศูนย์กลางควบคุมภาพรวมของระบบสอบออนไลน์ Tab-Lock',
            steps: [
                {
                    title: 'ยินดีต้อนรับสู่ Tab-Lock Proctoring',
                    badge: 'ภาพรวมระบบ',
                    icon: '🎓',
                    content: 'Tab-Lock คือระบบจัดสอบและประมวลผลอัจฉริยะ พร้อมระบบ <strong>AI Anti-Cheat</strong> ตรวจจับการสลับแท็บหน้าจอ และระบบวิเคราะห์ผลสอบอัตโนมัติ ช่วยให้อาจารย์จัดสอบได้อย่างสะดวก รวดเร็ว และโปร่งใส',
                    tip: '💡 สามารถดูสถิติต่างๆ และสลับเมนูได้จาก Sidebar แถบเมนูด้านซ้ายตลอดเวลา'
                },
                {
                    title: 'ปุ่มสร้างและจัดการข้อสอบใหม่',
                    badge: 'การเริ่มต้น',
                    icon: '✍️',
                    content: 'กดปุ่มสีชมพู <strong>"+ สร้างและจัดการข้อสอบใหม่"</strong> เพื่อเริ่มสร้างห้องสอบใหม่ ตั้งเวลานับถอยหลัง กำหนดรหัส PIN เข้าสอบ และเพิ่มข้อสอบได้ทันที',
                    tip: '💡 สามารถสร้างห้องสอบได้หลายห้องตามรายวิชาหรือกลุ่มเรียน (Section)'
                },
                {
                    title: 'ระบบ AI Quiz Generator & นำเข้า Excel',
                    badge: 'เครื่องมือช่วยออกข้อสอบ',
                    icon: '🧠',
                    content: 'ประหยัดเวลาด้วย <strong>AI Quiz Generator</strong> ที่ช่วยร่างโจทย์และตัวเลือกให้ หรือเลือกนำเข้าข้อสอบจากไฟล์ <strong>Excel</strong> ได้ครั้งละหลายสิบข้อในไม่กี่วินาที',
                    tip: '💡 มีไฟล์แม่แบบ Excel ให้ดาวน์โหลดในหน้าจัดการข้อสอบ'
                },
                {
                    title: 'ตรวจสอบผลคะแนน & พฤติกรรมนักศึกษา',
                    badge: 'การติดตามผล',
                    icon: '📊',
                    content: 'เข้าดูห้องสอบที่กำลังเปิดใน <strong>"กำลังดำเนินการสอบ"</strong>, ตรวจสอบคะแนนใน <strong>"ตรวจสอบผลการสอบ"</strong>, และดูประวัติสลับหน้าจอใน <strong>"ตรวจจับพฤติกรรม"</strong>',
                    tip: '💡 ระบบบันทึกคะแนนและคำนวณสถิติ Mean, S.D., และ Item Analysis ให้อัตโนมัติ'
                }
            ],
            cheatSheet: [
                { name: 'สร้างข้อสอบใหม่', desc: 'กดปุ่ม "+ สร้างและจัดการข้อสอบใหม่" เพื่อเริ่มสร้างห้องสอบ' },
                { name: 'AI Quiz Generator', desc: 'สร้างโจทย์และช้อยส์อัตโนมัติด้วย AI ตามหัวข้อวิชาที่ระบุ' },
                { name: 'นำเข้า Excel', desc: 'อัปโหลดไฟล์ตาราง Excel เพื่อเพิ่มข้อสอบทีละหลายข้อ' },
                { name: 'ตรวจสอบผลสอบ', desc: 'ดูคะแนน สถิติห้องเรียน และดาวน์โหลดรายงาน Excel' },
                { name: 'ระบบจับทุจริต', desc: 'ดูประวัตินักศึกษาที่สลับหน้าจอหรือเปิดแท็บอื่น' }
            ]
        },

        'questions': {
            title: 'จัดการข้อสอบ (Questions Management)',
            icon: '📝',
            badge: 'สร้างและแก้ไขข้อสอบ',
            summary: 'เครื่องมือสร้างข้อสอบ กำหนดจำนวนข้อ แนบรูป ช้อยส์ เฉลย และออกข้อสอบ',
            steps: [
                {
                    title: 'เลือกรหัสห้องสอบ & ตั้งค่าแบบทดสอบ',
                    badge: 'ขั้นตอนที่ 1',
                    icon: '🏠',
                    content: 'เลือกรหัสห้องสอบที่ต้องการจัดการที่มุมบนขวา จากนั้นกดปุ่ม <strong>"⚙️ ตั้งค่าแบบทดสอบ"</strong> เพื่อตั้งชื่อการสอบ, เวลาทำข้อสอบ (นาที), รหัส PIN และสุ่มลำดับช้อยส์',
                    tip: '💡 หากยังไม่มีห้องสอบ สามารถกดเริ่มสร้างห้องสอบใหม่ได้ทันที'
                },
                {
                    title: 'กำหนดจำนวนข้อสอบที่ต้องการสร้าง',
                    badge: 'ขั้นตอนที่ 2',
                    icon: '🔢',
                    content: 'ใช้ปุ่มลัดเลือกจำนวนข้อ เช่น 5, 10, 20, 30 ข้อ หรือระบุจำนวนข้อเอง ระบบจะสร้างฟอร์มคำถามให้อย่างรวดเร็วตามจำนวนข้อที่ต้องการ',
                    tip: '💡 สามารถกดเพิ่มข้อคำถามต่อท้ายได้ตลอดเวลา'
                },
                {
                    title: 'กรอกโจทย์ ช้อยส์ เฉลย และแนบรูปภาพ',
                    badge: 'ขั้นตอนที่ 3',
                    icon: '✍️',
                    content: 'พิมพ์โจทย์คำถาม กรอกตัวเลือกคำตอบ ติ๊กเลือกปุ่ม <strong>"🔘 เฉลย"</strong> สำหรับข้อที่ถูกต้อง และกด <strong>"📸 แนบรูปภาพ"</strong> ที่โจทย์หรือตัวเลือกได้',
                    tip: '💡 เพิ่มช้อยส์ได้สูงสุดถึง 10 ตัวเลือกต่อหนึ่งข้อคำถาม'
                },
                {
                    title: 'ดึงข้อสอบจากคลัง & บันทึกแบบร่าง',
                    badge: 'ขั้นตอนที่ 4',
                    icon: '📚',
                    content: 'กดปุ่ม <strong>"📂 เลือกข้อสอบจากคลังข้อสอบ"</strong> เพื่อนำชุดข้อสอบเก่าในคลังกลับมาใช้ซ้ำได้ และเมื่อกรอกข้อสอบเสร็จแล้ว ให้กดปุ่ม <strong>"💾 บันทึกแบบร่างส่งฐานข้อมูล"</strong>',
                    tip: '💡 อย่าลืมกดบันทึกแบบร่างทุกครั้งหลังแก้ไขข้อสอบ'
                },
                {
                    title: 'ตรวจสอบและยืนยันเผยแพร่ข้อสอบ',
                    badge: 'ขั้นตอนที่ 5',
                    icon: '🟢',
                    content: 'สลับไปที่แท็บ <strong>"🔍 ตรวจสอบข้อสอบปัจจุบัน"</strong> และกดปุ่ม <strong>"🟢 ยืนยันเผยแพร่ให้นักศึกษาเข้าสอบ"</strong> เพื่อสร้างรหัส PIN 6 หลักและเปิดให้นักศึกษาเข้าสอบ',
                    tip: '💡 เมื่อกดเผยแพร่แล้ว ระบบจะสร้างรหัส PIN 6 หลักเพื่อส่งให้นักศึกษาทันที'
                }
            ],
            cheatSheet: [
                { name: 'ปุ่มลัดจำนวนข้อ', desc: 'สร้างช่องกรอกข้อสอบตามจำนวนที่เลือกทันที' },
                { name: 'แนบรูปภาพ', desc: 'รองรับรูปภาพประกอบโจทย์และตัวเลือก A-J' },
                { name: 'เลือกเฉลย', desc: 'ติ๊กวงกลม "เฉลย" ที่คำตอบที่ถูกต้อง' },
                { name: 'คลังข้อสอบ', desc: 'ดึงชุดข้อสอบที่เคยบันทึกไว้ในคลังส่วนตัวกลับมาใช้ซ้ำ' },
                { name: 'ยืนยันเผยแพร่', desc: 'กดปุ่มสีเขียวเพื่อสร้างรหัส PIN 6 หลักเปิดระบบให้เด็กเข้าสอบ' }
            ]
        },

        'rooms': {
            title: 'จัดการห้องสอบ & เช็คชื่อสด (Exam Rooms & Attendance)',
            icon: '🚪',
            badge: 'ห้องสอบและ PIN',
            summary: 'ศูนย์ควบคุมห้องสอบ เผยแพร่ PIN 6 หลัก และเช็คชื่อเข้าสอบเรียลไทม์',
            steps: [
                {
                    title: 'สร้างและผูกห้องสอบกับรายวิชา',
                    badge: 'ขั้นตอนที่ 1',
                    icon: '📌',
                    content: 'เลือกรายวิชาและสร้างห้องสอบประจำกลุ่มเรียน (Section) เพื่อให้ระบบนำรายชื่อนักศึกษาในวิชานั้นมาเปรียบเทียบเมื่อมีการเข้าสอบ',
                    tip: '💡 สามารถตั้งชื่อห้องสอบ เช่น "สอบปลายภาค กลุ่ม 1" เพื่อจัดหมวดหมู่ได้ง่าย'
                },
                {
                    title: 'เผยแพร่ข้อสอบ & รับรหัส PIN 6 หลัก',
                    badge: 'ขั้นตอนที่ 2',
                    icon: '🔑',
                    content: 'กดปุ่ม <strong>"🟢 เผยแพร่ข้อสอบ"</strong> ระบบจะสุ่มสร้างรหัส <strong>PIN 6 หลัก</strong> ประจำห้องสอบ นำรหัส PIN นี้ไปแจ้งให้นักศึกษากรอกเข้าสอบที่หน้าเว็บ',
                    tip: '💡 นักศึกษาสามารถนำ PIN 6 หลักไปกรอกเข้าสอบได้ทันทีโดยไม่ต้องจำลิงก์ยาวๆ'
                },
                {
                    title: 'เช็คชื่อเข้าสอบแบบเรียลไทม์ (Room Roster Attendance)',
                    badge: 'ขั้นตอนที่ 3',
                    icon: '👥',
                    content: 'กดปุ่ม <strong>"👥 ดูรายชื่อผู้เข้าสอบ/ขาดสอบ"</strong> เพื่อเปิดป๊อปอัปเทียบรายชื่อในวิชานั้น โดยแสดงผล 🟢 เข้าสอบแล้ว / 🔴 ยังไม่เข้าสอบ แบบ Real-time',
                    tip: '💡 มีแท็บตัวกรองเฉพาะคนที่ยังไม่เข้าสอบ เพื่อใช้นับยอดเช็คชื่อในห้องเรียนได้ทันที'
                }
            ],
            cheatSheet: [
                { name: 'รหัส PIN 6 หลัก', desc: 'รหัสลับประจำห้องสอบสำหรับให้นักศึกษากรอกเข้าสอบ' },
                { name: 'ปุ่มเผยแพร่ (Publish)', desc: 'เปิด/ปิดการเข้าทำข้อสอบของห้องสอบนั้นๆ' },
                { name: 'เช็คชื่อเข้าสอบสด', desc: 'ดูรายชื่อคนที่สอบแล้วและยังไม่เข้าสอบเปรียบเทียบกับรายชื่อวิชา' },
                { name: 'รีเซ็ตห้องสอบ', desc: 'ล้างประวัติผลสอบเดิมเพื่อเตรียมสอบรอบใหม่' }
            ]
        },

        'courses': {
            title: 'จัดการรายวิชา & รายชื่อนักศึกษา (Course Management)',
            icon: '📚',
            badge: 'โครงสร้างวิชา',
            summary: 'สร้างรายวิชาและนำเข้ารายชื่อนักศึกษาในวิชาด้วยไฟล์ Excel',
            steps: [
                {
                    title: 'สร้างรายวิชาใหม่ (Create Course)',
                    badge: 'ขั้นตอนที่ 1',
                    icon: '➕',
                    content: 'ระบุ <strong>รหัสวิชา</strong> (เช่น 749-51-447) และ <strong>ชื่อวิชา</strong> พร้อมภาคการศึกษา เพื่อใช้เป็นศูนย์กลางรวบรวมห้องสอบและรายชื่อเด็ก',
                    tip: '💡 1 รายวิชา สามารถมีห้องสอบย่อยได้หลายห้องสอบ'
                },
                {
                    title: 'นำเข้ารายชื่อนักศึกษาจาก Excel (Excel Roster Import)',
                    badge: 'ขั้นตอนที่ 2',
                    icon: '📥',
                    content: 'อัปโหลดไฟล์ตาราง Excel ที่มีคอลัมน์ <strong>รหัสนักศึกษา, ชื่อ-นามสกุล, กลุ่มเรียน/ห้อง</strong> เข้าสู่รายวิชา',
                    tip: '💡 เมื่อนักศึกษาเข้าสอบ ระบบจะนำรหัสนักศึกษามาเทียบกับรายชื่อในวิชานี้อัตโนมัติ'
                },
                {
                    title: 'จัดการรายชื่อนักศึกษาในวิชา',
                    badge: 'ขั้นตอนที่ 3',
                    icon: '👤',
                    content: 'ค้นหา เพิ่ม แก้ไข หรือลบรายชื่อนักศึกษาในวิชาได้ตลอดเวลา พร้อมดูจำนวนนักศึกษาที่ลงทะเบียนในวิชา',
                    tip: '💡 หากมีเด็กย้ายเซกชัน สามารถอัปเดตข้อมูลได้ทันที'
                }
            ],
            cheatSheet: [
                { name: 'รหัสวิชา & ชื่อวิชา', desc: 'กำหนดรหัสวิชาเพื่อจัดหมวดหมู่ข้อสอบและรายชื่อ' },
                { name: 'นำเข้า Excel รายชื่อ', desc: 'อัปโหลดรายชื่อเด็กทั้งเซกชันเข้าสู่วิชาในปุ่มเดียว' },
                { name: 'เทียบรหัสนักศึกษา', desc: 'ระบบใช้รหัสนักศึกษาตรวจสอบสิทธิ์การเข้าสอบอัตโนมัติ' }
            ]
        },

        'students': {
            title: 'ทำเนียบนักศึกษา & อนุมัติสิทธิ์ (Students Directory)',
            icon: '👨‍🎓',
            badge: 'ฐานข้อมูลนักศึกษา',
            summary: 'ค้นหารหัสนักศึกษา ตรวจสอบประวัติ อนุมัติสมัครสมาชิก และอนุมัติสิทธิ์เข้าสอบ',
            steps: [
                {
                    title: 'ค้นหารายชื่อและรหัสนักศึกษา',
                    badge: 'การค้นหา',
                    icon: '🔍',
                    content: 'พิมพ์รหัสนักศึกษา ชื่อ หรือกลุ่มเรียน เพื่อค้นหาประวัติการสอบ ยอดการเข้าใช้งาน และสถานะอนุมัติในระบบ',
                    tip: '💡 สามารถดูประวัติการเข้าสอบย้อนหลังของนักศึกษาแต่ละคนได้'
                },
                {
                    title: 'อนุมัติสิทธิ์การสมัครเข้าใช้งาน (Approve Pending Students)',
                    badge: 'ความปลอดภัย',
                    icon: '✅',
                    content: 'หากตั้งค่าให้ต้องอนุมัติก่อนเข้าใช้งาน อาจารย์สามารถกดปุ่ม <strong>"อนุมัติสิทธิ์"</strong> ให้นักศึกษาใหม่เข้าสอบได้',
                    tip: '💡 มีปุ่ม "อนุมัติทั้งหมด" เพื่ออนุมัติเด็กนักศึกษาพร้อมกันในครั้งเดียว'
                }
            ],
            cheatSheet: [
                { name: 'ค้นหารหัสนักศึกษา', desc: 'ค้นหาประวัติและผลสอบของเด็กรายบุคคล' },
                { name: 'อนุมัตินักศึกษาใหม่', desc: 'ยืนยันบัญชีนักศึกษาเพื่อให้มีสิทธิ์ล็อกอินเข้าสอบ' },
                { name: 'ประวัติการทุจริต', desc: 'ตรวจสอบจำนวนครั้งที่สลับหน้าจอของนักศึกษาแต่ละคน' }
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
                    content: 'หน้านี้จะแสดงห้องสอบทั้งหมดที่ผ่านการ <strong>เผยแพร่ (Publish)</strong> แล้ว พร้อมแสดงรหัส PIN 6 หลัก และเวลาสอบ',
                    tip: '💡 หากไม่พบห้องสอบ กรุณาไปที่หน้า "จัดการข้อสอบ" หรือ "จัดการห้องสอบ" แล้วกดเผยแพร่ก่อนครับ'
                },
                {
                    title: 'คัดลอกรหัส PIN & ลิงก์เข้าสอบ',
                    badge: 'ส่งให้นักศึกษา',
                    icon: '📋',
                    content: 'กดปุ่มคัดลอกรหัส PIN 6 หลัก หรือคัดลอกลิงก์เข้าสอบ เพื่อส่งให้นักศึกษาเข้าทำข้อสอบได้ทันทีผ่านคอมพิวเตอร์ หรือสมาร์ตโฟน',
                    tip: '💡 นักศึกษาเพียงกรอก PIN 6 หลักที่หน้าเว็บก็เข้าทำข้อสอบได้ทันที'
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
                    content: 'เมื่อหมดเวลาการสอบ อาจารย์สามารถกดปุ่ม <strong>"ปิดรับข้อสอบ"</strong> เพื่อเปลี่ยนสถานะกลับเป็นแบบร่าง ไม่ให้นักศึกษาเข้าสอบเพิ่ม',
                    tip: '💡 สามารถเปิดกลับมาใหม่ได้ทุกเมื่อที่ต้องการ'
                }
            ],
            cheatSheet: [
                { name: 'รหัส PIN 6 หลัก', desc: 'รหัสเข้าสอบสำหรับให้นักศึกษากรอกล็อกอิน' },
                { name: 'สถานะออนไลน์', desc: 'แสดงจำนวนนักศึกษาที่กำลังทำข้อสอบอยู่ในขณะนี้' },
                { name: 'ผู้ส่งข้อสอบแล้ว', desc: 'แสดงจำนวนนักศึกษาที่ทำข้อสอบเสร็จสิ้นและส่งแล้ว' },
                { name: 'ปิดรับข้อสอบ', desc: 'ยุติการสอบและปิดไม่ให้นักศึกษาเข้าทำข้อสอบเพิ่ม' }
            ]
        },

        'results': {
            title: 'ตรวจสอบผลการสอบ (Exam Results & Scores)',
            icon: '📊',
            badge: 'ผลคะแนนและสถิติ',
            summary: 'ดูผลคะแนนสอบ สถิติห้องเรียน สถิติรายข้อ และส่งออกไฟล์รายงาน Excel',
            steps: [
                {
                    title: 'เลือกรหัสห้องสอบเพื่อดูผลคะแนน',
                    badge: 'ขั้นตอนที่ 1',
                    icon: '🔍',
                    content: 'เลือกรหัสห้องสอบหรือรายวิชาที่ต้องการตรวจสอบคะแนน ระบบจะดึงรายชื่อนักศึกษา คะแนนที่ได้ เวลาที่ส่งข้อสอบ และคำตอบมาแสดงทันที',
                    tip: '💡 มีช่องค้นหาชื่อหรือรหัสนักศึกษาอย่างรวดเร็ว'
                },
                {
                    title: 'สถิติภาพรวมชั้นเรียน (Classroom Statistics)',
                    badge: 'ขั้นตอนที่ 2',
                    icon: '📈',
                    content: 'ระบบจะคำนวณค่าสถิติให้อัตโนมัติ ได้แก่ <strong>คะแนนเฉลี่ย (Mean)</strong>, <strong>ส่วนเบี่ยงเบนมาตรฐาน (S.D.)</strong>, <strong>คะแนนสูงสุด/ต่ำสุด</strong>',
                    tip: '💡 นำค่าสถิติไปใช้ในการประเมินผลการเรียนรู้ตามเกณฑ์มาตรฐานได้ทันที'
                },
                {
                    title: 'ส่งออกรายงาน Excel (Export to Excel)',
                    badge: 'ขั้นตอนที่ 3',
                    icon: '📥',
                    content: 'กดปุ่ม <strong>"📊 ส่งออกรายงาน Excel"</strong> เพื่อดาวน์โหลดตารางสรุปคะแนนและคำตอบรายบุคคล นำไปตัดเกรดได้ทันที',
                    tip: '💡 ไฟล์ Excel มีการจัดรูปแบบสวยงามพร้อมใช้งานทันที'
                }
            ],
            cheatSheet: [
                { name: 'คะแนนเฉลี่ย (Mean)', desc: 'คะแนนเฉลี่ยของนักศึกษาทุกคนในห้องเรียน' },
                { name: 'ส่วนเบี่ยงเบน (S.D.)', desc: 'ค่าการกระจายของคะแนนในชั้นเรียน' },
                { name: 'Export Excel', desc: 'ดาวน์โหลดไฟล์ผลคะแนนทั้งหมดลงคอมพิวเตอร์' },
                { name: 'ลบประวัติการสอบ', desc: 'ล้างข้อมูลคะแนนเพื่อจัดสอบรอบใหม่' }
            ]
        },

        'analysis': {
            title: 'วิเคราะห์คุณภาพข้อสอบ (Exam Item Analysis)',
            icon: '🎯',
            badge: 'คุณภาพแบบทดสอบ',
            summary: 'คำนวณค่าความยากง่าย (p-value) และค่าอำนาจจำแนก (r-value) ของข้อสอบรายข้อ',
            steps: [
                {
                    title: 'เลือกห้องสอบเพื่อวิเคราะห์คุณภาพ',
                    badge: 'ขั้นตอนที่ 1',
                    icon: '🔍',
                    content: 'เลือกรหัสห้องสอบที่ต้องการวิเคราะห์ ระบบจะนำผลคะแนนการตอบของนักศึกษาทุกคนมาประมวลผลเชิงสถิติรายข้อ',
                    tip: '💡 ยิ่งมีจำนวนผู้เข้าสอบมาก ค่าวิเคราะห์สถิติจะยิ่งมีความเที่ยงตรงสูง'
                },
                {
                    title: 'ค่าความยากง่าย (Difficulty Index: p-value)',
                    badge: 'ขั้นตอนที่ 2',
                    icon: '📊',
                    content: 'แสดงสัดส่วนผู้ตอบถูก (0.00 - 1.00) ข้อสอบที่ดีควรมีค่า p อยู่ระหว่าง <strong>0.20 - 0.80</strong> (ไม่ยากหรือง่ายจนเกินไป)',
                    tip: '💡 ค่า p สูงแสดงว่าข้อสอบง่าย ค่า p ต่ำแสดงว่าข้อสอบยาก'
                },
                {
                    title: 'ค่าอำนาจจำแนก (Discrimination Index: r-value)',
                    badge: 'ขั้นตอนที่ 3',
                    icon: '⚖️',
                    content: 'วัดความสามารถในการจำแนกคนเก่งออกจากคนอ่อน ข้อสอบคุณภาพดีควรมีค่า r ตั้งแต่ <strong>0.20 ขึ้นไป</strong>',
                    tip: '💡 หากค่า r ติดลบ แสดงว่าคนตอบผิดส่วนใหญ่เป็นกลุ่มคนเก่ง ควรปรับแก้โจทย์'
                }
            ],
            cheatSheet: [
                { name: 'ค่า p (ความยาก)', desc: 'สัดส่วนคนตอบถูก (0.20 - 0.80 คือเกณฑ์เหมาะสม)' },
                { name: 'ค่า r (อำนาจจำแนก)', desc: 'ความสามารถในการจำแนกกลุ่มเก่ง/อ่อน (>= 0.20 ขึ้นไปดีมาก)' },
                { name: 'กราฟจำแนกตัวเลือก', desc: 'ดูสถิติการเลือกช้อยส์ A, B, C, D ของนักศึกษา' }
            ]
        },

        'monitoring': {
            title: 'ตรวจจับพฤติกรรมน่าสงสัย (AI Anti-Cheat Monitor)',
            icon: '🛡️',
            badge: 'ความปลอดภัยการสอบ',
            summary: 'บันทึกประวัติการสลับหน้าจอ (Tab Switch) และส่งข้อความเตือนนักศึกษาแบบ Real-time',
            steps: [
                {
                    title: 'ระบบ AI Anti-Cheat ทำงานอย่างไร?',
                    badge: 'เทคโนโลยีตรวจจับ',
                    icon: '👁️',
                    content: 'ระหว่างทำข้อสอบ ระบบจะล็อกหน้าจอให้อยู่ในโหมดเต็มจอ หากนักศึกษามีการ <strong>สลับหน้าจอ (Tab Switch)</strong>, เปิดแท็บอื่น หรือออกจากเต็มจอ ระบบจะบันทึก Log ทันที',
                    tip: '💡 ระบบทำงานโดยอัตโนมัติ ช่วยรักษาความโปร่งใสของการสอบ'
                },
                {
                    title: 'ส่งข้อความเตือนนักศึกษาแบบรายคน (Send Warning)',
                    badge: 'การควบคุมสด',
                    icon: '💬',
                    content: 'กดปุ่ม <strong>"💬 ส่งข้อความเตือน"</strong> เพื่อส่งข้อความป๊อปอัปแจ้งเตือนตรงไปยังหน้าจอของนักศึกษาคนที่สลับหน้าจอได้ทันที',
                    tip: '💡 ข้อความจะเด้งขึ้นบนหน้าจอเด็กขณะกำลังทำข้อสอบ'
                },
                {
                    title: 'การปลดล็อกสิทธิ์ให้นักศึกษา',
                    badge: 'การแก้ปัญหา',
                    icon: '🔓',
                    content: 'หากนักศึกษาเกิดเหตุสุดวิสัย (เช่น เน็ตหลุด หรือระบบหลุด) อาจารย์สามารถกดปุ่ม <strong>"ปลดล็อก"</strong> เพื่ออนุญาตให้ทำข้อสอบต่อได้',
                    tip: '💡 สามารถดูประวัติการสลับหน้าจอก่อนกดปลดล็อกได้'
                }
            ],
            cheatSheet: [
                { name: 'Tab Switch Alert', desc: 'บันทึกเมื่อมีการเปลี่ยนแท็บหรือเปิดโปรแกรมอื่น' },
                { name: 'Full-Screen Lock', desc: 'บังคับทำข้อสอบในโหมดเต็มจอตลอดเวลา' },
                { name: 'ส่งข้อความเตือน', desc: 'ส่งข้อความแจ้งเตือนเด้งบนหน้าจอเด็กรายบุคคล' },
                { name: 'ปลดล็อกนักศึกษา', desc: 'อนุญาตให้นักศึกษาที่ถูกล็อกกลับเข้าสอบต่อได้' }
            ]
        },

        'library': {
            title: 'คลังข้อสอบสะสม (My Exam Library)',
            icon: '📚',
            badge: 'คลังส่วนตัว',
            summary: 'ศูนย์รวมชุดข้อสอบที่คุณบันทึกเก็บไว้ นำกลับมาใช้ซ้ำและจัดหมวดหมู่ได้ไม่จำกัด',
            steps: [
                {
                    title: 'ประโยชน์ของคลังข้อสอบ',
                    badge: 'แนวคิดคลัง',
                    icon: '🗄️',
                    content: 'คลังข้อสอบช่วยจัดเก็บชุดข้อสอบคุณภาพของคุณอย่างปลอดภัย ช่วยให้ไม่ต้องพิมพ์ข้อสอบใหม่ทุกเทอม สามารถหยิบชุดข้อสอบเดิมมาเปิดสอบใหม่ได้ทันที',
                    tip: '💡 ระบบจัดหมวดหมู่ตามรายวิชาเพื่อความสะดวกในการค้นหา'
                },
                {
                    title: 'ดึงข้อสอบจากคลังไปใช้ในห้องสอบใหม่',
                    badge: 'การนำไปใช้',
                    icon: '🚀',
                    content: 'ในหน้า <strong>"จัดการข้อสอบ"</strong> กดปุ่ม <strong>"📂 เลือกข้อสอบจากคลังข้อสอบ"</strong> แล้วเลือกชุดข้อสอบที่ต้องการ ข้อสอบทั้งหมดจะถูกคัดลอกลงในห้องสอบทันที',
                    tip: '💡 การปรับแต่งในห้องสอบจะไม่กระทบต้นฉบับในคลัง'
                }
            ],
            cheatSheet: [
                { name: 'บันทึกเข้าคลัง', desc: 'เก็บชุดข้อสอบจากห้องเรียนเข้าคลังส่วนตัว' },
                { name: 'ดึงไปใช้ซ้ำ', desc: 'นำชุดข้อสอบในคลังไปเปิดห้องสอบใหม่ใน 1 คลิก' },
                { name: 'แก้ไขและจัดการ', desc: 'ค้นหา ลบ หรือแก้ไขชุดข้อสอบในคลังได้อย่างอิสระ' }
            ]
        },

        'storage': {
            title: 'พื้นที่จัดเก็บข้อมูล (Storage Stats)',
            icon: '💾',
            badge: 'การใช้งานพื้นที่',
            summary: 'ตรวจสอบขนาดพื้นที่จัดเก็บข้อมูลข้อสอบ ภาพแนบ และประวัติผลสอบในบัญชีของคุณ',
            steps: [
                {
                    title: 'ภาพรวมการใช้พื้นที่จัดเก็บ',
                    badge: 'สถิติพื้นที่',
                    icon: '📊',
                    content: 'แสดงจำนวนห้องสอบ ข้อสอบทั้งหมด ผลสอบ และรูปภาพแนบ พร้อมคำนวณขนาดพื้นที่ใช้งานจริงในระบบ (Bytes / KB / MB)',
                    tip: '💡 ระบบจัดการพื้นที่อย่างมีประสิทธิภาพ ช่วยให้โหลดข้อมูลได้อย่างรวดเร็ว'
                }
            ],
            cheatSheet: [
                { name: 'พื้นที่จัดเก็บข้อสอบ', desc: 'ขนาดความจุของข้อสอบและรูปภาพแนบ' },
                { name: 'พื้นที่ประวัติผลสอบ', desc: 'ขนาดความจุของคำตอบและคะแนนสอบนักศึกษา' }
            ]
        },

        'portal': {
            title: 'ศูนย์ควบคุมผู้ดูแลระบบ (Super Admin Portal)',
            icon: '🛡️',
            badge: 'ผู้ดูแลระบบ',
            summary: 'อนุมัติบัญชีอาจารย์ ดูสถิติการใช้งานทั้งระบบ และจัดการผู้ใช้งาน',
            steps: [
                {
                    title: 'อนุมัติบัญชีอาจารย์ใหม่',
                    badge: 'การควบคุม',
                    icon: '👑',
                    content: 'อนุมัติหรือปฏิเสธบัญชีอาจารย์ที่สมัครเข้าใช้งานใหม่ในระบบ เพื่อความปลอดภัยและการควบคุมสิทธิ์',
                    tip: '💡 อาจารย์จะล็อกอินใช้งานได้เมื่อผ่านการอนุมัติแล้วเท่านั้น'
                },
                {
                    title: 'ดูสถิติรวมทั้งระบบ',
                    badge: 'ภาพรวมระบบ',
                    icon: '📈',
                    content: 'ดูสถิติจำนวนอาจารย์ นักศึกษา ห้องสอบที่เปิดสอบ และประวัติการเข้าใช้งานรวมทั้งระบบ',
                    tip: '💡 ใช้ติดตามสถิติการจัดสอบภาพรวมของสถาบัน'
                }
            ],
            cheatSheet: [
                { name: 'อนุมัติอาจารย์', desc: 'ยืนยันสิทธิ์บัญชีอาจารย์ผู้สอน' },
                { name: 'สถิติภาพรวม', desc: 'ตรวจสอบจำนวนผู้ใช้งานและการจัดสอบทั้งสถาบัน' }
            ]
        },

        'excel': {
            title: 'นำเข้าข้อสอบ Excel (Excel Import Tool)',
            icon: '📊',
            badge: 'นำเข้าข้อมูลด่วน',
            summary: 'อัปโหลดไฟล์ตาราง Excel เพื่อแปลงเป็นชุดข้อสอบในระบบอัตโนมัติ',
            steps: [
                {
                    title: 'ดาวน์โหลดเทมเพลต Excel แม่แบบ',
                    badge: 'ขั้นตอนที่ 1',
                    icon: '📥',
                    content: 'กดปุ่ม <strong>"ดาวน์โหลดแม่แบบ Excel"</strong> เพื่อรับไฟล์ตารางตัวอย่างที่มีหัวคอลัมน์ถูกต้องตามรูปแบบของระบบ',
                    tip: '💡 ใช้ Microsoft Excel หรือ Google Sheets เปิดแก้ไขได้'
                },
                {
                    title: 'กรอกโจทย์ ช้อยส์ และเฉลยในตาราง',
                    badge: 'ขั้นตอนที่ 2',
                    icon: '📝',
                    content: 'กรอกโจทย์คำถามในคอลัมน์ Question, กรอกตัวเลือกในคอลัมน์ Choice A, B, C, D และระบุตัวอักษรเฉลย (เช่น A หรือ B) ในคอลัมน์ Answer',
                    tip: '💡 1 แถวใน Excel เท่ากับ 1 ข้อคำถาม นำเข้าได้หลายสิบข้อพร้อมกัน'
                },
                {
                    title: 'อัปโหลดและตรวจสอบข้อสอบ',
                    badge: 'ขั้นตอนที่ 3',
                    icon: '📤',
                    content: 'ลากไฟล์ Excel มาวางในกล่องอัปโหลด ระบบจะอ่านข้อมูลและแปลงเป็นข้อสอบให้ตรวจสอบก่อนบันทึก',
                    tip: '💡 สามารถแนบรูปภาพเพิ่มเติมหลังจากนำเข้าเสร็จได้'
                }
            ],
            cheatSheet: [
                { name: 'ดาวน์โหลดแม่แบบ', desc: 'รับไฟล์ Excel ตัวอย่างสำหรับกรอกข้อมูล' },
                { name: 'กรอกข้อมูล', desc: 'ใส่โจทย์ ช้อยส์ A-D และเฉลยตามคอลัมน์' },
                { name: 'อัปโหลดไฟล์', desc: 'ลากไฟล์มาวางเพื่อนำเข้าข้อสอบอัตโนมัติ' }
            ]
        },

        'index': {
            title: 'ระบบล็อกอินเข้าสอบสำหรับนักศึกษา (Student Exam Portal)',
            icon: '🔑',
            badge: 'สำหรับนักศึกษา',
            summary: 'กรอกรหัส PIN 6 หลัก เพื่อยืนยันตัวตนและเข้าทำข้อสอบออนไลน์',
            steps: [
                {
                    title: 'กรอกรหัส PIN 6 หลักจากอาจารย์',
                    badge: 'ขั้นตอนที่ 1',
                    icon: '🔢',
                    content: 'นำรหัส <strong>PIN 6 หลัก</strong> ที่ได้รับจากอาจารย์ผู้สอนมาใส่นช่องกรอกรหัสเข้าสอบ แล้วกดปุ่ม <strong>"เข้าสู่ห้องสอบ"</strong>',
                    tip: '💡 รหัส PIN 6 หลักจะได้รับจากอาจารย์เมื่อมีการเผยแพร่ข้อสอบ'
                },
                {
                    title: 'ยืนยันรหัสนักศึกษาและชื่อ-นามสกุล',
                    badge: 'ขั้นตอนที่ 2',
                    icon: '👤',
                    content: 'กรอก <strong>รหัสนักศึกษา</strong> และ <strong>ชื่อ-นามสกุล</strong> ให้ตรงกับรายชื่อที่ลงทะเบียนในวิชา เพื่อให้ระบบตรวจสอบสิทธิ์และเช็คชื่อเข้าสอบ',
                    tip: '💡 ตรวจสอบรหัสนักศึกษาให้ถูกต้องก่อนกดตกลง'
                }
            ],
            cheatSheet: [
                { name: 'รหัส PIN 6 หลัก', desc: 'รหัสเข้าสอบจากอาจารย์ผู้สอน' },
                { name: 'รหัสนักศึกษา', desc: 'ใช้สำหรับยืนยันตัวตนและบันทึกคะแนน' }
            ]
        },

        'exam': {
            title: 'ห้องสอบออนไลน์ & โหมดล็อกความปลอดภัย (Live Exam Room)',
            icon: '📝',
            badge: 'ห้องทำข้อสอบ',
            summary: 'โหมดทำข้อสอบเต็มจอ พร้อมระบบนับเวลาถัดหลัง และบันทึกคำตอบอัตโนมัติ',
            steps: [
                {
                    title: 'โหมดเต็มจอบังคับความปลอดภัย (Full-Screen Lockdown)',
                    badge: 'ข้อควรระวัง',
                    icon: '🔒',
                    content: 'เมื่อเริ่มทำข้อสอบ ระบบจะปรับเข้าสู่ <strong>โหมดเต็มจอ (Full Screen)</strong> ห้ามกดสลับแท็บ ออกจากเต็มจอ หรือเปิดโปรแกรมอื่นเด็ดขาด!',
                    tip: '⚠️ การสลับหน้าจอจะถูกบันทึกประวัติการทุจริตและส่งถึงอาจารย์ทันที'
                },
                {
                    title: 'การเลือกคำตอบ & เวลานับถอยหลัง',
                    badge: 'การทำข้อสอบ',
                    icon: '⏱️',
                    content: 'คลิกเลือกตัวเลือกที่ถูกต้อง คำตอบจะถูกบันทึกในระบบอัตโนมัติ สามารถดูเวลาสอบที่เหลือนับถอยหลังได้ที่มุมบนของหน้าจอ',
                    tip: '💡 เมื่อหมดเวลา ระบบจะทำการส่งข้อสอบและคำนวณคะแนนให้อัตโนมัติ'
                },
                {
                    title: 'ส่งข้อสอบเมื่อทำเสร็จสิ้น',
                    badge: 'ขั้นตอนสุดท้าย',
                    icon: '✅',
                    content: 'เมื่อทำข้อสอบครบทุกข้อแล้ว ให้กดปุ่ม <strong>"ส่งข้อสอบ"</strong> และยืนยันการส่ง ระบบจะแสดงผลคะแนนทันที (หากอาจารย์เปิดตั้งค่าไว้)',
                    tip: '🎉 ตรวจทานคำตอบทุกข้อก่อนกดส่งข้อสอบ'
                }
            ],
            cheatSheet: [
                { name: 'ห้ามสลับหน้าจอ', desc: 'ระบบจะเตือนและบันทึกประวัติหากออกจากโหมดเต็มจอ' },
                { name: 'นาฬิกานับถอยหลัง', desc: 'แสดงเวลาสอบที่เหลือ ส่งข้อสอบอัตโนมัติเมื่อหมดเวลา' },
                { name: 'ปุ่มส่งข้อสอบ', desc: 'กดยืนยันส่งข้อสอบเมื่อทำเสร็จสิ้นครบทุกข้อ' }
            ]
        }
    };

    // ===== 2. ตรวจสอบหน้าปัจจุบันอย่างแม่นยำ =====
    function getCurrentPageKey() {
        const path = window.location.pathname.toLowerCase();
        if (path === '/' || path.endsWith('/index.html') || path.includes('index.html') || path.endsWith('/')) return 'none';
        if (path.includes('admin-questions')) return 'questions';
        if (path.includes('admin-rooms')) return 'rooms';
        if (path.includes('admin-courses')) return 'courses';
        if (path.includes('admin-students')) return 'students';
        if (path.includes('admin-active-exams')) return 'active-exams';
        if (path.includes('admin-results')) return 'results';
        if (path.includes('admin-analysis')) return 'analysis';
        if (path.includes('admin-monitoring')) return 'monitoring';
        if (path.includes('admin-library')) return 'library';
        if (path.includes('admin-storage')) return 'storage';
        if (path.includes('admin-portal') || path.includes('super-admin')) return 'portal';
        if (path.includes('admin-excel')) return 'excel';
        if (path.includes('dashboard')) return 'dashboard';
        if (path.includes('exam.html')) return 'exam';
        return 'dashboard';
    }

    // ===== 3. จัดการสถานะการเปิดครั้งแรก (LocalStorage) =====
    const STORAGE_KEY_PREFIX = 'tablock_guide_seen_v2_';

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
            body.page-questions .tablock-floating-guide-btn,
            .page-questions .tablock-floating-guide-btn {
                bottom: 85px !important;
                right: 20px !important;
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

            /* Guide Modal Backdrop & Container */
            .tablock-guide-modal {
                position: fixed;
                inset: 0;
                z-index: 99999;
                background: rgba(15, 23, 42, 0.75);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
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
                max-width: 720px;
                max-height: 90vh;
                border-radius: 28px;
                border: 2px solid rgba(255, 255, 255, 0.9);
                box-shadow: 0 25px 60px -15px rgba(6, 182, 212, 0.25), 0 20px 30px -10px rgba(99, 102, 241, 0.2), 0 0 0 1px rgba(226, 232, 240, 0.8);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                transform: scale(0.92) translateY(15px);
                transition: all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
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
                        <span class="text-[11px] font-bold text-slate-500">เลือกดูคู่มือหน้าอื่น:</span>
                        <select id="guide-page-select" onchange="window.TabLockGuide.changePage(this.value)" class="text-xs font-bold bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 focus:outline-none focus:border-cyan-500 cursor-pointer">
                            <option value="dashboard">🏠 แดชบอร์ดหลัก</option>
                            <option value="questions">📝 จัดการข้อสอบ</option>
                            <option value="rooms">🚪 จัดการห้องสอบ & PIN</option>
                            <option value="courses">📚 จัดการรายวิชา & รายชื่อ</option>
                            <option value="students">👨‍🎓 ทำเนียบนักศึกษา</option>
                            <option value="active-exams">▶️ กำลังดำเนินการสอบ</option>
                            <option value="results">📊 ตรวจสอบผลการสอบ</option>
                            <option value="analysis">🎯 วิเคราะห์ข้อสอบ</option>
                            <option value="monitoring">🛡️ ตรวจจับพฤติกรรม</option>
                            <option value="library">📚 คลังข้อสอบสะสม</option>
                            <option value="storage">💾 พื้นที่จัดเก็บข้อมูล</option>
                            <option value="portal">🛡️ ผู้ดูแลระบบ (Super Admin)</option>
                            <option value="excel">📊 นำเข้า Excel</option>
                            <option value="index">🔑 หน้าเข้าสอบนักศึกษา</option>
                            <option value="exam">📝 ห้องทำข้อสอบนักศึกษา</option>
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

        const pageKey = getCurrentPageKey();
        if (pageKey === 'questions' || window.location.pathname.includes('admin-questions')) {
            btn.style.bottom = '85px';
            btn.style.right = '20px';
        }

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

    // ===== 8. ตรวจสอบและเปิดป๊อปอัปเฉพาะครั้งแรกที่เข้าใช้งานหน้านั้นๆ =====
    function checkAndShowFirstTimeBanner() {
        const pageKey = getCurrentPageKey();
        // หากยังไม่เคยเปิดดูคู่มือของหน้านี้มาก่อน ให้แสดงป๊อปอัปนำทางอัตโนมัติ
        if (!hasSeenGuide(pageKey)) {
            window.TabLockGuide.open(pageKey);
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
        const pageKey = getCurrentPageKey();
        if (pageKey === 'none') return;
        injectGuideStyles();
        createGuideModal();
        createFloatingGuideButton();
        // Do NOT automatically show popup banner on page load
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
