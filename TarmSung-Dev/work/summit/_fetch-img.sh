#!/bin/bash
# โหลดรูปจาก Unsplash มาเก็บไว้ในโฟลเดอร์นี้ แล้วแปลงเป็น webp
#
# ทำไมต้องเก็บเอง ไม่ลิงก์สด:
# เดโมชิ้นนี้เคยลิงก์รูป 12 ใบตรงไปที่ images.unsplash.com แล้ววันหนึ่ง ID สองใบ
# ก็ชี้ไปคนละรูป — หมวด "Tumblers" กลายเป็นโซฟาในห้องนั่งเล่น "Accessories"
# กลายเป็นรถสปอร์ตสีแดง โดยไม่มีใครแก้อะไรเลย นั่นคือหน้าที่ลูกค้าจะเปิดเจอ
# รูปที่เราไม่ได้ถือไฟล์เอง = หน้าเว็บที่พังได้เองตอนไหนก็ได้
#
# รัน: bash work/summit/_fetch-img.sh   (ต้องมี curl กับ cwebp)
set -euo pipefail
cd "$(dirname "$0")"

fetch() {  # fetch <ชื่อไฟล์> <photo-id> <ความกว้าง>
  local out="$1" id="$2" w="$3"
  curl -fsSL "https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=85" -o "/tmp/_ui.jpg"
  cwebp -quiet -q 82 "/tmp/_ui.jpg" -o "${out}.webp"
  printf '%-24s %s\n' "${out}.webp" "$(du -h "${out}.webp" | cut -f1)"
}

# ---- หมวดสินค้า (การ์ด 3:4) ----
fetch cat-sport        photo-1502904550040-7534597429ae 900
# สองใบนี้เปลี่ยนรูปใหม่ ของเดิมชี้ไปคนละเรื่องแล้ว:
#   Tumblers เดิม photo-1556228453-efd6c1ff04f6  -> โซฟาในห้องนั่งเล่น
#   Accessories เดิม photo-1610847499832-918a1c3c6811 -> รถสปอร์ตสีแดง
fetch cat-tumblers     photo-1760013529626-fd37a6771ae4 900   # กล้อง+กระติกโอลีฟ+แผนที่
fetch cat-accessories  photo-1557685888-68043f4d680f    900   # คาราไบเนอร์เทา-ส้ม เข้ากับสี accent

# ---- สินค้า (การ์ด 1:1) ----
# bottle-sand ใช้ทั้งการ์ดหมวด "Bottles" และสินค้า "Basecamp 24oz" — รูปเดียวกันอยู่แล้ว
# ทั้งคู่ทับด้วย CSS filter ให้เป็นโทนทราย จึงไม่ต้องเก็บสองไฟล์
fetch bottle-sand      photo-1602143407151-7111542de6e8 900
fetch prod-trailhead   photo-1625708458528-802ec79b1ed8 800
fetch prod-crosswind   photo-1683383277379-644816d886e2 800
fetch prod-ridgeline   photo-1610824352934-c10d87b700cc 800

# ---- ภาพใหญ่ ----
fetch story            photo-1533873984035-25970ab07461 1400
# 1600 ไม่ใช่ 2000: ที่ 2000 ไฟล์ออกมา 444K ใบเดียวหนักกว่ารูปอื่นทั้งหน้ารวมกัน
fetch banner           photo-1464822759023-fed622ff2c3b 1600
fetch collection-camp  photo-1551632436-cbf8dd35adfa    1400
fetch collection-water photo-1486870591958-9b9d0d1dda99 1400

rm -f /tmp/_ui.jpg
