#!/usr/bin/env node
/* =============================================================================
   shoot-reel.mjs — ถ่ายคลิป "หน้าเว็บกำลังถูกเลื่อน" ที่การ์ดในฮีโร่เล่นตอน hover
   ใช้: node playbook/shoot-reel.mjs            # ถ่ายใหม่ทุกตัว
        node playbook/shoot-reel.mjs the-bed    # ถ่ายเฉพาะที่ระบุ

   21/8/26 — เลิกถ่ายแบบ stop-motion แล้ว อัดวิดีโอจริงแทน
   ของเดิมทำแบบนี้: กระโดด scrollTo(y) -> รอ SETTLE 140ms -> ถ่ายภาพนิ่ง -> ทำซ้ำ
   แล้วเอาภาพมาต่อกันที่ 24fps ซึ่งแปลว่าเวลาจริง 140ms ถูกยัดลงในเฟรมวิดีโอที่ยาว
   41.7ms = เวลาในคลิปเดินเร็วกว่าความจริงอย่างน้อย 3.4 เท่า และที่หนักกว่านั้น:

     - observer ยิง reveal ตอนของอยู่ต่ำกว่าขอบล่างจอ 200px (rootMargin 25%)
     - อนิเมชัน reveal ยาว 1,100ms = 8 เฟรมถ่าย
     - 8 เฟรมนั้นหน้าเลื่อนไปแค่ 8 x 13.3 = 106px

   200 > 106 แปลว่าอนิเมชันทุกตัววิ่งจบตั้งแต่ยังอยู่ใต้ขอบจอ ไม่เคยโผล่เข้ากล้อง
   เลยสักเฟรม (วัดจริงทั้งสามหน้า: krua 6,146px/462 เฟรม, terrace 8,176/615,
   homecraft 7,412/557 = 13.3px/เฟรม เท่ากันหมด) คลิปอ้างอิงทุกใบจึงโชว์เว็บที่
   นิ่งกว่าของจริง ซึ่งเป็นสิ่งที่ลูกค้าดูก่อนตัดสินใจจ้าง

   ตอนนี้ใช้ recordVideo ของ playwright แล้วเลื่อนหน้าด้วย rAF ตามเวลานาฬิกาจริง
   เวลาบนหน้าเว็บกับเวลาในคลิปจึงเป็นเวลาเดียวกัน อนิเมชันเล่นเท่าที่คนเห็นจริง

   เหตุผลที่ยังไม่ปรับ playbackRate แทน: ผู้เล่นวิดีโอไม่ได้สร้างเฟรมขึ้นมาใหม่
   มันแค่ค้างเฟรมเดิมไว้นานขึ้น — 0.25x บนคลิป 24fps เหลือภาพจริง 6 ภาพต่อวินาที
   อยากเปลี่ยนจังหวะให้แก้ PX_PER_SEC ข้างล่าง ไม่ใช่ไปแตะ REEL_RATE ใน main.js

   21/8/26: เลิกใช้ "จำนวนเฟรมรายหน้า" แล้ว
   เดิมแต่ละหน้าจดเลข frames ของตัวเองไว้ เพื่อให้ระยะเลื่อนต่อเฟรมของทุกใบเท่ากัน
   เหตุผลนั้นยังถูกอยู่ แต่วิธีนั้นผูกตัวเลขไว้กับความสูงของหน้า ณ วันที่วัด — พอแก้เนื้อหา
   แล้วลืมกลับมาปรับ คลิปใบนั้นก็ไถผิดจังหวะเงียบๆ (วันเดียวลืมไป 3 รอบ) ตอนนี้จึงกำหนด
   "ความเร็ว" เป็นค่าคงที่ตัวเดียว แล้วให้สคริปต์วัดความสูงจริงตอนถ่ายเอง
   ของที่คำนวณเองไม่มีวันค้าง
   ========================================================================== */

import { mkdtempSync, rmSync, existsSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { makeWebmTwin } from "./webm-twin.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ลิสต์นี้เหลือแค่ "หน้าไหนบ้าง" กับ "ต้องกดอะไรก่อนถึงเห็นหน้าจริง" (prep)
   ความยาวคลิปและระยะไถคำนวณจากความสูงจริงตอนถ่าย ดู PX_PER_SEC / MAX_SECONDS */
const SHOTS = {
  // 720 ไม่ใช่ 400: หน้านี้ไม่ pin อะไรไว้เลย ทั้งเฟรมเลื่อนพร้อมกันหมด 100%
  // เพื่อนบ้านที่ pin ครึ่งจอไว้จึงดูช้ากว่าทั้งที่ตัวเลขต่อเฟรมพอกัน — ใบนี้ต้องต่ำกว่า
  // ค่าเฉลี่ยถึงจะ "รู้สึก" เท่ากัน ตอนนี้อยู่ที่ 13.3px/เฟรม เท่ากับ prototype2 ที่ผ่านตาแล้ว
  "the-bed":      { file: "work/the-bed/index.html" },
  // 700 ไม่ใช่ 220: หน้า lumen ถูกเขียนใหม่ทั้งใบ (11 section) เลื่อนได้ ~9,300px แล้ว
  // ที่ 220 เฟรมคือ 42px/เฟรม เร็วกว่าเพื่อนสามเท่า — 700 ทำให้กลับมาที่ ~13.3px/เฟรม
  /* ใบนี้ใบเดียวที่ถ่ายแบบ stop-motion — ข้อยกเว้นที่มีเหตุผล ไม่ใช่ของหลงเหลือ
     22/8/26 วัดคลิปทั้งเก้าใบด้วย scdet (ค่าการขยับต่อเฟรม): lumen มีเฟรมที่ภาพ
     แทบไม่ขยับ 97 จาก 346 เฟรม (28%) และความกระตุกสัมพัทธ์ 0.61 ขณะที่เพื่อนบ้าน
     อยู่ที่ 0.14-0.21 — 4 วินาทีแรกของคลิป (ช่วงที่คนเห็นตอนชี้การ์ด) หน้าขยับแค่
     เฟรมเว้นสองเฟรม = ได้ภาพจริง ~8 ภาพต่อวินาทีบนคลิป 25fps
     สาเหตุ: lumen เป็นหน้าเดียวในชุดที่รัน WebGL ทุกเฟรม (มันคือเดโมของ shader)
     ตัวเรนเดอร์แย่งเวลาไปจากตัวอัด การอัดตามเวลานาฬิกาจริงจึงได้เฟรมซ้ำ
     เคยแก้ด้วยการไถช้าลง 30% แล้วไม่หาย (ฉบับนั้นคือตัวที่วัดได้ 0.61)

     ทำไม stop-motion ถึงใช้กับใบนี้ได้ทั้งที่ทั้งระบบเลิกใช้ไปแล้ว: ข้อเสียของ
     stop-motion คือมัน "อัดเวลาจริง" ให้สั้นลง อนิเมชันของหน้าจึงเล่นเร็วกว่าที่คนเห็น
     — แต่ใบนี้ถ่ายด้วย reducedMotion อยู่แล้ว คือหน้าหยุดอนิเมชันของตัวเองระหว่างถ่าย
     ไม่มีอนิเมชันให้บิดเบือน เหลือแค่การไถ ซึ่ง stop-motion ให้ระยะต่อเฟรมเท่ากันเป๊ะ
     ทุกเฟรมโดยธรรมชาติ (ฉบับ 20/8 ที่ถ่ายวิธีนี้วัดได้ กระตุก 0.06 · เฟรมค้าง 0 เฟรม)
     ถ้าวันไหนเอา reducedMotion ออกจากใบนี้ ต้องเอา stopMotion ออกพร้อมกัน */
  lumen:          { file: "work/lumen/index.html", reducedMotion: true, stopMotion: true },
  // เดิมชื่อ prototype2 ชี้ไปที่ work/prototype2/prototype2.html — โฟลเดอร์นั้นถูกลบไป
  // แล้วกู้กลับมาเป็น work/summit/ (2026-08-20) พร้อม motion layer ที่ยาวขึ้น
  // travel วัดสด 6,284px หารด้วย 13.3px/เฟรม ให้จังหวะเท่าใบอื่น
  /* SUMMIT ถูกถอดออกจากหน้าผลงานแล้ว (ไม่มีการ์ดไหนชี้ไป) จึงไม่ต้องถ่ายอีก —
     ซอร์สยังอยู่ที่ work/summit/ ถ้าจะเอากลับขึ้นเว็บ ใส่บรรทัดนี้กลับแล้วรันใหม่
     ได้ไฟล์คืนใน 30 วินาที เหมือนที่ทำกับ parcela 21/8/26 ถ้าปล่อยไว้ในลิสต์
     ทุกรอบเต็มจะเสียเวลาถ่ายไฟล์ที่ไม่มีใครเสิร์ฟ แล้วไฟล์นั้นก็ไปนอนกินที่บนเว็บ
  summit:         { file: "work/summit/index.html" }, */
  // flow / sample5 / prototype6.1 ถูกลบออกจาก work/ ไปแล้ว เอาออกจากลิสต์ด้วยเหตุผล
  // เดียวกับที่ shoot-cover.mjs เอาออก — ไม่งั้นสคริปต์ฟ้อง "หาไฟล์ไม่เจอ" ทุกครั้งที่รันเปล่า
  // สองใบนี้ถ่ายเพิ่มตอนพอร์ต hover preview ไปหน้า reference (ที่นั่นมีการ์ดพวกนี้ ฮีโร่ไม่มี)
  // travel วัดสด: homecraft 6,617px / velvet-leaf 8,636px → หารด้วย 13.3px/เฟรม ให้จังหวะเท่าเพื่อน
  // 557 ไม่ใช่ 498: โฟลเดอร์นี้เคยเป็น build ของลูกค้า (House and Home) แล้วถูกเปลี่ยน
  // เป็นตัว demo Homecraft ซึ่งยาวกว่า — วัดสดได้ 7,412px หารด้วย 13.3px/เฟรม
  homecraft:      { file: "work/homecraft/index.html" },
  // เดโมสาย SME ไทย — วัด travel สดที่ 1280x800 แล้วหารด้วย 13.3px/เฟรม เท่าใบอื่น
  // รอบแรก (2026-08-20) สามหน้านี้เลื่อนได้แค่ ~1,000-1,300px ได้คลิปแค่ 3-4 วินาที
  // แก้ที่ต้นเหตุแล้วคือ "เติม section ให้หน้าเว็บ" (ขั้นตอนสั่ง · รีวิว · คำถามที่พบบ่อย)
  // ไม่ใช่ยืดจำนวนเฟรม เพราะยืดแล้วคลิปจะเลื่อนช้าผิดจังหวะเพื่อนทั้งหน้า
  // วัดรอบสอง 21/8/26 หลังเติมบล็อกให้สี่หน้านี้ยาวขึ้นเท่าเดโมใบยาว — travel เพิ่ม
  // เป็นสองเท่ากว่า ถ้าไม่ขยับ frames ตาม คลิปจะเลื่อน 20-29px/เฟรม คือเร็วกว่า
  // เพื่อนสองเท่า (หน้าเปลี่ยน = ต้องวัดใหม่เสมอ ตัวเลขพวกนี้ไม่ใช่ค่าคงที่ของไซต์)
  // วัดรอบสี่ 21/8/26 — จอที่ถ่ายเปลี่ยนจาก 1280 เป็น 1600 (ดูเหตุผลที่ OUT_W)
  // หน้ากว้างขึ้น = เนื้อจัดได้แถวละมากขึ้น = หน้าสั้นลง travel จึงลดลงทุกใบ
  // ตัวเลขพวกนี้ไม่ใช่ค่าคงที่ของไซต์ เปลี่ยนหน้าหรือเปลี่ยนจอที่ถ่าย = ต้องวัดใหม่
  // วัดรอบสาม 21/8/26 หลังรอบ "แก้จืดใต้ hero" ซึ่งเติมแถบมืด แผนผังซอย และลายเส้น
  // ให้สามหน้านี้ หน้าจึงยาวขึ้นอีก 550-850px หน้าเปลี่ยน = ต้องวัดใหม่เสมอ
  // krua 6,694px / glow 7,091px / parcela 7,001px / terrace 8,176px ÷ 13.3
  // krua วัดใหม่ 21/8/26 หลังเพิ่มใบออเดอร์ (ปุ่มเก็บ 24 แถว + แผงสรุป) หน้ายาว 8,873px ÷ 13.3
  "krua-baansuan": { file: "work/krua-baansuan/index.html" },
  "glow-clinic":   { file: "work/glow-clinic/index.html" },
  "the-terrace":   { file: "work/the-terrace/index.html" },
  "chang-chat":    { file: "work/chang-chat/index.html" },
  /* เดโม 5 หน้า (แพ็ก ฿7,500) — 22/8/26 หน้าผลงานเปลี่ยนมาโชว์ฉบับ 5 หน้าของสามแบรนด์นี้
     แทนฉบับหน้าเดียวแล้ว ถ้ารีลในฮีโร่ยังไถฉบับหน้าเดียวอยู่ คนที่ชี้การ์ด "โกลว์ คลินิก"
     จะได้ดูคนละเว็บกับที่กดเข้าไปเจอ ถ่ายหน้าแรกของแต่ละใบเป็นตัวแทน เหมือนใบอื่นในชุด */
  "glow-clinic-multi": { file: "work/glow-clinic-multi/index.html" },
  "the-terrace-multi": { file: "work/the-terrace-multi/index.html" },
  "the-bed-multi":     { file: "work/the-bed-multi/index.html" },
  /* PARCELA ถูกถอดออกจากหน้าผลงาน 21/8/26 (jek สั่งเอาเดอะ เทอเรสขึ้นแทน)
     ซอร์สยังอยู่ที่ work/parcela/ ไม่ได้ลบ — ถ้าจะเอากลับขึ้นเว็บ ใส่บรรทัดของมัน
     กลับเข้าลิสต์นี้แล้วรันใหม่ ได้ไฟล์คืนใน 30 วินาที ไม่ต้องเก็บไฟล์ตายไว้บนเว็บ */
  // prep = ต้องทำอะไรก่อนถึงจะเห็นหน้าจริง หน้านี้มีประตูอายุ (Are you 20 or older?)
  // ที่เก็บสถานะไว้ใน state ของ React ไม่ใช่ storage จึงต้อง "กด" เท่านั้น
  // รอบแรกที่ถ่ายโดยไม่กด ได้คลิปหน้าประตูนิ่ง 27 วินาที (78 kb/s) — วัดแล้ว
  "velvet-leaf":  { file: "work/velvet-leaf/index.html",         prep: async (page) => {
      const yes = page.getByRole("button", { name: /yes,? i am 20|ใช่|20\+/i }).first();
      if (await yes.count()) { await yes.click(); await page.waitForTimeout(1200); }
    } },
};

const W = 1600, H = 1000;     // จอที่ถ่าย — กว้างกว่า 1280 เพราะเป็นต้นทางของการย่อ
const DSF = 1;                /* dpr 2 ใช้ไม่ได้: วัดแล้ว playwright เอาภาพจอ 1280x800
                                 ไปวางมุมซ้ายบนของเฟรม 2560x1600 ที่เหลือเป็นสีเทา
                                 เนื้อจริงจึงเหลือ 720x450 หลังย่อ = แย่กว่าเดิม
                                 (ไฟล์เล็กลงเพราะครึ่งเฟรมเป็นเทาเรียบ ไม่ใช่เพราะคม) */

/* 1440 ไม่ใช่ 1024 — วัด 21/8/26 (jek: "y quality of videos so bad")
   เหตุผลเดิมที่เลือก 1024 อ้างว่าการ์ดผลงานกว้าง 824 พิกเซลจริง ซึ่งไม่จริงอีกแล้ว:
   หน้าต่างดูผลงานตอนนี้คือ .peek { width: min(94vw, 1400px) } และวิดีโอกินเต็ม
   ความกว้าง = ~1,350 CSS px = ~2,700 พิกเซลจริงบนจอ retina คลิป 1024 จึงถูกยืด
   2.6 เท่าทุกครั้งที่เปิดดู ที่ 1440 เหลือ 1.9 เท่า

   ถ่าย 1600 แล้วย่อลง 1440 ไม่ใช่ถ่าย 1440 ตรงๆ — การย่อคือการ supersample
   ตัวหนังสือคมกว่าและไฟล์เล็กกว่าที่ความคมเท่ากัน วัดจริงบนโกลว์ คลินิก (คลิปทดสอบ
   9.3 วินาที แปลงเป็นคลิปจริง 25 วินาที):
     1024 จาก 1280 crf32 (ของเดิม) = 2.4MB
     1280 จาก 1280 crf28           = 4.1MB
     1440 จาก 1440 crf30           = 4.2MB
     1440 จาก 1600 crf31 (อันนี้)  = 3.2MB   ← คมที่สุดต่อไบต์
   นับเฟรมซ้ำด้วย mpdecimate ได้ 207/233 เท่ากันทุกแบบ = ไม่ได้แลกด้วยความกระตุก */
const OUT_W = 1440, OUT_H = 900;
const CRF = 31;

/* 30 ไม่ใช่ 24/25 — จอ 60Hz หารด้วย 30 ลงตัวพอดี (1 เฟรมคลิป = 2 เฟรมจอเสมอ)
   24 ให้ 2.5 และตัวอัดวิดีโอของ playwright ให้ 25 ซึ่งได้ 2.4 — ทั้งคู่หารไม่ลงตัว
   เบราว์เซอร์จึงต้องสลับแสดง 3-2-2-3-2 เฟรมจอ ภาพที่ไถอยู่เลยเร็วช้าสลับกัน ±25%
   ตลอดเวลา = อาการ "คลิปกระตุก/สั่น" ที่ jek ทัก 24/8/26
   วัดจริงบน the-bed: เดิมเฟรมขึ้นจอห่าง 50/50/16.7/50 ms (SD 15ms) · หลังแก้
   33.4/33.3/33.3/33.3 ms (SD 0.1ms) = เรียบสนิท ตัวเลขขยับ 150 เท่า */
const FPS = 30;

/* จังหวะไถ — ค่านี้คือสิ่งที่ jek อนุมัติไว้หลังตีกลับสองรอบ (ดู HERO-REEL-UPDATE-2026-08-18.md:
   รอบแรกเร็วไป รอบสองยังเร็วไป จบที่ "80% ของรอบสอง") 13.3 px ต่อเฟรม x 24fps = 319 px/วินาที
   ทุกหน้าต้องไถด้วยความเร็วนี้เท่ากัน ไม่งั้นคลิปที่ยาวเท่ากันจะรู้สึกเร็ว/ช้าไม่เท่ากัน */
/* ผูกกับ "ความเร็วเป็น px ต่อวินาที" ไม่ใช่ "px ต่อเฟรม" — เดิมเขียน 13.3*FPS ซึ่งพอ
   ขยับ FPS เป็น 30 ความเร็วไถจะพุ่งเป็น 399px/วิ (เร็วขึ้น 25% จากที่ jek อนุมัติหลัง
   ตีกลับสองรอบ) 319 = 13.3 x 24 ของเดิมเป๊ะ ระยะต่อเฟรมกลายเป็น 10.6px แทน 13.3px */
const PX_PER_SEC = 319;

/* เพดานความยาวคลิป — 21/8/26 วัดบนเว็บจริง: คนที่ "กด" ดูผลงานโดยไม่เคยชี้การ์ดมาก่อน
   (มือถือ / กดเร็ว) ต้องรอโหลดคลิปทั้งก้อน เพราะ Cloudflare Pages ตอบ Range request
   ด้วย 200 พร้อมไฟล์เต็ม ไม่ใช่ 206 → ตัวโหลดสื่อของ Safari จึงไม่เก็บคลิปไว้ในแคชปกติ
   เวลารอเป็นฟังก์ชันของขนาดไฟล์ล้วนๆ และคลิป 22-26 วินาทีคือ 1.6-2.7MB ต่อไฟล์

   ทางเลือกมีสองทางเท่านั้น: ไถเร็วขึ้นเท่าตัว หรือไถไม่จนจบหน้า
   เลือกอย่างหลัง เพราะความเร็วไถคือของที่ jek ตีกลับมาแล้วสองรอบ ส่วน "เห็นไม่จบหน้า"
   ไม่ได้เสียอะไรจริง — คลิปนี้เป็นตัวอย่างตอนชี้ ไม่ใช่ตัวแทนของทั้งเว็บ คนที่อยากดูจนจบ
   กดเปิดหน้าต่างดูผลงานหรือกดเข้าเว็บจริงได้ */
const MAX_SECONDS = 13;
const HOLD_HEAD = 2400;       // ค้างที่ฮีโร่หลังหน้าเพิ่งโหลดเสร็จ ก่อนเริ่มไถ (ms)
                              // 2,400 ไม่ใช่ 700: คลิปเริ่มที่ "หน้าเพิ่งรีเฟรช" แล้ว
                              // อนิเมชันขาเข้าของฮีโร่ยาวถึง ~1,700ms (reveal 1,100ms
                              // + ดีเลย์ชั้น d3 อีก ~600ms) ต้องปล่อยให้เล่นจบก่อนไถ
const HOLD_TAIL = 900;        // ค้างท้ายหน้าอีกนิด ไม่ให้คลิปจบกลางอากาศ
/* ตัดหัวคลิปทิ้งเท่ากับช่วงที่ฮีโร่ยังเล่นอนิเมชันขาเข้า (21/8/26 jek: "why its not
   same size with when hover") — เดิมตัดถึงแค่ FCP คลิปจึงเริ่มที่เฟรมซึ่งรูปฮีโร่ยัง
   ซูมค้างและตัวหนังสือยังไม่โผล่ ส่วนภาพนิ่งของการ์ดคือสภาพ "นิ่งแล้ว" พอเอาเมาส์ชี้
   ภาพจึงกระตุกเปลี่ยนขนาดทันที ทั้งที่ไฟล์ทั้งสองขนาดเท่ากันเป๊ะ (1440x900)
   1600 มาจากความยาวอนิเมชันฮีโร่ที่วัดไว้ในคอมเมนต์ของ HOLD_HEAD (~1,700ms) */
/* ตัดหัวคลิปทั้งช่วง "ค้างที่ฮีโร่" ทิ้ง ไม่ใช่แค่ช่วงอนิเมชัน (21/8/26 jek:
   "i prefer it start with sliding when i hover") — เอาเมาส์ชี้แล้วต้องเห็นหน้าเว็บ
   เริ่มไถทันที ไม่ใช่นิ่งค้างก่อนหนึ่งวินาที เฟรมแรกยังเป็นหัวเว็บที่นิ่งแล้ว
   (= ภาพเดียวกับภาพนิ่งของการ์ด) แค่เริ่มเคลื่อนตั้งแต่เฟรมถัดไป
   ค่านี้เท่ากับ HOLD_HEAD พอดี เขียนอ้างอิงไว้เพื่อให้แก้ที่เดียวแล้วตามกันทั้งคู่ */
const TRIM_SETTLE = HOLD_HEAD;

/* ffmpeg เป็นของบังคับ ไม่ใช่ของเสริม: playwright คายมาเป็น .webm (VP8) ซึ่งซาฟารี
   เล่นไม่ได้ และซาฟารีคือเบราว์เซอร์ที่เจ้าของเว็บนี้ใช้เทสเอง */
function pickEncoder() {
  /* crf กับขนาดไฟล์ยังสำคัญกว่าปกติ เพราะ (วัดซ้ำ 21/8/26) Cloudflare Pages
     ไม่ตอบ Range request กับ .mp4 เลย — ขอ 1KB แรกได้ status 200 พร้อมไฟล์ทั้งก้อน
     และไม่มีเฮดเดอร์ accept-ranges เบราว์เซอร์จึงสตรีมไม่ได้ ต้องโหลดจนจบก่อน
     ถึงจะเล่นลื่น ขนาดไฟล์ = อาการกระตุกของคนกดดู ไม่ใช่แค่ตัวเลขบนดิสก์ */
  const H264 = ["-c:v", "libx264", "-crf", String(CRF), "-preset", "slow",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart"];
  if (process.env.FFMPEG_BIN && existsSync(process.env.FFMPEG_BIN)) return { bin: process.env.FFMPEG_BIN, args: H264 };
  /* บนวินโดวส์ ffmpeg-static ลงไฟล์ชื่อ ffmpeg.exe — ชื่อเปล่าไม่มีอยู่จริง สคริปต์จึง
     ตกไปฟ้อง "ต้องมี ffmpeg ก่อน" ทั้งที่ของอยู่ในเครื่อง (เจอ 24/8/26 ตอนถ่ายรอบ 30fps) */
  for (const name of ["ffmpeg", "ffmpeg.exe"]) {
    const local = join(ROOT, "node_modules", "ffmpeg-static", name);
    if (existsSync(local)) return { bin: local, args: H264 };
  }
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return { bin: "ffmpeg", args: H264 }; } catch {}
  console.error("ต้องมี ffmpeg ก่อน (playwright คายมาเป็น .webm ซึ่งซาฟารีเล่นไม่ได้):");
  console.error("  npm i -D ffmpeg-static     แล้วรันใหม่");
  process.exit(2);
}

const want = process.argv.slice(2);
const list = want.length ? want : Object.keys(SHOTS);
for (const n of list) if (!SHOTS[n]) { console.error(`ไม่รู้จัก "${n}" — มีให้เลือก: ${Object.keys(SHOTS).join(", ")}`); process.exit(2); }

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { console.error("ต้องมี playwright ก่อน:  npm i -D playwright && npx playwright install chromium"); process.exit(2); }

const enc = pickEncoder();
const browser = await chromium.launch();

for (const name of list) {
  const { file } = SHOTS[name];
  const src = join(ROOT, file);
  if (!existsSync(src)) { console.error(`✗ ${name}: หา ${file} ไม่เจอ`); process.exitCode = 1; continue; }

  const dir = mkdtempSync(join(tmpdir(), `reel-${name}-`));
  /* บางหน้ามีอนิเมชันของตัวเองที่กินเครื่องตลอดเวลา (lumen เรนเดอร์ WebGL ทุกเฟรม)
     พอถ่ายพร้อมกับการไถหน้า เบราว์เซอร์วาดไม่ทัน ความกระตุกเลยถูกอัดติดไปในไฟล์
     ตั้ง reducedMotion ให้หน้านั้นตอนถ่าย = หน้าหยุดอนิเมชันของตัวเอง (lumen เขียนไว้
     เองว่า reduced motion = เดินควันในตัวอักษร 40 เฟรมให้แสงสะสมครบแล้วค้าง) เครื่อง
     จึงเหลือแรงให้การไถลื่น — ภาพที่ได้ยังเป็นหน้าจริงทุกพิกเซล แค่ไม่ขยับระหว่างไถ

     22/8/26 — ก่อนหน้านี้ lumen เขียนไว้ว่า reduced = ไม่วาดควันเลย ซึ่งกินหัวเรื่อง
     LUMEN ไปด้วย (แสงในตัวอักษรมาจากแคนวาสควันล้วนๆ) คลิปใบนี้เลยทึบกว่าภาพนิ่ง
     ของหน้าเดียวกันมาตลอด ถ้าจะเพิ่มหน้าไหนเข้ามาใช้ธงนี้ ต้องเปิดดูก่อนว่าหน้านั้น
     ผูกอะไรที่ "มองเห็น" ไว้กับ prefers-reduced-motion หรือเปล่า */
  /* ทุกใบถ่ายแบบ stop-motion ตั้งแต่ 24/8/26 — ไม่ใช่แค่ lumen อีกต่อไป
     เหตุผล: ตัวอัดวิดีโอของ playwright ตรึงไว้ที่ 25fps เปลี่ยนไม่ได้ ตราบใดที่ยังใช้มัน
     คลิปจะกระตุกบนจอ 60Hz เสมอ (ดูคอมเมนต์ที่ FPS) stop-motion ถ่ายทีละเฟรมเอง
     จึงคุมได้เป๊ะ 30fps · เทียบภาพ velvet-leaf เฟรมต่อเฟรมแล้วไม่มีของหายหรือค้างครึ่ง */
  const stopMotion = true;
  const ctx = await browser.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: DSF,
    ...(stopMotion ? {} : { recordVideo: { dir, size: { width: W, height: H } } }),
    ...(SHOTS[name].reducedMotion ? { reducedMotion: "reduce" } : {}),
  });

  /* หน้าอุ่นเครื่อง — ต้องอยู่ใน context เดียวกับหน้าที่ถ่าย ไม่ใช่ context แยก
     เพราะแคชของ playwright แยกตาม context ถ้าอุ่นคนละ context หน้าที่ถ่ายก็ยัง
     โหลดใหม่หมดอยู่ดี ที่ต้องอุ่นเพราะคลิปนี้เริ่มที่ "หน้าเพิ่งรีเฟรช" — ถ้าฟอนต์กับ
     รูปยังไม่อยู่ในแคช สิ่งที่คนดูเห็นคือหน้าตอนของยังมาไม่ครบ ซึ่งเป็นภาพที่คนเข้า
     เว็บรอบสองไม่มีวันเห็น (the-bed ประกาศฟอนต์ด้วย display=optional — ฟอนต์มา
     ไม่ทันเฟรมแรกเมื่อไหร่ หัวเรื่องเป็น Times ไปทั้งคลิป วัดแล้ว 20/8/26) */
  const warm = await ctx.newPage();
  await warm.goto("file://" + src, { waitUntil: "load" });
  await warm.evaluate(() => document.fonts.ready);
  await warm.waitForTimeout(1500);
  if (SHOTS[name].prep) await SHOTS[name].prep(warm);
  await warm.close();

  const page = await ctx.newPage();
  const tOpen = Date.now();                    // นาฬิกาเริ่มเดินพร้อมกับที่วิดีโอเริ่มอัด
  await page.goto("file://" + src, { waitUntil: "load" });

  /* จุดเริ่มคลิป = เฟรมแรกที่หน้าเว็บพ่นสีออกมา ไม่ใช่จุดที่ทุกอย่างนิ่งแล้ว
     (jek 21/8/26: "can it start from real refresh so people can see the animation
     of hero page") — เอาเวลา first-contentful-paint จริงของหน้า แล้วแปลงเป็น
     เวลานาฬิกาเดียวกับที่วิดีโอเริ่ม จะได้ตัดหัวคลิปตรงจุดนั้นพอดี */
  const fcpAbs = await page.evaluate(() => {
    const e = performance.getEntriesByName("first-contentful-paint")[0];
    return performance.timeOrigin + (e ? e.startTime : 0);
  });
  const leadIn = Math.max(0, (fcpAbs - tOpen) / 1000);

  if (SHOTS[name].prep) await SHOTS[name].prep(page);
  await page.addStyleTag({ content: "html{scroll-behavior:auto !important}" });

  const travel = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  if (travel < 200) {
    console.error(`✗ ${name}: หน้านี้เลื่อนได้แค่ ${travel}px — ไม่มีอะไรให้ถ่าย`);
    await page.close(); await ctx.close(); continue;
  }
  /* วัดความสูงจริง ณ ตอนถ่าย ไม่ใช่เลขที่จดไว้ในไฟล์นี้ — เลขที่จดไว้ต้องวัดใหม่ทุกครั้ง
     ที่หน้าเปลี่ยน ซึ่ง 21/8/26 วันเดียวลืมไป 3 รอบ ของที่คำนวณเองไม่มีวันค้าง */
  const pxPerSec = SHOTS[name].pxPerSec || PX_PER_SEC;   // ค่าเฉพาะใบ ถ้ามี (ดู SHOTS)
  const seconds = Math.min(MAX_SECONDS, travel / pxPerSec);
  const distance = Math.min(travel, seconds * pxPerSec);
  const pct = Math.round(distance / travel * 100);
  process.stdout.write(`${name}: ${seconds.toFixed(1)} วิ, เลื่อน ${Math.round(distance)}/${travel}px (${pct}% ของหน้า, ${pxPerSec}px/วิ) `);

  // รอให้อนิเมชันขาเข้าของฮีโร่เล่นจบ — นับจาก FCP ไม่ใช่จากตอนนี้
  const sinceFcp = Date.now() - fcpAbs;
  await page.waitForTimeout(Math.max(0, HOLD_HEAD - sinceFcp));

  if (stopMotion) {
    /* กระโดดทีละ pxPerSec/FPS พิกเซล แล้วถ่ายภาพนิ่ง — รอสองเฟรมวาดจริง
       (rAF ซ้อน rAF) ไม่ใช่รอเวลาคงที่ จะได้ไม่ต้องเดาว่าหน้าวาดเสร็จหรือยัง */
    const frames = Math.round(seconds * FPS);
    const pad = (i) => join(dir, `f${String(i).padStart(5, "0")}.png`);
    for (let i = 0; i <= frames; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.round(distance * (i / frames)));
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.screenshot({ path: pad(i) });
    }
    // ค้างท้าย = เฟรมสุดท้ายซ้ำ ให้ยาวเท่ากับ HOLD_TAIL ของสายอัดจริง
    for (let i = 1; i <= Math.round(HOLD_TAIL / 1000 * FPS); i++) copyFileSync(pad(frames), pad(frames + i));
  } else {
  /* ไถด้วย rAF ตามเวลานาฬิกาจริง เชิงเส้นล้วน ไม่ใส่ ease — คลิปนี้เลียนแบบ
     "คนกำลังไถอ่าน" ไม่ใช่ทรานซิชันของ UI ถ้าใส่ ease หัวกับท้ายจะคลานแล้วกลางจะพุ่ง */
  await page.evaluate(({ ms, distance }) => new Promise((done) => {
    const travel = distance;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      window.scrollTo(0, travel * k);
      if (k < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  }), { ms: seconds * 1000, distance });

    await page.waitForTimeout(HOLD_TAIL);
  }
  await page.close();          // ไฟล์วิดีโอถูกเขียนตอนปิดหน้า ไม่ใช่ตอนหยุดไถ
  const raw = stopMotion ? null : await page.video().path();
  await ctx.close();

  const out = join(ROOT, "assets/work/reel", `${name}.mp4`);
  execFileSync(enc.bin, stopMotion ? [
    "-v", "error", "-y",
    "-framerate", String(FPS),
    "-i", join(dir, "f%05d.png"),
    "-vf", `scale=${OUT_W}:${OUT_H}:flags=lanczos`,
    ...enc.args,
    out,
  ] : [
    "-v", "error", "-y",
    "-ss", (leadIn + TRIM_SETTLE / 1000).toFixed(2),
    "-i", raw,
    "-t", ((HOLD_HEAD - TRIM_SETTLE + HOLD_TAIL) / 1000 + seconds).toFixed(2),
    "-vf", `scale=${OUT_W}:${OUT_H}:flags=lanczos`,
    ...enc.args,
    out,
  ]);
  /* คู่แฝด WebM ของคลิปเดียวกัน — ต้องเกิดพร้อมกันเสมอ ห้ามทำทีหลังด้วยมือ
     หน้าเว็บเสิร์ฟ .webm ก่อนแล้วค่อยตก .mp4 (ดู setReelSources ใน js/main.js)
     คำสั่ง ffmpeg ย้ายไปอยู่ที่ playbook/webm-twin.mjs แล้ว เพราะคลิปในหน้าผลงาน
     มีสองสายการผลิต (เว็บใช้ไฟล์นี้ · แอปใช้ shoot-app-reel.mjs) แต่ข้อกำหนดของ
     ไฟล์ที่ออกมาต้องเหมือนกัน — 21/8/26 ด่านใน deploy.mjs จับได้ว่า ijek.mp4
     ไม่เคยมีคู่แฝดเลยเพราะสายที่สองไม่ได้ทำ ก๊อปคำสั่งไปวางสองที่คือรอให้มันเพี้ยน */
  makeWebmTwin(out, enc.bin);
  rmSync(dir, { recursive: true, force: true });
  console.log(` → ${file.split("/")[1]} เสร็จ`);
}

await browser.close();
