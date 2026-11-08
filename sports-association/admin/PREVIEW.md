# โหมดตัวอย่าง (Preview): ข้อตกลงระหว่างหน้าแอดมินกับหน้าหลัก

หน้าแอดมินมีปุ่ม **ดูตัวอย่าง** ในฟอร์มแก้ไข กดแล้วจะเปิดหน้าเว็บหลักจริงในกรอบ (iframe) 2 ฝั่ง
- **ก่อนแก้**: หน้าเว็บตามข้อมูลที่เผยแพร่อยู่ตอนนี้
- **หลังแก้**: หน้าเดียวกัน แต่แทนที่ข้อมูลด้วยสิ่งที่กำลังแก้ในฟอร์ม (ยังไม่ได้บันทึก)

หน้าแอดมินส่งข้อมูลให้ทาง `postMessage` หน้าหลักต้องรับแล้วนำไปรวมกับข้อมูลที่ดึงมา
**ส่วนที่หน้าหลักต้องทำอยู่ในหัวข้อ "หน้าหลักต้องทำอะไร" ด้านล่าง**

---

## 1. URL
หน้าแอดมินเปิดหน้าใดก็ได้ของเว็บหลัก โดยเติม `preview=1` และ `slot=before|after`
```
{PREVIEW_SITE_URL}/article.html?id=abc&preview=1&slot=after
{PREVIEW_SITE_URL}/index.html?preview=1&slot=before
```
- `PREVIEW_SITE_URL` ตั้งใน `admin/js/config.js`
  - เปิดแอดมินจาก localhost หรือ 127.0.0.1 จะใช้ `http://127.0.0.1:5610` (เซิร์ฟเวอร์ทดสอบของหน้าหลัก)
  - ถ้าเปิดจากที่อื่นจะใช้ `SITE_URL` (`https://samplesport.com`)
- หน้าที่แอดมินเปิด: `index.html`, `news.html`, `article.html?id=`, `competition.html`, `media.html`, `album.html?id=`, `organisation.html`, `downloads.html`, `about-jump-rope.html`, `contact.html`

## 2. ลำดับข้อความ
```
หน้าหลัก (ในกรอบ)                          หน้าแอดมิน (parent)
  โหลดหน้า ?preview=1
  ── { type: 'jr-preview-ready' } ──────▶
                                     ◀──── { type: 'jr-preview-data', patch }
  รวม patch กับข้อมูลจริง แล้ววาดหน้า
  ── { type: 'jr-preview-rendered' } ───▶   (ไม่บังคับ)
```
- หน้าหลักส่ง `jr-preview-ready` ไปที่ `window.parent` ด้วย `targetOrigin: '*'`
  ส่งได้เพราะข้อความนี้ไม่มีข้อมูลอะไร
- หน้าแอดมินตอบกลับด้วย `targetOrigin` = origin ของหน้าหลักเท่านั้น
- ฝั่ง **ก่อนแก้** จะได้ `patch = {}` (แสดงตามจริง) ฝั่ง **หลังแก้** จะได้ patch ของสิ่งที่กำลังแก้
- ถ้าภายใน 3 วินาทีไม่ได้รับ `jr-preview-data` ให้ใช้ `patch = {}`
- กดลิงก์ภายในกรอบแล้วไปหน้าใหม่ หน้าแอดมินจะส่ง patch ให้หน้าใหม่อีกครั้ง (ถ้าหน้าใหม่ส่ง `jr-preview-ready` มา)

## 3. รูปแบบ `patch`
```js
{
  news?:       { upsert?: Doc[], remove?: string[] },
  banners?:    { upsert?: Doc[], remove?: string[] },
  events?:     { upsert?: Doc[], remove?: string[] },
  albums?:     { upsert?: Doc[], remove?: string[] },
  siteImages?: { upsert?: [{ id: key, url, alt }], remove?: string[] }
}
```
- `Doc` มี field ตาม CONTRACT.md ทุกตัว + `id`
- **เวลาทุกช่องเป็นตัวเลข millis** (`publishedAt`, `startDate`, `endDate`, `date`, `createdAt`, `updatedAt`)
  เพราะ postMessage ส่ง Timestamp ของ Firestore ไม่ได้ ใน `site/js/data.js` ฟังก์ชัน `norm()` แปลงตัวเลขเป็น Date ให้อยู่แล้ว
- รูปที่เลือกแต่ยังไม่อัปโหลด จะมาเป็น `data:image/jpeg;base64,…` ใส่ใน `<img src>` ได้ตรง ๆ
  ถ้าหน้าหลักต่อ query string เพื่อย่อรูป (เช่น `IMG(url, w)`) ต้องข้ามกรณีที่ URL ขึ้นต้นด้วย `data:`
- `id` ของรายการใหม่ที่ยังไม่บันทึกคือ `'preview-new'`
- ใน `albums.upsert` อาจมี `photos: [{ id, url, caption, order }]` ถ้ามีให้ใช้แทนการดึงรูปจาก Firestore
  (หน้าเว็บที่ไม่ได้ล็อกอินอ่านรูปของอัลบั้มที่ยังเป็นร่างไม่ได้)
- ใน patch ฝั่งหลังแก้ แอดมินตั้ง `status: 'published'` ให้ข่าว รายการแข่ง และอัลบั้ม เพื่อให้เห็นหน้าตาตอนเผยแพร่
  แบนเนอร์ส่ง `active` ตามจริง (ถ้าปิดอยู่ก็ไม่ต้องแสดง)

## 4. หน้าหลักต้องทำอะไร
ทำทั้งหมดใน `site/js/data.js` (+ จุดเล็ก ๆ ใน layout ถ้าต้องการ)

1. **เปิดโหมดเฉพาะตอนอยู่ในกรอบ**: `preview = qs('preview') === '1' && window.parent !== window`
   ถ้าเปิดหน้าตรง ๆ (ไม่อยู่ใน iframe) ให้ไม่สนใจพารามิเตอร์นี้
2. **รอ patch ก่อนดึงข้อมูล**: สร้าง `patchPromise` ตอนโหลดโมดูล
   - ส่ง `jr-preview-ready` แล้วรอ `jr-preview-data` ที่ `event.source === window.parent`
   - ถ้าเกิน 3 วินาทีให้ resolve เป็น `{}`
   - ทุกฟังก์ชัน `get*` ต้อง `await patchPromise` ก่อนคืนค่า (ถ้าไม่ใช่โหมดตัวอย่างให้ resolve `{}` ทันที)
3. **รวม patch กับข้อมูลรายการ** (`getBanners`, `getNews`, `getEvents`, `getAlbums`)
   - ตัดรายการที่ id อยู่ใน `remove` หรือ `upsert` ออก
   - เติมรายการใน `upsert` (ผ่าน `norm()`)
   - กรองด้วยเงื่อนไขเดิม (`status === 'published'` หรือ `active === true`) แล้วเรียงลำดับเหมือนเดิม
   - ใช้กับทั้งข้อมูลจาก Firestore และ SEED (ตอน `FIREBASE_READY === false`)
4. **ดึงรายการเดียว** (`getNewsById`, `getAlbum`): ถ้า id อยู่ใน `upsert` ให้คืนตัวนั้น
   - อัลบั้มที่มี `photos` ใน patch ให้ใช้ photos นั้นเลย
   - ถ้า id อยู่ใน `remove` ให้คืน `null`
5. **รูปประจำหน้า** (`getSiteImage`): มีใน `upsert` → ใช้ `url` นั้น · อยู่ใน `remove` → ใช้รูปสำรอง
6. **วาดหน้าเสร็จแล้ว** (ไม่บังคับ): ส่ง `{ type: 'jr-preview-rendered' }` ไปที่ `window.parent` หน้าแอดมินใช้ซ่อนข้อความ "กำลังโหลด"
7. **ลิงก์ภายใน** (แนะนำ): ในโหมดตัวอย่างให้ต่อ `preview=1&slot=…` ให้ลิงก์ภายในเว็บ เพื่อให้กดไปหน้าอื่นแล้วยังเห็นข้อมูลที่แก้
8. **ห้ามเขียนข้อมูล**: ฟอร์มส่งคำถามในโหมดตัวอย่างไม่ต้องส่งจริง

ตัวอย่างโค้ดส่วนรับ patch (วางใน `data.js`):
```js
const PREVIEW = new URLSearchParams(location.search).get('preview') === '1' && window.parent !== window;
const patchPromise = !PREVIEW ? Promise.resolve({}) : new Promise(resolve => {
  const done = p => { window.removeEventListener('message', onMsg); resolve(p || {}); };
  const onMsg = e => { if (e.source === window.parent && e.data?.type === 'jr-preview-data') done(e.data.patch); };
  window.addEventListener('message', onMsg);
  window.parent.postMessage({ type: 'jr-preview-ready' }, '*');
  setTimeout(() => done({}), 3000);
});

function applyPatch(list, part, keep) {
  if (!part) return list;
  const drop = new Set([...(part.remove || []), ...(part.upsert || []).map(d => d.id)]);
  return [...list.filter(d => !drop.has(d.id)), ...(part.upsert || []).map(norm)].filter(keep);
}
```

## 5. ความปลอดภัย
- patch มีผลแค่ในกรอบของคนที่เปิดอยู่ ไม่ได้เขียน Firestore และไม่กระทบผู้เข้าชมคนอื่น
- หน้าหลักรับ patch เฉพาะจาก `window.parent` และเฉพาะตอนอยู่ใน iframe
- ถ้าต้องการเข้มขึ้น ให้หน้าหลักเช็ก `event.origin` กับรายชื่อโดเมนของหน้าแอดมินเพิ่มด้วย

## 6. กรอบ "หน้าเว็บตอนนี้" (`focus`)
หน้าแอดมินแต่ละหน้า (ข่าว แบนเนอร์ ปฏิทิน อัลบั้ม รูปประจำหน้า) มีกรอบแสดงเว็บหลักตามข้อมูลที่เผยแพร่อยู่ แต่เห็นเฉพาะส่วนที่เกี่ยวข้อง
```
{PREVIEW_SITE_URL}/index.html?preview=1&slot=live&focus=latestNews
{PREVIEW_SITE_URL}/news.html?preview=1&slot=live&focus=lead,newsList
```
- `focus` = id ของส่วนที่จะแสดง คั่นด้วย `,` ใช้ได้กับทุกหน้า (ทำไว้ใน `site/js/data.js`)
- หน้าหลักซ่อนเมนู footer และส่วนอื่นทั้งหมด จนกว่าจะส่ง `jr-preview-rendered` (ไม่เกิน 4 วินาที) ถ้าหา id ไม่เจอจะแสดงทั้งหน้า
- หน้าหลักส่ง `{ type: 'jr-preview-size', height }` ทุกครั้งที่ความสูงของส่วนที่แสดงเปลี่ยน แอดมินใช้ตัดความสูงกรอบ
- แอดมินตอบ `jr-preview-ready` ด้วย `patch = {}` และโหลดกรอบใหม่เองเมื่อคอลเลกชันใน Firestore เปลี่ยน
- id ที่แอดมินใช้ (ตั้งใน `LIVE_VIEWS` ของ `admin/js/config.js`) **ห้ามเปลี่ยนชื่อฝั่งหน้าหลักโดยไม่แก้ที่นี่**

| id | อยู่ที่ |
|---|---|
| `hero`, `upcomingEvents`, `latestNews`, `latestAlbums`, `nationalTeam` | `site/index.html` |
| `lead`, `newsList` | `news.html` |
| `calendar`, `details` | `competition.html` |
| `photos` | `media.html` |
| `national-team` | `about-jump-rope.html` |
| `pageHero` | รูปหัวของทุกหน้า (`pageHero()` ใน `site/js/render.js`) |
