# คู่กับ _contrast.mjs — คำนวณ contrast ทีละพิกเซลจากคู่ภาพ (มีตัวอักษร / ไม่มีตัวอักษร)
#
# ทำไมต้องเทียบทีละพิกเซล: ตัวอักษรบางจุดเป็น rgba โปร่ง (เช่น rgba(255,255,255,.62))
# สีจริงบนจอจึงขึ้นกับพื้นหลังใต้มัน — เอาค่าใน CSS มาคำนวณตรงๆ จะได้ตัวเลขที่ดีเกินจริง
# และถ้าไปหยิบ percentile ของ "ทุกพิกเซลในกรอบ" มาเป็นพื้นหลัง ก็จะได้ตัวอักษรเองกลับมา
import json, sys
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/summit-contrast"

def lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def lum(px):
    return 0.2126 * lin(px[0]) + 0.7152 * lin(px[1]) + 0.0722 * lin(px[2])

def ratio(a, b):
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)

rows = json.load(open(f"{OUT}/targets.json"))
fails = 0
for row in rows:
    A = list(Image.open(row["a"]).convert("RGB").getdata())
    B = list(Image.open(row["b"]).convert("RGB").getdata())
    diffs = [(sum(abs(a[i] - b[i]) for i in range(3)), a, b) for a, b in zip(A, B)]
    diffs.sort(key=lambda t: -t[0])
    # ตัวหนังสือเล็กและเส้นบาง (12px น้ำหนัก 600, ไอคอน stroke 2px) แทบไม่มีพิกเซลที่
    # ทับเต็ม 100% เลย ถ้าเกณฑ์หลวมไป จะได้พิกเซลครึ่งใบมาแล้วรายงานว่าตกทั้งที่สีจริงผ่าน
    # => เอาเฉพาะพิกเซลที่ต่างจากพื้นหลังเกือบเท่าจุดที่ต่างมากที่สุดในกรอบ
    core = [t for t in diffs if t[0] >= diffs[0][0] * 0.85]           # แกนกลางของ glyph ไม่เอาขอบ antialias
    if not core:
        print(f'??  ไม่เจอพิกเซลตัวอักษร  {row["label"]}')
        continue
    rs = sorted(ratio(lum(a), lum(b)) for _, a, b in core)
    r = rs[int(len(rs) * 0.10)]                                        # แย่สุด 10% ของแกนกลาง
    size, weight = row["size"], int(row["weight"])
    large = size >= 24 or (size >= 18.66 and weight >= 700)
    # ไอคอน/เส้นกราฟิกใช้เกณฑ์ non-text ของ WCAG = 3:1 ไม่ใช่ 4.5:1 ของตัวหนังสือ
    need = 3.0 if (large or row.get("kind") == "graphic") else 4.5
    ok = r >= need
    fails += 0 if ok else 1
    print(f'{"PASS" if ok else "FAIL"}  {r:5.2f}:1  (ต้องการ {need}:1)  {size:.0f}px  {row["label"]}  [{len(core)} px]')
print("ตก", fails, "จุด")
