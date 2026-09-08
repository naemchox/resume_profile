# Ijek — Networked Multiplayer (race your friends) · build plan

**เป้าหมาย:** เพิ่มเพื่อนด้วย "friend code" → เห็น progress วันนี้ของเพื่อน → แข่งกันแบบ leaderboard + "คุณ vs เพื่อน" (สด ถ้าใช้ realtime)

**ทำไมต้อง backend:** ข้อมูลของแต่ละคนต้องอยู่ที่ส่วนกลางให้ทุกคนอ่านได้ — client-only ทำไม่ได้. สแต็กแนะนำ: **Supabase** (Postgres + Auth + Realtime + Row Level Security, free tier พอเริ่ม).

> ⚠️ ของที่มีอยู่: data model มี `K.players` ('tm_players', `Player{id,name,emoji,color,schedule}`) แต่เป็น **dead plumbing** (ไม่มี UI) — นั่นคือ "เพื่อน local" คนละเรื่องกับ networked นี้. จะ reuse ตัว normPlayer/loadPlayers เป็นที่เก็บ cache เพื่อนก็ได้ หรือทิ้งไปใช้ตารางจาก Supabase ตรงๆ

---

## 1) Supabase — ตั้งโปรเจกต์ (~15 นาที)
1. supabase.com → New project → เก็บ **Project URL** + **anon public key**
2. Authentication → เปิด provider (เริ่มง่ายสุด: **Email magic link** หรือ Google OAuth)
3. SQL Editor → รัน schema ข้างล่าง

```sql
-- โปรไฟล์ (1 ต่อ 1 กับ auth user)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  avatar_emoji text default '🦊',
  friend_code text unique not null,          -- โค้ดสั้นไว้แอดเพื่อน เช่น 'IJEK-7K2Q'
  created_at timestamptz default now()
);

-- เพื่อน (เก็บ 2 แถวเวลาเป็นเพื่อนกัน เพื่อ query ง่าย)
create table friendships (
  user_id   uuid references profiles(id) on delete cascade,
  friend_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, friend_id)
);

-- คะแนนรายวัน (push ทุกครั้งที่ความคืบหน้าเปลี่ยน)
create table daily_scores (
  user_id  uuid references profiles(id) on delete cascade,
  day      date not null,
  pct      int  not null default 0,          -- % ตามทันวันนี้ (dayCredit.pct)
  streak   int  not null default 0,          -- streakStats.current
  done_min int  not null default 0,
  plan_min int  not null default 0,
  updated_at timestamptz default now(),
  primary key (user_id, day)
);

-- เปิด RLS
alter table profiles      enable row level security;
alter table friendships   enable row level security;
alter table daily_scores  enable row level security;

-- helper: id เพื่อนของฉัน
create or replace function my_friend_ids() returns setof uuid
  language sql security definer stable as
$$ select friend_id from friendships where user_id = auth.uid() $$;

-- profiles: อ่านของตัวเอง+เพื่อน, แก้ได้เฉพาะของตัวเอง, สร้างได้เฉพาะ id ตัวเอง
create policy p_sel on profiles for select using (id = auth.uid() or id in (select my_friend_ids()));
create policy p_ins on profiles for insert with check (id = auth.uid());
create policy p_upd on profiles for update using (id = auth.uid());

-- friendships: เห็น/จัดการเฉพาะแถวของตัวเอง
create policy f_all on friendships for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- daily_scores: อ่านของตัวเอง+เพื่อน, เขียน/แก้เฉพาะของตัวเอง
create policy s_sel on daily_scores for select using (user_id = auth.uid() or user_id in (select my_friend_ids()));
create policy s_ups on daily_scores for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

> เพิ่มเพื่อนแบบ 2 ทางอัตโนมัติ: ตอนแอดด้วย friend_code ให้ insert ทั้ง (me→them) และ (them→me) ผ่าน RPC `security definer` (เพราะ RLS ปกติเขียนแถวของคนอื่นไม่ได้). เขียน function `add_friend(code text)` แบบ security definer ที่ insert ทั้งสองแถว.

---

## 2) Client — ต่อใน train.html (~ครึ่งวัน)
โหลด SDK (พินเวอร์ชันเหมือน react):
```html
<script src="https://unpkg.com/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>
```
config (placeholder — ใส่ค่าจริงตอนมี project):
```js
const SB_URL = '<YOUR_SUPABASE_URL>';
const SB_ANON = '<YOUR_ANON_KEY>';
const sb = (SB_URL.startsWith('http')) ? window.supabase.createClient(SB_URL, SB_ANON) : null; // null = ฟีเจอร์ปิดอยู่
```

**flow:**
1. **Sign in** (Supabase Auth) — แทน mock `tm_auth` เดิม (หรืออยู่คู่กันไปก่อน: mock = guest, Supabase = social)
2. **ensureProfile()** — ครั้งแรก insert profiles + สุ่ม friend_code
3. **Add friend** — กรอก code → `rpc('add_friend', {code})`
4. **pushScore()** — เรียกตอน `done`/streak เปลี่ยน: upsert `daily_scores` วันนี้ จาก `dayCredit()`+`streakStats()` (debounce ~2–5 วิ)
   ```js
   async function pushScore(pct, streak, doneMin, planMin) {
     if (!sb) return;
     const day = new Date().toISOString().slice(0,10);
     await sb.from('daily_scores').upsert({ user_id: (await sb.auth.getUser()).data.user.id, day, pct, streak, done_min:doneMin, plan_min:planMin, updated_at:new Date().toISOString() });
   }
   ```
5. **Leaderboard** — ดึงคะแนนเพื่อนวันนี้ → เรียงตาม pct → render race bars (reuse `.tp-row`/`.race` UI):
   ```js
   const day = new Date().toISOString().slice(0,10);
   const { data } = await sb.from('daily_scores').select('user_id,pct,streak,profiles(display_name,avatar_emoji)').eq('day', day).order('pct',{ascending:false});
   ```
6. **Realtime (สด)** — subscribe เพื่อให้แถบเพื่อนขยับเรียลไทม์:
   ```js
   sb.channel('scores').on('postgres_changes', { event:'*', schema:'public', table:'daily_scores' }, reloadBoard).subscribe();
   ```

**UI ใหม่:** แท็บ/หน้าจอ "Friends" — รายการเพื่อน + ปุ่มแอดด้วย code + leaderboard วันนี้ (อันดับ + emoji + %+streak) + แตะเพื่อน 1 คน → "คุณ vs เขา" race เต็มจอ (reuse race component)

---

## 3) เก็บกวาด / privacy
- เพิ่ม toggle "เข้าร่วม leaderboard เพื่อน" (บางคนไม่อยากแชร์ progress) — default off, opt-in
- profiles/scores แชร์เฉพาะ "เพื่อนที่แอดกัน 2 ทาง" (RLS บังคับแล้ว) ไม่ใช่ public
- อัปเดต `privacy.html`: ตอนนี้ networked = ข้อมูลคะแนนรายวัน+ชื่อ/emoji ถูกเก็บบน Supabase และแชร์กับเพื่อน
- gate เป็นฟีเจอร์ฟรี (social = ตัวดึง retention/ไวรัล) หรือ Pro ก็ได้ — แนะนำ **ฟรี** เพื่อการเติบโต

---

## 4) ลำดับ slice (ทำทีละก้อน ให้ verify ได้)
1. Supabase project + schema + Auth (sign-in ใช้ได้)
2. ensureProfile + friend_code + add_friend RPC
3. pushScore (คะแนนขึ้น DB จริง — เช็คใน Supabase table)
4. Friends screen + leaderboard (ดึงคะแนนเพื่อนมาโชว์)
5. "คุณ vs เพื่อน" race + realtime
6. privacy toggle + อัปเดตเอกสาร

> backend นี้ทำเสร็จแล้ว **ต่อยอดได้ฟรี**: cloud sync (sync `tm_*` ผ่าน Supabase), Web Push (reminders ปิดแอป ผ่าน Supabase Edge Function + cron), real billing webhook — ดู [[DEPLOY.md]] ข้อ 6
```
