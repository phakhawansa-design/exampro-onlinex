@echo off
:: ปิดการแสดงผลคำสั่งดิบเพื่อความสะอาด
title ExamPro Launcher
mode con: cols=60 lines=10
color 0b

echo ====================================================
echo    🚀 กำลังเปิดใช้งานเซิร์ฟเวอร์ระบบสอบ ExamPro...
echo ====================================================
echo.

:: รันเซิร์ฟเวอร์ Node.js เบื้องหลัง
start /b node server.js

:: หน่วงเวลารอฐานข้อมูล SQLite ทำงาน 2 วินาที
timeout /t 2 >nul

echo    🟢 ระบบเปิดสำเร็จแล้ว! กำลังนำทางไปหน้าเว็บ...
echo ====================================================

:: เปิดหน้าเว็บระบบสอบโดยอัตโนมัติบนเบราว์เซอร์หลัก
start "" "http://localhost:5000/teacher-login.html"
start "" "http://localhost:5000/Student-login.html"

exit
