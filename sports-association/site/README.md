# SAMPLESPORT.COM: หน้าเว็บหลัก

HTML/CSS/JS ธรรมดา ไม่มี build step · โครงหน้าตาม liverpoolfc.com เปลี่ยนเป็นธีมน้ำเงิน–ขาว · ข้อตกลงกับหน้าแอดมินอยู่ที่ `../CONTRACT.md`

## เปิดดูในเครื่อง
ต้องเปิดผ่านเซิร์ฟเวอร์ (ES modules ไม่ทำงานถ้าเปิดไฟล์ตรง ๆ แบบ `file://`)
```
cd site
python3 -m http.server 5610 --bind 127.0.0.1
```
แล้วเปิด http://127.0.0.1:5610

## หน้า
| ไฟล์ | หมวดในผัง |
|---|---|
| `index.html` | HOME: แบนเนอร์, Event Participation, ข่าวล่าสุด, ประเภทการแข่งขัน, ทีมชาติ, อัลบั้ม, Timing Tracks, Partnership, footer |
| `organisation.html` | ORGANISATION: About, Affiliations, Board, Judges, Coaches, Club Members |
| `news.html`, `article.html?id=` | NEWS (กรองตามหมวดด้วย `?cat=announcement\|press\|community\|competition`) |
| `competition.html` | COMPETITION: Event Calendar + Competition Details |
| `downloads.html` | DOWNLOADS: IJRU Rules, Anti-Doping, Safe Sport, Timing Tracks |
| `media.html`, `album.html?id=` | MEDIA: Photo Gallery + Video Gallery |
| `about-jump-rope.html` | ABOUT JUMP ROPE: What is, Benefits + คลิป, Categories, National Team, International Results |
| `contact.html` | CONTACT US: Address, Google Map, Send Question, Online Channel |

## ข้อมูลมาจากไหน
- **แก้ผ่านหน้าแอดมิน (Firestore):** banners, news, events, albums + photos, siteImages → อ่านใน `js/data.js`
- **แก้ในโค้ด:** `js/content.js` (ที่อยู่ โซเชียล เมนู พาร์ทเนอร์ กรรมการ ผู้ตัดสิน โค้ช สโมสร ไฟล์ดาวน์โหลด คลิป YouTube ทีมชาติ ผลงาน)
- `FIREBASE_READY = false` ใน `js/firebase-config.js` → แสดงข้อมูลตัวอย่างจาก `js/seed.js` (ตอนนี้ใส่ค่าจริงแล้ว เป็น `true`)
- โหมดตัวอย่างของหน้าแอดมิน (`?preview=1` ในกรอบ) → ดู `../admin/PREVIEW.md`
- ใส่ค่า Firebase จริงแล้ว → แสดงข้อมูลจริงเท่านั้น (ถ้าโหลดไม่สำเร็จจะกลับไปใช้ข้อมูลตัวอย่างและเขียนเตือนใน console)

## ก่อนเปิดใช้จริง
- [ ] ค้นหา `[รอข้อมูล]` ใน `js/content.js` แล้วเปลี่ยนเป็นข้อมูลจริงทั้งหมด
- [ ] โลโก้จริงของสมาคม (ตอนนี้เป็นตัวอักษร "JR" ใน `js/layout.js`) และโลโก้พาร์ทเนอร์ 5 ราย
- [ ] ไฟล์เสียง Timing Tracks ~10 ไฟล์ → `files/timing/track-01.mp3` … `track-10.mp3`
- [ ] ไฟล์ PDF กติกา / Safe Sport / Anti-Doping → `files/` แล้วแก้ `href` ใน `DOWNLOADS`
- [ ] รูปตัวอย่างทั้งหมดดึงจาก Unsplash ควรเปลี่ยนเป็นรูปจริงของสมาคม (ใส่ผ่านแอดมินหรือแก้ใน `content.js`)
- [ ] ฟอร์ม Send Question ตอนนี้เปิดโปรแกรมอีเมลของผู้ใช้ (`mailto:`) ถ้าต้องการให้เก็บคำถามในระบบต้องทำเพิ่ม
- [x] ใส่ค่าใน `js/firebase-config.js` ให้ตรงกับ `../admin/js/firebase-config.js`
