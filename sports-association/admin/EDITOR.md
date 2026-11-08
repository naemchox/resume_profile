# โหมดแก้ไขบนหน้าเว็บ (Edit mode): ข้อตกลงระหว่างหน้าแอดมินกับหน้าหลัก

หน้าแอดมินเปิดหน้าเว็บหลักจริงเต็มจอในกรอบ (iframe) ด้วย `?preview=1&edit=1`
หน้าหลักวาดกรอบและปุ่มปากกาบนทุก section ที่แก้ได้ กดแล้วส่งข้อความบอกหน้าแอดมิน
หน้าแอดมินจะเปิดแผงแก้ไขด้านข้าง บันทึก แล้วโหลดกรอบใหม่ให้เห็นผล

ไฟล์นี้**ต่อยอดจาก `admin/PREVIEW.md`** (ข้อความ `jr-preview-ready` / `jr-preview-data` / `jr-preview-rendered` และรูปแบบ `patch` ยังใช้เหมือนเดิม)
ส่วนที่หน้าหลักต้องทำเพิ่มอยู่ในหัวข้อ 6

---

## 1. URL
```
{PREVIEW_SITE_URL}/index.html?preview=1&edit=1
```
- `edit=1` มีผลเฉพาะตอน `preview=1` และอยู่ใน iframe (`window.parent !== window`)
- ไม่มี `slot` ในโหมดนี้
- ลิงก์ภายในต้องต่อ `preview=1&edit=1` ไปด้วย (ต่อยอดจากโค้ดที่ต่อ `preview`/`slot` อยู่แล้ว) เพื่อให้กดไปหน้าอื่นแล้วยังแก้ได้

## 2. ป้ายบอกจุดที่แก้ได้: `data-edit`
ใส่ attribute บน element ของ section (ใส่ตลอด ไม่ต้องเช็กโหมด เพราะไม่มีผลกับการแสดงผล)

| ค่า | ความหมาย |
|---|---|
| `banners` | สไลด์แบนเนอร์หน้าแรกทั้งชุด |
| `news` | รายการข่าว (หน้าแรก, หน้า news) |
| `news:{id}` | ข่าวเรื่องเดียว (หน้า article) |
| `events` | ปฏิทินการแข่ง (หน้าแรก, หน้า competition) |
| `events:{id}` | รายการแข่งรายการเดียว (กล่องรายละเอียดในหน้า competition) |
| `albums` | รายการอัลบั้ม (หน้าแรก, หน้า media) |
| `albums:{id}` | อัลบั้มเดียว (หน้า album) |
| `siteImage:{key}` | รูปประจำหน้า (key ตาม CONTRACT) |
| `content:{key}` | ข้อมูลใน collection `content` (key ตามหัวข้อ 5) |

ใส่ `data-edit-label="ข้อความสั้น"` ได้ (ไม่บังคับ) เช่น `data-edit-label="แบนเนอร์หน้าแรก"` จะแสดงบนปุ่มปากกา

**การ์ดย่อย (แนะนำ):** ใส่ `data-edit-item="news:{id}"`, `banners:{id}`, `events:{id}`, `albums:{id}` บนการ์ด/สไลด์แต่ละใบ
จะมีปุ่มปากกาเล็กบนการ์ดนั้นด้วย กดแล้วเปิดแก้รายการนั้นตรง ๆ

### จุดที่ต้องใส่
| หน้า | section → ค่า |
|---|---|
| ทุกหน้า (layout) | ข้อมูลติดต่อในท้ายเว็บ → `content:contact` · แถบพาร์ทเนอร์ → `content:partners` |
| index | แบนเนอร์ → `banners` · การแข่งที่กำลังจะมาถึง → `events` · ข่าว → `news` · ประเภทการแข่ง → `content:categories` · อัลบั้ม → `albums` · ทีมชาติ → `siteImage:national-team` |
| news | hero → `siteImage:news-hero` · ข่าวเด่น + ตาราง → `news` |
| article | ทั้งบทความ → `news:{id}` |
| competition | hero → `siteImage:competition-hero` · ปฏิทิน → `events` · กล่องรายละเอียดแต่ละรายการ → `events:{id}` |
| media | hero → `siteImage:media-hero` · อัลบั้ม → `albums` · วิดีโอ → `content:videos` |
| album | ทั้งหน้า → `albums:{id}` |
| organisation | hero → `siteImage:organisation-hero` · about → `content:about` · affiliations → `content:affiliations` · board → `content:board` · judges → `content:judges` · coaches → `content:coaches` · clubs → `content:clubs` |
| downloads | hero → `siteImage:downloads-hero` · ทั้ง 4 หมวด → `content:downloads` |
| about-jump-rope | hero → `siteImage:about-jumprope-hero` · ประโยชน์ → `content:benefits` · คลิป → `content:videos` · ประเภท → `content:categories` · ทีมชาติ (รูป) → `siteImage:national-team` · รายชื่อทีมชาติ → `content:nationalTeam` · ผลงาน → `content:results` |
| contact | hero → `siteImage:contact-hero` · ข้อมูลติดต่อ → `content:contact` |

## 3. ข้อความ
```
หน้าหลัก (ในกรอบ)                              หน้าแอดมิน (parent)
  ── { type: 'jr-preview-ready' } ──────────▶
                                         ◀──── { type: 'jr-preview-data', patch, pending }
  วาดหน้า + กรอบแก้ไข
  ── { type: 'jr-edit-page', path, title } ─▶   บอกว่าอยู่หน้าไหน (ส่งทุกครั้งที่โหลดหน้า)
  ── { type: 'jr-preview-rendered' } ───────▶
  (ผู้ใช้กดปากกา)
  ── { type: 'jr-edit', target } ───────────▶   เปิดแผงแก้ไข
```
- ทุกข้อความจากหน้าหลักส่งไป `window.parent` ด้วย `targetOrigin: '*'` (ไม่มีข้อมูลลับ)
- `path` = `location.pathname` ตัดโฟลเดอร์ออกเหลือชื่อไฟล์ + `location.search` ที่ลบ `preview`, `edit` ออกแล้ว เช่น `article.html?id=abc`
- `title` = `document.title`
- `target` = ค่าของ `data-edit` หรือ `data-edit-item` ที่กด เช่น `'banners'`, `'news:abc'`, `'content:board'`
- **`pending`** (ใหม่ ใน `jr-preview-data`): array ของ target ที่มีการแก้รอเผยแพร่ เช่น `['banners', 'content:contact']`
  หน้าหลักแสดงป้าย "รอเผยแพร่" บน section ที่ `data-edit` ตรงกัน หรือขึ้นต้นด้วยค่านั้น (`news:abc` → section `news`)
- `patch` ในโหมดนี้คือการแก้ที่ยังรอเผยแพร่ หน้าหลักใช้เหมือนโหมดตัวอย่างทุกอย่าง
- หลังบันทึก หน้าแอดมินจะตั้ง `src` ของกรอบใหม่ (หน้าเดิมจาก `path` ล่าสุด) ไม่ต้องรับข้อความ reload

## 4. หน้าตาในโหมดแก้ไข (หน้าหลักวาดเอง)
- section ที่มี `data-edit`: เส้นกรอบประ 2px สี `--jr-blue` ด้านใน (ใช้ `outline` + `outline-offset:-2px` ไม่ให้ layout ขยับ) เข้มขึ้นตอน hover
- ปุ่มปากกา: มุมขวาบนของ section, พื้น `--jr-blue` ตัวขาว, ข้อความ "แก้ไข" + label, `position:absolute` (ใส่ `position:relative` ให้ section ถ้ายังไม่มี), z-index สูงกว่าเนื้อหาในสไลด์
- การ์ด `data-edit-item`: ปุ่มปากกากลมเล็ก 32px มุมขวาบนของการ์ด
- ปุ่มต้องกดได้บนมือถือ (อย่างน้อย 32px) และไม่ซ้อนกับปุ่มเดิมของ section (เช่นลูกศรสไลด์)
- กดปุ่มปากกา: `preventDefault` + `stopPropagation` (การ์ดเป็นลิงก์ ห้ามพาไปหน้าอื่น)
- กดเนื้อหาอื่นยังใช้ได้ตามปกติ (ลิงก์ เปลี่ยนสไลด์ แท็บหมวด)
- ป้าย "รอเผยแพร่": ป้ายสีเหลือง (`#F5B700` ตัวดำ) มุมซ้ายบนของ section
- section ที่ว่าง (ยังไม่มีข้อมูล เช่นไม่มีแบนเนอร์) ต้องยังมีพื้นที่ให้ปุ่มปากกาอยู่ (min-height อย่างน้อย 120px ในโหมดแก้ไข)
- ถ้าไม่มีแบนเนอร์เลย ในโหมดแก้ไขให้แสดงกล่องว่าง "ยังไม่มีแบนเนอร์" แทนการซ่อน section
- ฟอร์มส่งคำถามไม่ส่งจริง (เหมือนโหมดตัวอย่าง)

## 5. collection `content` (ข้อมูลที่ย้ายมาจาก `site/js/content.js`)
ทุก doc มี `updatedAt` · ถ้า doc ยังไม่มี หรือ field ไหนไม่มี → หน้าหลักใช้ค่าเดิมใน `content.js`
Firestore เก็บ array ซ้อน array ไม่ได้ จึงเปลี่ยนเป็น array ของ object

| key | field |
|---|---|
| `contact` | `name`, `nameEn`, `address`, `phone`, `email`, `hours`, `mapEmbed`, `social: { facebook, instagram, youtube, tiktok }`, `marathonUrl` |
| `partners` | `items: [{ mark, sub, logoUrl?, logoPath?, linkUrl? }]` (มี `logoUrl` → แสดงรูปแทนตัวอักษร) |
| `about` | `text` (แบ่งย่อหน้าด้วย `\n\n`) |
| `affiliations` | `items: [{ abbr, name, desc }]` |
| `board` | `president: { name, role, imgUrl?, imgPath? }`, `vice: [...]`, `members: [...]` (object แบบเดียวกัน) |
| `judges`, `coaches`, `nationalTeam` | `items: [{ name, role, imgUrl?, imgPath? }]` |
| `clubs` | `items: [{ name, province }]` |
| `downloads` | `rules`, `antiDoping`, `safeSport`, `timing`: `[{ name, meta, href, type, path? }]` (`type`: `PDF` \| `MP3` \| `LINK` · `path` = ไฟล์ใน Storage) |
| `categories` | `items: [{ key, title, th, desc, imgUrl, imgPath? }]` (`imgUrl` เป็น URL เต็ม) |
| `benefits` | `items: [{ title, desc }]` |
| `videos` | `items: [{ title, youtube }]` (`youtube` = video id) |
| `results` | `items: [{ year, event, athlete, result }]` |

`patch` เพิ่ม `content?: { upsert?: [{ id: key, ...fields }], remove?: string[] }` (`remove` → ใช้ค่าใน `content.js`)

Storage เพิ่ม:
```
content/{key}/{timestamp}-{filename}   รูปใน content (โลโก้ คน ประเภทการแข่ง)
files/{key}/{timestamp}-{filename}     ไฟล์ดาวน์โหลด PDF / MP3 (≤ 20MB)
```

## 6. หน้าหลักต้องทำอะไร
1. **`data.js`**
   - `export const EDIT = PREVIEW && params.get('edit') === '1'`
   - ลิงก์ภายในต่อ `edit=1` ด้วยเมื่อ `EDIT`
   - เก็บ `pending` จาก `jr-preview-data` แล้ว export ให้ layout ใช้ (เช่น `export const pendingPromise`)
   - เพิ่ม `getContent(key)`: อ่าน `content/{key}` → รวม patch (`content.upsert`/`remove`) → เติมค่าที่ขาดจาก `content.js` (แปลง array ซ้อนเดิมให้เป็นรูปแบบในหัวข้อ 5)
   - อ่านทีละ doc แล้ว cache ไว้ในหน้า (หน้าหนึ่งเรียกหลาย key ได้)
2. **ทุกหน้าที่ใช้ข้อมูลจาก `content.js`** (layout, home, organisation, downloads, media, about-jump-rope, contact) เปลี่ยนไปใช้ `await getContent(key)`
3. **ใส่ `data-edit`** ตามตารางในหัวข้อ 2 (+ `data-edit-item` บนการ์ด)
4. **ตัวช่วยโหมดแก้ไข** (เช่นไฟล์ใหม่ `site/js/edit-mode.js` โหลดจาก layout เฉพาะตอน `EDIT`)
   - ส่ง `jr-edit-page` หลังโหลดหน้า
   - วาดกรอบ ปุ่มปากกา ป้ายรอเผยแพร่ตามหัวข้อ 4 (หลังหน้าวาดเสร็จ และวาดซ้ำเมื่อ DOM เปลี่ยน เช่นเปลี่ยนหมวดข่าว: ใช้ `MutationObserver`)
   - กดปุ่ม → `jr-edit`
   - CSS ของโหมดนี้อยู่ใน selector ที่ขึ้นต้นด้วย `html.jr-edit` เพื่อไม่กระทบหน้าเว็บปกติ
5. **อัปเดต `site/README` หรือคอมเมนต์** ว่าข้อความใน `content.js` เป็นค่าสำรอง แก้จริงผ่านหน้าแอดมิน

## 7. ความปลอดภัย
- โหมดแก้ไขแค่วาดปุ่มและส่งข้อความบอกตำแหน่ง ไม่ได้เขียนข้อมูล หน้าหลักไม่ต้องล็อกอิน
- การเขียนทั้งหมดเกิดในหน้าแอดมิน (ล็อกอิน Google + มี doc ใน `admins`)
- การแก้ที่รอเผยแพร่เก็บใน `drafts` ซึ่งอ่านได้เฉพาะแอดมิน คนทั่วไปไม่เห็น
- หน้าแอดมินรับข้อความเฉพาะจาก `event.origin` ของหน้าหลักและ `event.source` ที่เป็นกรอบของตัวเอง
