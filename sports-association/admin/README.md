# Sample Sports — หน้าแอดมิน

ระบบหลังบ้านของ SAMPLESPORT.COM ใช้แก้ข่าว แบนเนอร์ ปฏิทินการแข่ง อัลบั้มรูป และรูปประจำหน้า
เป็น HTML/CSS/JS ธรรมดา ไม่มี build step ใช้ Firebase (Auth + Firestore + Storage) ตาม `../CONTRACT.md`

Firebase project: **`REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID`** (ตั้งไว้ใน `.firebaserc` แล้ว)

## โครงไฟล์
| ไฟล์ | หน้าที่ |
|---|---|
| `login.html` | เข้าสู่ระบบด้วย Google (Gmail) อย่างเดียว |
| `index.html` | ภาพรวม: จำนวนข่าว / อัลบั้ม / รายการแข่งที่กำลังจะมาถึง + ทางลัด |
| `news.html` | ข่าว: ค้นหา กรอง เพิ่ม แก้ ลบ รูปปก ข่าวเด่น ร่าง/เผยแพร่ |
| `banners.html` | แบนเนอร์หน้าแรก: เพิ่ม แก้ ลบ เรียงลำดับ เปิด/ปิด |
| `events.html` | ปฏิทินการแข่ง: รายการหลัก/อื่น วันเริ่ม–จบ สถานที่ ลิงก์สมัคร รูปปก |
| `albums.html`, `album.html?id=…` | อัลบั้มรูป: สร้างอัลบั้ม ผูกรายการแข่ง อัปโหลดหลายรูป ลบรูป ตั้งปก |
| `site-images.html` | รูปประจำหน้า 9 key ตาม CONTRACT |
| `js/firebase-config.js` | ค่า config ของ Firebase (ต้องตรงกับ `site/js/firebase-config.js` เสมอ) |
| `js/config.js` | ค่าคงที่: `SITE_URL` (ลิงก์ "ดูหน้าเว็บจริง"), ชื่อหมวด, รายการ key รูปประจำหน้า, ขนาดย่อรูป |
| `js/auth.js` · `js/db.js` · `js/upload.js` · `js/ui.js` | ล็อกอิน/เช็กสิทธิ์ · Firestore · ย่อรูป+อัปโหลด · เมนู/แถบสถานะ/modal |
| `js/pages/*.js` | โค้ดของแต่ละหน้า |
| `firestore.rules` · `storage.rules` · `firebase.json` | กฎสิทธิ์ และไฟล์สำหรับ deploy กฎ |

ถ้า `FIREBASE_READY === false` ทุกหน้าจะขึ้นแถบเตือน "ยังไม่ได้ตั้งค่า Firebase" ปุ่มบันทึกถูกปิด แต่ยังเปิดดูหน้าตาได้

---

## ตั้งค่าครั้งแรก

### 1. Firebase project
project `REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID` สร้างไว้แล้ว เข้าได้ที่
https://console.firebase.google.com/project/REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID/overview

(ถ้าจะสร้างใหม่: Firebase Console → Add project → ตั้งชื่อ → ปิด Google Analytics ได้ แล้วแก้ ID ใน `.firebaserc`)

### 2. เปิด Authentication (Google)
1. Console → **Build › Authentication** → Get started
2. แท็บ **Sign-in method** → **Google** → Enable → เลือก Project support email → Save
3. แท็บ **Settings › Authorized domains** → เพิ่มโดเมนที่วางหน้าแอดมิน (เช่น `samplesport.com`) · `localhost` มีให้อยู่แล้ว
   ถ้าไม่เพิ่ม ปุ่มเข้าสู่ระบบจะขึ้น "โดเมนนี้ยังไม่ได้รับอนุญาต"

หน้า login ใช้ป๊อปอัปของ Google ถ้า browser บล็อกป๊อปอัป ให้กดอนุญาตแล้วลองใหม่

### 3. เปิด Firestore
1. Console → **Build › Firestore Database** → Create database
2. Location: **`asia-southeast1` (Singapore)** · เลือกแล้วเปลี่ยนไม่ได้
3. เริ่มแบบ **Production mode** (กฎจริงจะ deploy ในข้อ 7)

> ⚠️ ต้องสร้าง database ก่อน deploy rules เสมอ ถ้าสั่ง `firebase deploy --only firestore:rules` ตอนที่ยังไม่มี database
> CLI จะสร้าง `(default)` ให้เองที่ **`nam5` (สหรัฐฯ)** โดยไม่ถาม (เจอจริง 25 ต.ค. 2569)
> ถ้าใช้ CLI สร้าง: `firebase firestore:databases:create "(default)" --location asia-southeast1` (ต้องเปิด Firestore API ก่อน)

### 4. เปิด Storage
1. Console → **Build › Storage** → Get started
2. project ที่สร้างหลังปลายปี 2024 ต้องอัปเกรดเป็นแพ็กเกจ **Blaze (จ่ายตามใช้)** ก่อน จึงจะเปิด Storage ได้
   ปริมาณของเว็บนี้ (อัลบั้มราว 6–8 อัลบั้มต่อปี รูปละประมาณ 300–600KB) อยู่ในโควตาฟรีของ Blaze สบาย ๆ
   แนะนำให้ตั้ง **Budget alert** ใน Google Cloud Billing ไว้ เช่น 100 บาท/เดือน
3. Location เลือกเดียวกับ Firestore

### 5. สร้าง Web app และใส่ config
1. Console → ⚙️ **Project settings** → **Your apps** → ไอคอน `</>` (Web) → ตั้งชื่อเช่น `samplesport-web` → Register app (ไม่ต้องติ๊ก Hosting)
2. คัดลอกค่าใน `firebaseConfig` มาใส่ **ทั้งสองไฟล์ให้เหมือนกัน**
   - `admin/js/firebase-config.js`
   - `site/js/firebase-config.js`
3. เปลี่ยน `FIREBASE_READY = false` เป็น `true` ในทั้งสองไฟล์

```js
export const firebaseConfig = {
  apiKey: "AIza…",
  authDomain: "REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID.firebaseapp.com",
  projectId: "REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
  appId: "1:REPLACE_WITH_YOUR_SENDER_ID:web:…"
};
export const FIREBASE_READY = true;
```
> ค่าเหล่านี้ไม่ใช่ความลับ (ทุกคนเห็นได้ในหน้าเว็บอยู่แล้ว) ความปลอดภัยมาจาก rules ในข้อ 7

หรือใช้ CLI: `firebase apps:create web samplesport-web` แล้ว `firebase apps:sdkconfig web`

### 6. เพิ่มแอดมินคนแรก
1. ให้คนนั้นเปิด `login.html` แล้วกด **เข้าสู่ระบบด้วย Google** ด้วย Gmail ของตัวเอง 1 ครั้ง
   หน้าจอจะขึ้น "บัญชีนี้ไม่มีสิทธิ์" พร้อม **UID** และปุ่มคัดลอก (บัญชีจะไปโผล่ใน **Authentication › Users** ด้วย)
2. **Firestore Database** → Start collection (หรือเปิด collection `admins` ที่มีอยู่) → Collection ID: `admins`
3. Document ID: วาง **UID** ที่ได้มา (ห้ามใช้ Auto-ID)
4. เพิ่ม field
   - `email` (string): อีเมลของคนนั้น
   - `name` (string): ชื่อที่จะแสดงในเมนู
5. Save

6. ให้คนนั้นกดเข้าสู่ระบบอีกครั้ง

เพิ่มแอดมินคนต่อไปก็ทำแบบเดียวกัน ถ้าจะถอนสิทธิ์ให้ลบ doc ใน `admins` (หรือปิดบัญชีใน Authentication)
ใครก็กดเข้าสู่ระบบด้วย Google ได้ แต่ถ้าไม่มี doc ใน `admins` จะถูก sign out ทันที และกฎ Firestore/Storage ไม่ให้เขียนอะไรเลย
หน้าเว็บแก้รายชื่อ `admins` ไม่ได้ (กฎล็อกไว้) ต้องแก้ผ่าน Console เท่านั้น

### 7. Deploy rules
ติดตั้ง CLI ครั้งเดียว: `npm install -g firebase-tools` แล้ว `firebase login`

```bash
cd admin
firebase deploy --only firestore:rules,storage
```

ครั้งแรก CLI จะถามว่าให้ Storage อ่าน Firestore ได้ไหม (เพราะ `storage.rules` เช็ก `admins/{uid}` ข้ามบริการ) → ตอบ **Yes**

> ⚠️ CLI ถามเรื่องนี้เฉพาะตอนรันใน terminal ปกติ **และ** rules มีการเปลี่ยนแปลงเท่านั้น
> ถ้าใช้ `--non-interactive` หรือ rules เหมือนเดิม ("already up to date, skipping upload") จะไม่ถาม และไม่ให้สิทธิ์
> อาการคือ แอดมินอัปโหลดรูปแล้วขึ้น `storage/unauthorized` (เจอจริง 25 ต.ค. 2569 แก้โดยแก้ comment ใน rules แล้ว deploy ใหม่แบบมี prompt)

ถ้ายังไม่ได้ ให้ไปที่
Google Cloud Console → IAM → ติ๊ก "Include Google-provided role grants" → หา service account
`service-PROJECT_NUMBER@gcp-sa-firebasestorage.iam.gserviceaccount.com` → ให้ role **Firebase Rules Firestore Service Agent**

### 8. ลองเปิดในเครื่อง
ES module ต้องเปิดผ่าน http (เปิดไฟล์ตรง ๆ ด้วย `file://` ไม่ได้)
```bash
cd admin
python3 -m http.server 5500
# เปิด http://localhost:5500/login.html
```

---

## สิทธิ์ (สรุปจาก rules)
| ข้อมูล | ทุกคนอ่าน | แอดมิน |
|---|---|---|
| `news`, `events`, `albums` | เฉพาะ `status == "published"` | อ่าน/เขียนทั้งหมด |
| `albums/{id}/photos` | เมื่ออัลบั้มแม่ published | อ่าน/เขียนทั้งหมด |
| `banners`, `siteImages` | ทั้งหมด | เขียนได้ (siteImages เฉพาะ 9 key) |
| `admins` | ไม่ได้ (อ่านได้เฉพาะ doc ของตัวเอง) | แก้ผ่าน Console เท่านั้น |
| Storage `news/ banners/ events/ albums/ site/` | อ่านได้ | อัปโหลดเฉพาะรูป ≤ 10MB, ลบได้ |

> หน้าหลักต้อง query ด้วย `where("status", "==", "published")` เสมอ ถ้าไม่ใส่ Firestore จะปฏิเสธทั้ง query

## ดูตัวอย่างก่อนบันทึก
ทุกฟอร์มแก้ไข (ข่าว แบนเนอร์ รายการแข่ง อัลบั้ม) มีปุ่ม **ดูตัวอย่าง** กดแล้วจะเปิดหน้าเว็บหลักจริงในกรอบ
เทียบ **ก่อนแก้** (ที่เผยแพร่อยู่) กับ **หลังแก้** (สิ่งที่กรอกในฟอร์ม ยังไม่บันทึก) สลับมุมมองคอม/มือถือได้
ส่วนรูปประจำหน้า กดเลือกรูปแล้วจะขึ้นตัวอย่างก่อน ต้องกด **ใช้รูปนี้** รูปถึงจะถูกเปลี่ยนจริง

- ต้องให้หน้าหลักรองรับโหมดตัวอย่างตาม `PREVIEW.md` ก่อน
- เปิดแอดมินจากเครื่องตัวเองผ่านเซิร์ฟเวอร์ที่เห็นทั้งโปรเจกต์ (เช่น VS Code Live Server ที่ `…/admin/`) → ตัวอย่างใช้โฟลเดอร์ `site/` บนเซิร์ฟเวอร์เดียวกันเอง ไม่ต้องเปิดอะไรเพิ่ม
- เปิดเฉพาะโฟลเดอร์ `admin/` → ตัวอย่างใช้หน้าหลักที่ `http://127.0.0.1:5610` (ต้องเปิดเซิร์ฟเวอร์ของ `site/` ไว้)
- เปิดจากที่อื่น → ใช้ `SITE_URL` · ตั้งค่าได้ที่ `PREVIEW_SITE_URL` ใน `js/config.js`

## หมายเหตุการใช้งาน
- รูปทุกรูปถูกย่อในเครื่องก่อนอัปโหลด (ด้านยาวสุด 1920px, อัลบั้ม 1600px, JPEG 0.85) และหมุนตามทิศที่ถ่าย
- รูป HEIC จาก iPhone: Safari แปลงให้อัตโนมัติ ถ้าเปิดด้วย Chrome แล้วเปิดรูปไม่ได้ ให้ตั้งกล้องเป็น "เข้ากันได้มากที่สุด" (JPG)
- อัลบั้มใหม่จะเป็น **ฉบับร่าง** ก่อน อัปโหลดรูปให้ครบแล้วค่อยกด "เผยแพร่อัลบั้มนี้"
- รูปแรกที่อัปโหลดจะเป็นรูปปกอัตโนมัติ เปลี่ยนได้ด้วยปุ่ม "ตั้งเป็นปก"
- ลบข่าว/แบนเนอร์/รายการแข่ง/อัลบั้ม จะลบไฟล์รูปใน Storage ด้วย กู้คืนไม่ได้
- เปลี่ยน URL ของปุ่ม "ดูหน้าเว็บจริง" ได้ที่ `SITE_URL` ใน `js/config.js`
