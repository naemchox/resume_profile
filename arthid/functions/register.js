#!/usr/bin/env node
// Registers the slash commands with Discord. Run it once, and again whenever
// a command's name, description or options change — Discord caches the schema
// and will not pick up edits on its own.
//
//   DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... [DISCORD_GUILD_ID=...] npm run register
//
// With DISCORD_GUILD_ID the commands register to that one server and appear
// instantly — use this while building. Without it they register globally,
// which works everywhere but can take up to an hour to propagate.

// Read .env, so the bot token lives in the file that is already gitignored
// rather than in a shell command (and therefore in shell history). Env vars
// that are already set win, which keeps the one-off `VAR=... npm run register`
// form working. Twelve lines instead of a dependency — this is the only
// script in the project that needs it.
function loadEnv() {
  const path = require('path').join(__dirname, '.env');
  let text;
  try { text = require('fs').readFileSync(path, 'utf8'); } catch { return; }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
    if (!m) continue;                                    // blank line or # comment
    const value = m[2].trim().replace(/^["'](.*)["']$/, '$1');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadEnv();

const APP_ID = process.env.DISCORD_APP_ID;
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!APP_ID || !TOKEN) {
  const missing = [!APP_ID && 'DISCORD_APP_ID', !TOKEN && 'DISCORD_BOT_TOKEN'].filter(Boolean);
  console.error(`Missing ${missing.join(' and ')}.`);
  console.error('Add to functions/.env (gitignored):');
  missing.forEach(k => console.error(`  ${k}=...`));
  console.error('\nThe bot token is at Discord Developer Portal → your app → Bot → Reset Token.');
  process.exit(1);
}

// Option types: 1 SUB_COMMAND · 3 STRING · 4 INTEGER · 5 BOOLEAN
const S = 3, I = 4, B = 5, SUB = 1;

// One date shape across the whole bot — mirrored by WHEN_TEMPLATE in
// commands.js, which is what actually parses these. A slash option has no
// placeholder, so the description carries the template and `autocomplete`
// puts real, correctly-shaped dates under the box as it is typed.
const WHEN_TEMPLATE = 'DD/MM/YYYY HH:mm';
const whenOption = (name, label, required) => ({
  type: S, name, required, autocomplete: true,
  description: `${label} ${WHEN_TEMPLATE} เช่น 20/08/2569 14:00 (เวลาไทย)`,
});

const commands = [
  {
    name: 'link',
    description: 'เชื่อม Discord กับบัญชี Arthid ของคุณ',
    options: [
      {
        type: SUB, name: 'account', description: 'เชื่อมด้วย Primary Key จากแอป Arthid',
        options: [{ type: S, name: 'key', description: 'Primary Key ของคุณ', required: true }],
      },
      { type: SUB, name: 'remove', description: 'ยกเลิกการเชื่อมบัญชี' },
    ],
  },
  {
    name: 'bind',
    description: 'ผูกห้องนี้กับแชท Arthid',
    options: [{ type: S, name: 'chat', description: 'chatId ของแชท (เว้นว่างเพื่อดูรายการ)', required: false }],
  },
  {
    name: 'todo',
    description: 'Planner ของแชทที่ผูกกับห้องนี้',
    options: [
      { type: SUB, name: 'list', description: 'ดูงานทั้งหมด' },
      {
        type: SUB, name: 'add', description: 'เพิ่มงานใหม่',
        options: [{ type: S, name: 'text', description: 'รายละเอียดงาน', required: true }],
      },
      {
        type: SUB, name: 'done', description: 'ทำเครื่องหมายว่าเสร็จแล้ว',
        options: [{ type: S, name: 'task', description: 'ข้อความของงาน (บางส่วนก็ได้)', required: true }],
      },
      {
        type: SUB, name: 'reopen', description: 'กลับมาเป็นยังไม่เสร็จ',
        options: [{ type: S, name: 'task', description: 'ข้อความของงาน', required: true }],
      },
      {
        type: SUB, name: 'edit', description: 'แก้ไขข้อความของงาน (เว้นว่างเพื่อเลือกจากลิสต์)',
        options: [{ type: S, name: 'task', description: 'เว้นว่างไว้เพื่อเลือกจากลิสต์', required: false }],
      },
      {
        type: SUB, name: 'remove', description: 'ลบงาน (เว้นว่างเพื่อเลือกจากลิสต์ได้หลายอัน)',
        options: [{ type: S, name: 'task', description: 'เว้นว่างไว้เพื่อเลือกจากลิสต์', required: false }],
      },
    ],
  },
  {
    name: 'project',
    description: 'โปรเจกต์ของแชทที่ผูกกับห้องนี้',
    options: [
      { type: SUB, name: 'list', description: 'ดูโปรเจกต์ทั้งหมด' },
      {
        type: SUB, name: 'show', description: 'ดูรายละเอียดโปรเจกต์',
        options: [{ type: S, name: 'project', description: 'ชื่อโปรเจกต์', required: true }],
      },
      {
        type: SUB, name: 'new', description: 'สร้างโปรเจกต์ใหม่',
        options: [
          { type: S, name: 'title', description: 'ชื่อโปรเจกต์', required: true },
          { type: S, name: 'desc', description: 'คำอธิบาย', required: false },
          { type: S, name: 'emoji', description: 'อีโมจิประจำโปรเจกต์', required: false },
          // Filling this in also creates the matching /schedule entry.
          whenOption('deadline', 'เดดไลน์', false),
        ],
      },
      {
        // Opens a prefilled form — title, emoji, description, deadline and
        // status are all edited there rather than as slash options.
        type: SUB, name: 'edit', description: 'แก้ไขโปรเจกต์ (เว้นว่างเพื่อเลือกจากลิสต์)',
        options: [{ type: S, name: 'project', description: 'เว้นว่างไว้เพื่อเลือกจากลิสต์', required: false }],
      },
      {
        type: SUB, name: 'remove', description: 'ลบโปรเจกต์ (เว้นว่างเพื่อเลือกจากลิสต์ได้หลายอัน)',
        options: [{ type: S, name: 'project', description: 'เว้นว่างไว้เพื่อเลือกจากลิสต์', required: false }],
      },
    ],
  },
  {
    name: 'schedule',
    description: 'กำหนดการของแชทที่ผูกกับห้องนี้ พร้อมนับถอยหลัง',
    options: [
      { type: SUB, name: 'list', description: 'ดูกำหนดการทั้งหมด + เหลืออีกเท่าไหร่' },
      {
        // `when` is optional so leaving it blank can open the form, where the
        // box comes prefilled in the template shape instead of empty.
        type: SUB, name: 'add', description: 'เพิ่มกำหนดการ (เว้นวันเวลาไว้เพื่อกรอกในฟอร์ม)',
        options: [
          { type: S, name: 'title', description: 'ชื่อกำหนดการ', required: true },
          whenOption('when', 'วันเวลา', false),
          { type: S, name: 'note', description: 'รายละเอียดเพิ่มเติม', required: false },
        ],
      },
      {
        // Leave every option blank and it opens a prefilled form instead;
        // filling one in changes just that field without the round trip.
        type: SUB, name: 'edit', description: 'แก้ไขกำหนดการ (เว้นว่างเพื่อเลือกจากลิสต์)',
        options: [
          { type: S, name: 'event', description: 'ชื่อกำหนดการ (เว้นว่างไว้เพื่อเลือกจากลิสต์)', required: false },
          whenOption('when', 'วันเวลาใหม่', false),
          { type: S, name: 'title', description: 'ชื่อใหม่', required: false },
          { type: S, name: 'note', description: 'รายละเอียดใหม่', required: false },
        ],
      },
      {
        type: SUB, name: 'remove', description: 'ลบกำหนดการ (เลือกจากลิสต์ได้หลายอัน)',
        options: [],
      },
    ],
  },
  {
    name: 'poll',
    description: 'โพลของแชทที่ผูกกับห้องนี้',
    options: [
      { type: SUB, name: 'list', description: 'ดูโพลทั้งหมด' },
      {
        type: SUB, name: 'new', description: 'สร้างโพลใหม่',
        options: [
          { type: S, name: 'question', description: 'คำถาม', required: true },
          { type: S, name: 'option1', description: 'ตัวเลือกที่ 1', required: true },
          { type: S, name: 'option2', description: 'ตัวเลือกที่ 2', required: true },
          { type: S, name: 'option3', description: 'ตัวเลือกที่ 3', required: false },
          { type: S, name: 'option4', description: 'ตัวเลือกที่ 4', required: false },
          { type: B, name: 'multi', description: 'เลือกได้หลายข้อ', required: false },
          { type: B, name: 'anon', description: 'ไม่ระบุชื่อผู้โหวต', required: false },
        ],
      },
      {
        type: SUB, name: 'vote', description: 'โหวต',
        options: [
          { type: S, name: 'poll', description: 'คำถามของโพล (บางส่วนก็ได้)', required: true },
          { type: I, name: 'choice', description: 'หมายเลขตัวเลือก', required: true },
        ],
      },
    ],
  },
];

const url = GUILD_ID
  ? `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`
  : `https://discord.com/api/v10/applications/${APP_ID}/commands`;

(async () => {
  const res = await fetch(url, {
    method: 'PUT',                        // PUT replaces the whole set
    headers: {
      'Authorization': `Bot ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`Registration failed (${res.status}):\n${body}`);
    process.exit(1);
  }
  const registered = JSON.parse(body);
  console.log(`Registered ${registered.length} commands ${GUILD_ID ? `to guild ${GUILD_ID}` : 'globally'}:`);
  registered.forEach(c => console.log(`  /${c.name}`));
  if (!GUILD_ID) console.log('\nGlobal commands can take up to an hour to appear.');
})();
