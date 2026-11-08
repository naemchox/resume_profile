#!/bin/bash
# คัดลอกโค้ด Apps Script จากไฟล์หลัก (AppsScript-*.gs) มาไว้ที่นี่ แล้ว clasp push ขึ้นโปรเจกต์ของผู้ว่าจ้าง
# ใช้:  ./sync.sh          (คัดลอก + push)
#       ./sync.sh --copy   (คัดลอกอย่างเดียว)
set -euo pipefail
cd "$(dirname "$0")"
SRC=..
cp "$SRC/AppsScript-drivers.gs"    Driver.js
cp "$SRC/AppsScript-auth.gs"       Auth.js
cp "$SRC/AppsScript-lineIntake.gs" LineOA.js
cp "$SRC/AppsScript-master.gs"     Master.js
cp "$SRC/AppsScript-driverform.gs" DriverForm.js   # Google Form คนขับ (onDriverFormSubmit) — ไม่คัดมา = push แล้วไฟล์นี้หายจากโปรเจกต์ ฟอร์มหยุดคัดลงชีต
cp "$SRC/AppsScript-backup.gs"     Backup.js   # สำรอง Firestore ลงชีตทุกคืน (backupFirestoreNow)
cp "$SRC/AppsScript-restore.gs"    Restore.js  # กู้ Firestore จากชีตสำรอง (restorePreview → restoreRun)
[ -f "$SRC/AppsScript-migrate.gs" ] && cp "$SRC/AppsScript-migrate.gs" Migrate.js
[ "${1:-}" = "--copy" ] && exit 0
clasp push --force
