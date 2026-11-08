# Software House Internal Ticket System - Project Roadmap

## ภาพรวมโปรเจกต์ (Project Overview)
แพลตฟอร์ม Web App สำหรับบริษัท Software House Startup เพื่อใช้เป็น Internal Tool ในการโพสต์งาน ติดตามสถานะ (Status) และจัดการ Ticket ของทีม โดยใช้ **Google Sheets** เป็นฐานข้อมูล (Database Backend) เพื่อความรวดเร็ว ประหยัด และใช้งานร่วมกันในทีมได้อย่างยืดหยุ่น

---

## 1. สถาปัตยกรรมระบบ (System Architecture)
* **Frontend:** Web App (เช่น React, Next.js, หรือ Tailwind CSS + HTML/JS ธรรมดา) โฮสต์บนแพลตฟอร์มฟรี เช่น Vercel หรือ Netlify
* **Backend API:** **Google Apps Script (GAS)** ทำหน้าที่เป็นตัวกลางรับส่งข้อมูล (GET/POST) ระหว่างหน้าเว็บกับ Google Sheets
* **Database:** **Google Sheets** (แบ่งเป็นชีต Tasks และ Users)

---

## 2. โครงสร้างฐานข้อมูลใน Google Sheets (Database Design)

### Sheet 1: `Tasks` (เก็บข้อมูล Ticket งาน)
* `Task ID` (Auto-generate เช่น TIK-001)
* `Title` (ชื่อหัวข้องาน)
* `Description` (รายละเอียดงาน)
* `Category` (ประเภท เช่น Bug, Feature, Support, Internal)
* `Priority` (ความด่วน: Low, Medium, High, Critical)
* `Status` (สถานะงาน: Backlog, To Do, In Progress, Review, Done)
* `Assignee` (ชื่อคนรับผิดชอบงาน)
* `Reporter` (คนแจ้ง/คนโพสต์งาน)
* `DueDate` (กำหนดส่ง)
* `CreatedAt` (เวลาที่สร้าง)
* `UpdatedAt` (เวลาอัปเดตล่าสุด)
* `LastUpdatedBy` (ใครเป็นคนแก้ล่าสุด)

### Sheet 2: `Users` (รายชื่อทีมงานสำหรับทำระบบ Assignee)
* `User ID`
* `Name`
* `Role` (Developer, Tester, PM, etc.)
* `Email`

---

## 3. ฟีเจอร์หลักของระบบ (Core Features)
1. **Task Management (CRUD):** หน้าเว็บสำหรับสร้าง, อ่าน, และอัปเดตสถานะงาน ยิงข้อมูลตรงเข้า Google Sheets อัตโนมัติ
2. **Task Board / Table View:** แสดงรายการงานทั้งหมดในรูปแบบที่อ่านง่าย พร้อมระบบกรองข้อมูล (Filter) ตามสถานะหรือผู้รับผิดชอบ
3. **Line / Telegram Notification (Optional):** ตั้งค่า Google Apps Script ให้ยิงแจ้งเตือนเข้าแชทกลุ่มบริษัทเมื่อมีงานใหม่ถูกสร้างขึ้น

---

## 4. ฟีเจอร์เสริมเพื่อเพิ่มความน่าใช้งาน (Engagement & UX/UI)
1. **ระบบคอมเมนต์และการพูดคุยใน Ticket (Activity & Comment Thread):** รวมประวัติการพูดคุย ปัญหา และลิงก์งาน (เช่น Figma, GitHub PR) ไว้ในจุดเดียว ป้องกันงานตกหล่น
2. **Quick Actions & Keyboard Shortcuts:** ปุ่มลัดสำหรับสาย Dev เช่น กด `C` เพื่อสร้าง Ticket หรือใช้คีย์ลัดค้นหาด่วน
3. **Dark Mode (โหมดมืด):** ธีมสีเข้มถนอมสายตาสำหรับโปรแกรมเมอร์ สลับใช้งานได้ง่ายที่มุมเว็บ
4. **สถิติและแดชบอร์ดสรุปผลงานทีม (Team Metrics / Summary):** หน้าสรุปภาพรวมโปรเจกต์ เช่น จำนวนงานค้าง (To Do vs Done), งานที่เลยกำหนด (Overdue), และ Workload ของแต่ละคน
5. **ลูกเล่นสนุก ๆ (Gamification):** เอฟเฟกต์ภาพฉลอง (Confetti) เมื่อกดเปลี่ยนสถานะงานเป็น "Done" เพื่อสร้างบรรยากาศผ่อนคลายในทีม

---

## 5. ข้อจำกัดและสิ่งที่ต้องระวัง (Important Notes)
* **Concurrency / Race Condition:** เนื่องจากใช้ Google Sheets เป็น Database หากมีคนกดบันทึกข้อมูลพร้อมกันเสี้ยววินาที ข้อมูลอาจชนกันได้ เหมาะสำหรับทีมขนาดเล็กถึงปานกลาง
* **Response Time:** ความเร็วในการโหลดข้อมูลจะขึ้นอยู่กับการตอบสนองของ Google Apps Script API (ประมาณ 1-3 วินาที)