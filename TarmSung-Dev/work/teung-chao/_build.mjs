#!/usr/bin/env node
/* เดโมนี้ใช้เครื่องประกอบกลาง — ข้อมูลของแบรนด์อยู่ที่ _src/site.mjs
   เหตุผลที่แยกเป็นของกลาง อยู่หัวไฟล์ playbook/build-multi.mjs */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../../playbook/build-multi.mjs";
await build(dirname(fileURLToPath(import.meta.url)));
