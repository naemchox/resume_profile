// Command handlers. Each returns the payload for followUp() — the interaction
// has already been acked with a deferred reply by the time these run, so they
// can take as long as Firestore needs.

const admin = require('firebase-admin');
const A = require('./arthid');
const D = require('./discord');

const FieldValue = admin.firestore.FieldValue;

/* ------------------------------------------------------------------ /link */

async function handleLink(interaction, { sub, opts }) {
  const discordUserId = (interaction.member?.user || interaction.user)?.id;

  if (sub === 'remove') {
    await A.unlinkDiscordUser(discordUserId);
    return { content: 'ยกเลิกการเชื่อมบัญชีแล้ว (Unlinked.)' };
  }

  const res = await A.linkByPrimaryKey(discordUserId, opts.key);
  if (res.ok) {
    return { content: `เชื่อมบัญชีกับ **${res.name}** เรียบร้อย ✅\nต่อไปใช้ \`/bind\` เพื่อผูกห้องนี้กับแชท Arthid` };
  }
  const why = {
    empty: 'ใส่ Primary Key ด้วย',
    'not-found': 'ไม่พบผู้ใช้ที่มีคีย์นี้ — เปิดแอป Arthid แล้วคัดลอก Primary Key มาอีกครั้ง',
    taken: 'บัญชี Arthid นี้ถูกเชื่อมกับ Discord อื่นแล้ว — ให้บัญชีนั้นใช้ `/link remove` ก่อน',
  }[res.reason] || 'เชื่อมบัญชีไม่สำเร็จ';
  return { content: `❌ ${why}` };
}

/* ------------------------------------------------------------------ /bind */

async function handleBind(interaction, { opts }) {
  const discordUserId = (interaction.member?.user || interaction.user)?.id;
  const uid = await A.uidForDiscordUser(discordUserId);
  if (!uid) return { content: 'ใช้ `/link` ก่อน (Run `/link` first.)' };

  const chats = await A.chatsForUid(uid);
  if (!chats.length) return { content: 'ไม่พบแชทที่คุณเป็นสมาชิก' };

  // `chat` is an autocomplete option, so by the time we get here it already
  // holds a chatId. Guard anyway — a user can type a raw value.
  const chosen = chats.find(c => c.id === opts.chat);
  if (!chosen) {
    const list = await Promise.all(chats.map(async c => `• \`${c.id}\` — ${await A.describeChat(c, uid)}`));
    return { content: 'เลือกแชทจากรายการนี้:\n' + list.join('\n') };
  }

  await A.bindChannel(interaction.channel_id, interaction.guild_id, chosen.id, uid);
  const label = await A.describeChat(chosen, uid);
  return { content: `ผูกห้องนี้กับ **${label}** แล้ว ✅\nลอง \`/todo list\` หรือ \`/project list\` ได้เลย` };
}

/* ------------------------------------------------------------------ /todo */

async function handleTodo(interaction, { sub, opts }) {
  const ctx = await A.resolveContext(interaction);
  if (ctx.error) return { content: ctx.error };
  const tasks = A.db().collection('chats').doc(ctx.chatId).collection('tasks');

  if (sub === 'add') {
    const text = String(opts.text || '').trim();
    if (!text) return { content: 'ใส่ข้อความของงานด้วย' };
    await tasks.add({
      text,
      done: false,
      createdBy: ctx.uid,
      createdAt: FieldValue.serverTimestamp(),
      source: 'discord',
    });
    // Return the whole clickable list rather than a bare confirmation: it
    // shows the new task in context and is immediately actionable.
    return todoView(ctx.chatId);
  }

  if (sub === 'done' || sub === 'reopen') {
    const wanted = sub === 'done';
    const snap = await tasks.get();
    const match = findTask(snap, opts.task);
    if (!match) return { content: 'ไม่พบงานนั้น — ลอง `/todo list` เพื่อดูรายการ' };
    // Read the text before the write — never assume a snapshot is still
    // readable after its document has been touched.
    await match.ref.update({ done: wanted, updatedAt: FieldValue.serverTimestamp() });
    return todoView(ctx.chatId);
  }

  if (sub === 'edit') {
    const snap = await tasks.orderBy('createdAt', 'asc').get();
    if (snap.empty) return { content: 'ยังไม่มีงานให้แก้ไข — เพิ่มด้วย `/todo add`' };

    // No text given — show the list to pick from rather than making them
    // remember and retype what they wrote.
    if (!String(opts.task || '').trim()) {
      return pickerView('todo', snap.docs.map(d => ({
        id: d.id,
        label: `${d.data().done ? '☑' : '☐'} ${d.data().text || ''}`,
      })), { title: 'เลือกงานที่ต้องการแก้ไข', action: 'edit', multi: false });
    }

    const match = findTask(snap, opts.task);
    if (!match) return { content: 'ไม่พบงานนั้น — ลอง `/todo edit` เพื่อเลือกจากลิสต์' };
    return { modal: todoEditModal(match) };
  }

  if (sub === 'remove') {
    const snap = await tasks.orderBy('createdAt', 'asc').get();
    if (snap.empty) return { content: 'ยังไม่มีงานให้ลบ' };

    // No text given — show the picker rather than making them type a name.
    if (!String(opts.task || '').trim()) {
      return pickerView('todo', snap.docs.map(d => ({
        id: d.id,
        label: `${d.data().done ? '☑' : '☐'} ${d.data().text || ''}`,
      })), { title: 'เลือกงานที่ต้องการลบ' });
    }

    const match = findTask(snap, opts.task);
    if (!match) return { content: 'ไม่พบงานนั้น' };
    const text = String(match.data().text || '');
    await match.ref.delete();
    const view = await todoView(ctx.chatId);
    view.content = `ลบแล้ว: ~~${escapeMd(text)}~~\n` + (view.content || '');
    return view;
  }

  // list (default)
  return todoView(ctx.chatId);
}

/**
 * The planner rendered as clickable buttons — one per task, click to toggle.
 *
 * Shared by `/todo list` and by the button handler, so a toggle re-renders
 * through exactly the same code path and can't drift from the original view.
 *
 * Discord's hard limits shape this: 5 action rows per message, 5 buttons per
 * row — 25 total. Anything past that falls back to a plain text list, which
 * is why the embed below still exists.
 */
const BUTTON_LIMIT = 25;

async function todoView(chatId) {
  const tasks = A.db().collection('chats').doc(chatId).collection('tasks');
  const snap = await tasks.orderBy('createdAt', 'asc').limit(50).get();
  if (snap.empty) return { content: 'ยังไม่มีงานในแชทนี้ — เพิ่มด้วย `/todo add`', components: [] };

  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const open = rows.filter(r => !r.done);

  const header = `**Planner · ${open.length} ค้าง / ${rows.length} ทั้งหมด**`;

  const clickable = rows.slice(0, BUTTON_LIMIT);
  const components = [];
  for (let i = 0; i < clickable.length; i += 5) {
    components.push({
      type: 1,                                  // action row
      components: clickable.slice(i, i + 5).map(r => ({
        type: 2,                                // button
        // 3 = success (green) for done, 2 = secondary (grey) for open. Style
        // is a hint, not the signal — the ☑/☐ carries it for anyone who can't
        // distinguish the colours.
        style: r.done ? 3 : 2,
        // Labels cap at 80 chars; the box costs two.
        label: `${r.done ? '☑' : '☐'} ${truncate(String(r.text || ''), 76)}`,
        custom_id: `todo:${r.id}`,              // caps at 100 chars, ids are ~20
      })),
    });
  }

  const payload = { content: header, components };

  if (rows.length > BUTTON_LIMIT) {
    const names = await A.namesForUids(rows.slice(BUTTON_LIMIT).map(r => r.createdBy));
    payload.embeds = [{
      title: `อีก ${rows.length - BUTTON_LIMIT} งาน (กดไม่ได้ — ใช้ /todo done)`,
      description: truncate(rows.slice(BUTTON_LIMIT).map(r =>
        `${r.done ? '☑' : '☐'} ${escapeMd(r.text || '')}`
        + `${r.createdBy && names[r.createdBy] ? ` · ${names[r.createdBy]}` : ''}`
      ).join('\n'), 3800),
      color: D.COLOR_MUTED,
    }];
  }
  return payload;
}

/**
 * A button press. Returns { mode, payload }:
 *   'update'    — rewrite the planner message in place
 *   'ephemeral' — a private error, leaving the shared message untouched
 *
 * Anyone in the channel can click, so the same membership check the slash
 * commands run applies here too. A button is not an authorisation.
 */
async function handleComponent(interaction, customId) {
  const [kind, id] = String(customId || '').split(':');

  if (kind === 'cancel') {
    return { mode: 'update', payload: { content: 'ยกเลิกแล้ว', components: [] } };
  }

  // Multi-select pickers and their confirm buttons carry no id of their own —
  // the selection lives in discordPending.
  const PICKERS = {
    projdel_pick:  ['proj',  'pick'], projdel_go:  ['proj',  'go'],
    tododel_pick:  ['todo',  'pick'], tododel_go:  ['todo',  'go'],
    scheddel_pick: ['sched', 'pick'], scheddel_go: ['sched', 'go'],
  };
  if (PICKERS[customId]) {
    const [k, step] = PICKERS[customId];
    const c = await A.resolveContext(interaction);
    if (c.error) return { mode: 'ephemeral', payload: { content: c.error } };
    return step === 'pick'
      ? handlePick(interaction, k, c)
      : handleConfirmedDelete(interaction, k, c);
  }

  // Edit pickers need no pending state: the chosen id rides in the modal's
  // custom_id, and the modal *is* the next step.
  const EDIT_PICKERS = { projedit_pick: 'proj', todoedit_pick: 'todo', schededit_pick: 'sched' };
  if (EDIT_PICKERS[customId]) {
    const c = await A.resolveContext(interaction);
    if (c.error) return { mode: 'ephemeral', payload: { content: c.error } };
    return handleEditPick(interaction, EDIT_PICKERS[customId], c);
  }

  if (!['todo', 'projdel'].includes(kind) || !id) {
    return { mode: 'ephemeral', payload: { content: 'ปุ่มนี้ใช้ไม่ได้แล้ว' } };
  }

  const ctx = await A.resolveContext(interaction);
  if (ctx.error) return { mode: 'ephemeral', payload: { content: ctx.error } };

  if (kind === 'projdel') {
    const ref = A.db().collection('chats').doc(ctx.chatId).collection('projects').doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      return { mode: 'update', payload: { content: 'โปรเจกต์นี้ถูกลบไปแล้ว', components: [] } };
    }
    const data = doc.data();                   // read before the delete
    const title = String(data.title || '');
    await ref.delete();
    const also = await unlinkOnDelete(ctx.chatId, 'proj', data);
    return {
      mode: 'update',
      payload: { content: `ลบแล้ว: ~~${escapeMd(title)}~~${also}`, components: [] },
    };
  }

  const ref = A.db().collection('chats').doc(ctx.chatId).collection('tasks').doc(id);
  const doc = await ref.get();
  if (!doc.exists) {
    // Deleted by someone else since the message was drawn — re-render rather
    // than error, so the stale button disappears.
    return { mode: 'update', payload: await todoView(ctx.chatId) };
  }

  await ref.update({
    done: !doc.data().done,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: ctx.uid,
  });
  return { mode: 'update', payload: await todoView(ctx.chatId) };
}

// Tasks have generated ids, so accept either the id or a case-insensitive
// substring of the text — typing the id is not something a human will do.
function findTask(snap, needle) {
  const q = String(needle || '').trim().toLowerCase();
  if (!q) return null;
  return snap.docs.find(d => d.id === needle)
      || snap.docs.find(d => String(d.data().text || '').toLowerCase() === q)
      || snap.docs.find(d => String(d.data().text || '').toLowerCase().includes(q))
      || null;
}

/* --------------------------------------------------------------- /project */

async function handleProject(interaction, { sub, opts }) {
  const ctx = await A.resolveContext(interaction);
  if (ctx.error) return { content: ctx.error };
  const col = A.db().collection('chats').doc(ctx.chatId).collection('projects');

  if (sub === 'new') {
    const title = String(opts.title || '').trim();
    if (!title) return { content: 'ใส่ชื่อโปรเจกต์ด้วย' };

    // A deadline is a date the whole chat has to see, so it becomes a real
    // /schedule entry rather than a string buried in the project card.
    // Reject a bad date before writing anything — a project created with the
    // deadline silently dropped is the worse outcome.
    const hasDeadline = String(opts.deadline || '').trim() !== '';
    const at = hasDeadline ? parseWhen(opts.deadline) : null;
    if (hasDeadline && at === null) return { content: `อ่านเดดไลน์ไม่ออก — ${WHEN_HELP}` };

    // Id shape matches the web app's so both clients stay interchangeable.
    const id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const emoji = String(opts.emoji || '📁');
    const desc = String(opts.desc || '');
    const scheduleId = at === null ? null : 'sc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    if (scheduleId) {
      await A.db().collection('chats').doc(ctx.chatId).collection('schedule').doc(scheduleId).set({
        id: scheduleId,
        title,
        at,
        note: desc,
        emoji,
        projectId: id,          // the link /schedule reads back
        createdBy: ctx.uid,
        createdAt: FieldValue.serverTimestamp(),
        source: 'discord',
      });
    }

    await col.doc(id).set({
      id,
      title,
      desc,
      emoji,
      category: 'general',
      status: 'active',
      postedBy: 'Discord',
      postedByUid: ctx.uid,
      date: new Date().toISOString().slice(0, 10),
      deadline: at,             // ms, or null — mirrors the schedule entry
      scheduleId,
      link: '',
      allowedRoles: [],
      attachments: [],
      comments: [],
      source: 'discord',
    });

    if (at === null) return { content: `สร้างโปรเจกต์แล้ว: **${escapeMd(title)}**` };
    const late = at < Date.now() ? '\n⚠️ เดดไลน์นี้ผ่านไปแล้ว' : '';
    return {
      content: `สร้างโปรเจกต์แล้ว: **${escapeMd(title)}**\n`
        + `⏰ เดดไลน์ ${discordTime(at, 'F')} · เหลืออีก ${discordTime(at, 'R')}${late}\n`
        + '_เพิ่มลง `/schedule` ให้แล้ว_',
    };
  }

  const snap = await col.limit(50).get();
  if (snap.empty) return { content: 'ยังไม่มีโปรเจกต์ในแชทนี้ — สร้างด้วย `/project new`' };

  const rows = snap.docs.map(d => d.data())
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  if (sub === 'edit') {
    const q = String(opts.project || '').trim().toLowerCase();
    const matches = q ? rows.filter(r => String(r.title || '').toLowerCase().includes(q)) : rows;
    if (!matches.length) return { content: 'ไม่พบโปรเจกต์นั้น — ลอง `/project edit` เพื่อเลือกจากลิสต์' };

    // Ambiguity resolves into a picker rather than an error: unlike a delete,
    // there is nothing dangerous about showing the candidates and letting them
    // point at one.
    if (matches.length > 1) {
      return pickerView('proj', matches.map(p => ({
        id: p.id,
        label: `${p.emoji || '📁'} ${p.title || ''}`,
        description: p.desc || undefined,
      })), { title: 'เลือกโปรเจกต์ที่ต้องการแก้ไข', action: 'edit', multi: false });
    }
    return { modal: projectEditModal(matches[0]) };
  }

  if (sub === 'remove') {
    // No name given — show the picker rather than making them type a name.
    if (!String(opts.project || '').trim()) {
      return pickerView('proj', rows.map(p => ({
        id: p.id,
        label: `${p.emoji || '📁'} ${p.title || ''}`,
        description: p.desc || undefined,
      })), { title: 'เลือกโปรเจกต์ที่ต้องการลบ' });
    }

    const q = String(opts.project || '').toLowerCase();
    const matches = rows.filter(r => String(r.title || '').toLowerCase().includes(q));
    if (!matches.length) return { content: 'ไม่พบโปรเจกต์นั้น — ลอง `/project list`' };
    if (matches.length > 1) {
      // Deleting the wrong project because a substring matched two is not a
      // mistake worth allowing; make them disambiguate.
      return {
        content: 'พบหลายโปรเจกต์ที่ตรงกัน — ระบุให้ชัดเจนขึ้น:\n'
          + matches.slice(0, 10).map(p => `• ${escapeMd(p.title || '')}`).join('\n'),
      };
    }

    const p = matches[0];
    const counts = [
      (p.comments || []).length ? `${(p.comments || []).length} ความเห็น` : null,
      (p.attachments || []).length ? `${(p.attachments || []).length} ไฟล์แนบ` : null,
    ].filter(Boolean).join(' · ');

    // Confirm rather than delete outright: this is irreversible, it takes the
    // comments and attachment records with it, and it removes the project for
    // everyone in the chat — not just the person who typed the command.
    return {
      content: `⚠️ ลบโปรเจกต์ **${escapeMd(p.title || '')}**?`
        + (counts ? `\nจะลบ ${counts} ไปด้วย` : '')
        + '\nการลบนี้ย้อนกลับไม่ได้ และมีผลกับทุกคนในแชท',
      components: [{
        type: 1,
        components: [
          { type: 2, style: 4, label: 'ลบเลย', custom_id: `projdel:${p.id}` },
          { type: 2, style: 2, label: 'ยกเลิก', custom_id: 'cancel' },
        ],
      }],
    };
  }

  if (sub === 'show') {
    const q = String(opts.project || '').toLowerCase();
    const p = rows.find(r => String(r.title || '').toLowerCase().includes(q));
    if (!p) return { content: 'ไม่พบโปรเจกต์นั้น' };
    const fields = [];
    if (p.status) fields.push({ name: 'สถานะ', value: String(p.status), inline: true });
    if (p.date) fields.push({ name: 'วันที่', value: String(p.date), inline: true });
    if (p.deadline) {
      fields.push({
        name: 'เดดไลน์',
        value: `${discordTime(p.deadline, 'F')}\nเหลืออีก ${discordTime(p.deadline, 'R')}`,
      });
    }
    if (Array.isArray(p.attachments) && p.attachments.length) {
      fields.push({
        name: `ไฟล์แนบ (${p.attachments.length})`,
        // Only metadata syncs to Firestore — the bytes are still on whichever
        // device uploaded them, so linking here would 404.
        value: truncate(p.attachments.map(a => `• ${escapeMd(a.name || 'file')}`).join('\n'), 900),
      });
    }
    return {
      embeds: [{
        title: `${p.emoji || '📁'} ${p.title || 'Untitled'}`,
        description: truncate(String(p.desc || '—'), 2000),
        color: D.COLOR_ACCENT,
        fields,
        footer: { text: `${(p.comments || []).length} ความเห็น` },
      }],
    };
  }

  // list (default)
  return {
    embeds: [{
      title: `Projects · ${rows.length}`,
      description: truncate(rows.map(p =>
        `${p.emoji || '📁'} **${escapeMd(p.title || 'Untitled')}**`
        + (p.status && p.status !== 'active' ? ` _(${p.status})_` : '')
        // Live countdown, same widget /schedule uses — one glance tells you
        // which project is about to run out of time.
        + (p.deadline ? `\n⏰ ${discordTime(p.deadline, 'R')} · ${discordTime(p.deadline, 'F')}` : '')
      ).join('\n'), 3800),
      color: D.COLOR_ACCENT,
    }],
  };
}

/* ------------------------------------------------------------------ /poll */

async function handlePoll(interaction, { sub, opts }) {
  const ctx = await A.resolveContext(interaction);
  if (ctx.error) return { content: ctx.error };
  const col = A.db().collection('chats').doc(ctx.chatId).collection('polls');

  if (sub === 'new') {
    const question = String(opts.question || '').trim();
    const options = [opts.option1, opts.option2, opts.option3, opts.option4]
      .map(o => String(o || '').trim()).filter(Boolean);
    if (!question || options.length < 2) return { content: 'ต้องมีคำถามและอย่างน้อย 2 ตัวเลือก' };

    const id = 'pl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const poll = {
      id,
      question,
      multi: !!opts.multi,
      anon: !!opts.anon,
      createdBy: ctx.uid,
      createdAt: new Date().toISOString(),
      options: options.map(text => ({ text, voters: [] })),
      source: 'discord',
    };
    await col.doc(id).set(poll);
    // Mirror into the thread so the poll shows up in the Arthid app too.
    await A.db().collection('chats').doc(ctx.chatId).collection('messages').add({
      kind: 'poll',
      pollId: id,
      senderUid: ctx.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    return renderPoll(poll, {});
  }

  if (sub === 'vote') {
    const snap = await col.get();
    const q = String(opts.poll || '').toLowerCase();
    const doc = snap.docs.find(d => String(d.data().question || '').toLowerCase().includes(q));
    if (!doc) return { content: 'ไม่พบโพลนั้น — ลอง `/poll list`' };

    const poll = doc.data();
    const idx = Number(opts.choice) - 1;
    if (!poll.options[idx]) return { content: 'ตัวเลือกไม่ถูกต้อง' };

    // Same toggle semantics as the app: multi adds/removes, single replaces.
    const me = ctx.uid;
    const already = poll.options[idx].voters.includes(me);
    if (poll.multi) {
      poll.options[idx].voters = already
        ? poll.options[idx].voters.filter(v => v !== me)
        : [...poll.options[idx].voters, me];
    } else {
      poll.options.forEach(o => { o.voters = o.voters.filter(v => v !== me); });
      if (!already) poll.options[idx].voters.push(me);
    }
    await doc.ref.update({ options: poll.options });
    const names = poll.anon ? {} : await A.namesForUids(poll.options.flatMap(o => o.voters));
    return renderPoll(poll, names);
  }

  // list (default)
  const snap = await col.limit(25).get();
  if (snap.empty) return { content: 'ยังไม่มีโพลในแชทนี้ — สร้างด้วย `/poll new`' };
  return {
    embeds: [{
      title: `Polls · ${snap.size}`,
      description: truncate(snap.docs.map(d => {
        const p = d.data();
        const total = p.options.reduce((s, o) => s + o.voters.length, 0);
        return `📊 **${escapeMd(p.question || '')}** — ${total} โหวต`;
      }).join('\n'), 3800),
      color: D.COLOR_ACCENT,
    }],
  };
}

function renderPoll(poll, names) {
  const total = poll.options.reduce((s, o) => s + o.voters.length, 0);
  const lines = poll.options.map((o, i) => {
    const pct = total ? Math.round((o.voters.length / total) * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 10)).padEnd(10, '░');
    const who = poll.anon || !o.voters.length
      ? ''
      : ` · ${o.voters.map(v => names[v] || v.slice(0, 6)).join(', ')}`;
    return `\`${i + 1}\` ${bar} ${String(pct).padStart(3)}%  ${escapeMd(o.text)}${who}`;
  });
  return {
    embeds: [{
      title: `📊 ${poll.question}`,
      description: lines.join('\n'),
      color: D.COLOR_ACCENT,
      footer: {
        text: `${total} โหวต · ${poll.multi ? 'เลือกได้หลายข้อ' : 'เลือกได้ข้อเดียว'}`
            + `${poll.anon ? ' · ไม่ระบุชื่อ' : ''} · โหวตด้วย /poll vote`,
      },
    }],
  };
}

/* -------------------------------------------------------------- /schedule */

// Asia/Bangkok is UTC+7 year-round — Thailand has never observed DST — so a
// fixed offset is correct here, not a shortcut. Anywhere with DST would need
// a real tz database.
const TZ_OFFSET_MIN = 7 * 60;

// Thai users routinely write Buddhist-era years (2569 = 2026 CE), and the
// screenshots from this project do exactly that. Anything past 2400 can only
// be BE in practice.
const BE_OFFSET = 543;

/**
 * The one date shape shown to users, everywhere: slash-option descriptions,
 * modal placeholders, autocomplete rows and every prefill.
 *
 * Day-first, because that is how Thai dates are written and because the box
 * has to teach the order — `03/04` is unreadable unless the template says
 * which half is the day.
 */
const WHEN_TEMPLATE = 'DD/MM/YYYY HH:mm';

// Placeholder text sits *inside* an empty modal box. Template first so the
// shape is what the eye lands on, then a real date so it is unambiguous.
// Discord caps a placeholder at 100 characters.
const WHEN_PLACEHOLDER = `${WHEN_TEMPLATE} — เช่น 20/08/2569 14:00`;

/**
 * Parse a human-typed date into epoch milliseconds.
 *
 * The template asks for `DD/MM/YYYY HH:mm`, but people paste from calendars
 * and phones, so `/`, `-` and `.` all separate a date, `:` and `.` a time,
 * and a leading 4-digit group means the ISO order instead. Year may be
 * Buddhist or Common Era. Returns null rather than guessing — a schedule that
 * silently lands on the wrong day is worse than a rejected input.
 */
function parseWhen(input) {
  // Normalise separators before matching, so the regexes stay readable and
  // every accepted spelling goes through exactly one code path.
  const s = String(input || '').trim()
    .replace(/\s*น\.?$/, '')         // "14:00 น." — the Thai way to write a time
    .replace(/[.\-]/g, '/')          // 20.08.2569 · 20-08-2569 -> 20/08/2569
    .replace(/\s+/g, ' ')
    .trim();
  let y, mo, d, hh, mm;

  // A time typed as 14/00 is the dot rule misfiring on 14.00 — put it back.
  const timeFixed = s.replace(/ (\d{1,2})\/(\d{2})$/, ' $1:$2');

  let m = timeFixed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) { [, y, mo, d, hh, mm] = m; }
  else {
    m = timeFixed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ](\d{1,2}):(\d{2}))?$/);
    if (!m) return null;
    [, d, mo, y, hh, mm] = m;
  }

  y = Number(y); mo = Number(mo); d = Number(d);
  hh = hh === undefined ? 9 : Number(hh);      // no time given → 09:00 local
  mm = mm === undefined ? 0 : Number(mm);
  if (y > 2400) y -= BE_OFFSET;

  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return null;

  const ms = Date.UTC(y, mo - 1, d, hh, mm) - TZ_OFFSET_MIN * 60000;
  // Date.UTC rolls impossible dates over (Feb 30 -> Mar 2); reject instead.
  const back = new Date(ms + TZ_OFFSET_MIN * 60000);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    return null;
  }
  return ms;
}

// Discord renders <t:SECONDS:R> as a live relative time ("in 3 days") in each
// viewer's own timezone, and keeps it current without the message being
// re-sent. Far better than baking a countdown into text that goes stale the
// moment it is posted.
function discordTime(ms, style) {
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

/**
 * The inverse of parseWhen: epoch ms -> the template shape, Bangkok time.
 *
 * Used wherever a date has to go back in front of the user as *text* they can
 * edit — modal prefills, autocomplete rows and select-menu descriptions.
 * Discord's <t:…> widget is better everywhere else, but it is not something
 * you can type over, and text the user reads must match the shape the boxes
 * ask them to type.
 */
function formatWhen(ms) {
  if (!ms && ms !== 0) return '';
  const iso = new Date(ms + TZ_OFFSET_MIN * 60000).toISOString();
  const [date, time] = iso.slice(0, 16).split('T');
  const [y, mo, d] = date.split('-');
  return `${d}/${mo}/${y} ${time}`;
}

/** Bangkok-local midnight of the day `ms` falls in, as epoch ms. */
function startOfDay(ms) {
  const local = ms + TZ_OFFSET_MIN * 60000;
  return local - (local % 86400000) - TZ_OFFSET_MIN * 60000;
}

/**
 * Rows shown under a date box while it is being typed.
 *
 * A slash option has no placeholder — the only way to put the template where
 * the cursor is, is to answer autocomplete with it. So the first row is always
 * the template itself, either as a live echo of what the user typed ("✅ this
 * is what I understood") or as the shape to copy when the box is empty.
 *
 * Every `value` is a full, valid, parseable date, so picking any row can never
 * produce something parseWhen then rejects.
 */
function whenSuggestions(input, now = Date.now()) {
  const raw = String(input || '').trim();
  const rows = [];
  const at = raw ? parseWhen(raw) : null;

  if (at !== null) {
    // Understood it — show it back in full so a typo in the year or a
    // day/month swap is visible before they hit enter.
    rows.push({ name: `✅ ${formatWhen(at)} · ${thaiLong(at)}`, value: formatWhen(at) });
  } else if (raw) {
    // Partial input: complete it into whole dates rather than rejecting.
    // "20" -> the 20th of this month and next; "20/8" -> this year and next.
    rows.push({ name: `⌨️ พิมพ์ตามรูปแบบ ${WHEN_TEMPLATE}`, value: formatWhen(startOfDay(now) + 9 * 3600000) });
    completions(raw, now).forEach(ms => {
      rows.push({ name: `${formatWhen(ms)} · ${thaiLong(ms)}`, value: formatWhen(ms) });
    });
  }

  // Quick picks fill the rest. 09:00 matches parseWhen's own default for a
  // date typed without a time, so the two never disagree.
  const day = startOfDay(now) + 9 * 3600000;
  const quick = [
    ['วันนี้', day],
    ['พรุ่งนี้', day + 86400000],
    ['มะรืนนี้', day + 2 * 86400000],
    ['สัปดาห์หน้า', day + 7 * 86400000],
    ['เดือนหน้า', day + 30 * 86400000],
  ];
  for (const [label, ms] of quick) {
    if (rows.length >= 25) break;
    const value = formatWhen(ms);
    if (rows.some(r => r.value === value)) continue;
    rows.push({ name: `${label} · ${value}`, value });
  }
  return rows.slice(0, 25);
}

/**
 * Turn a half-typed date into whole ones.
 *
 * Only fills in what is missing from the right — day, then month, then year —
 * and never reorders what was typed, so a suggestion always contains the
 * user's own digits in the positions they put them.
 */
function completions(raw, now) {
  const parts = raw.split(/[^\d]+/).filter(Boolean).map(Number);
  if (!parts.length || parts.length > 3) return [];
  const here = new Date(now + TZ_OFFSET_MIN * 60000);
  const thisMonth = here.getUTCMonth() + 1, thisYear = here.getUTCFullYear();

  const [d, mo, y] = parts;
  if (d < 1 || d > 31) return [];

  const tries = parts.length === 1
    ? [[d, thisMonth, thisYear], [d, thisMonth === 12 ? 1 : thisMonth + 1, thisMonth === 12 ? thisYear + 1 : thisYear]]
    : parts.length === 2
      ? [[d, mo, thisYear], [d, mo, thisYear + 1]]
      : [[d, mo, y > 2400 ? y - BE_OFFSET : y]];

  return tries
    .map(([dd, mm, yy]) => parseWhen(`${dd}/${mm}/${yy} 09:00`))
    .filter(ms => ms !== null);
}

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                     'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const THAI_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

/** "พฤ. 20 ส.ค. 2569" — reading it back in words is how a wrong date is spotted. */
function thaiLong(ms) {
  const t = new Date(ms + TZ_OFFSET_MIN * 60000);
  return `${THAI_DAYS[t.getUTCDay()]} ${t.getUTCDate()} ${THAI_MONTHS[t.getUTCMonth()]} `
    + `${t.getUTCFullYear() + BE_OFFSET}`;
}

async function scheduleView(chatId) {
  const snap = await A.db().collection('chats').doc(chatId).collection('schedule').get();
  if (snap.empty) {
    return { content: 'ยังไม่มีกำหนดการ — เพิ่มด้วย `/schedule add`', components: [] };
  }
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.at || 0) - (b.at || 0));

  const now = Date.now();
  const upcoming = rows.filter(r => (r.at || 0) >= now);
  const past = rows.filter(r => (r.at || 0) < now);

  // Entries born from a project deadline are marked, so it is obvious why
  // they exist and that deleting one changes the project.
  const line = r => `${r.projectId ? `${r.emoji || '📁'} ` : ''}**${escapeMd(r.title || '')}**`
    + (r.projectId ? ' _(เดดไลน์โปรเจกต์)_' : '')
    + `\n${discordTime(r.at, 'F')} · ${discordTime(r.at, 'R')}`
    + (r.note ? `\n${escapeMd(r.note)}` : '');

  const parts = [];
  if (upcoming.length) parts.push('__ที่กำลังจะถึง__\n' + upcoming.map(line).join('\n\n'));
  if (past.length) parts.push('__ผ่านไปแล้ว__\n' + past.map(r => `~~${escapeMd(r.title || '')}~~ · ${discordTime(r.at, 'R')}`).join('\n'));

  return {
    embeds: [{
      title: `กำหนดการ · ${upcoming.length} รายการที่ยังไม่ถึง`,
      description: truncate(parts.join('\n\n'), 3800),
      color: upcoming.length ? D.COLOR_ACCENT : D.COLOR_MUTED,
    }],
    components: [],
  };
}

const WHEN_HELP = `กรอกตามรูปแบบ \`${WHEN_TEMPLATE}\` เช่น \`20/08/2569 14:00\` `
  + '(ไม่ใส่เวลา = 09:00, เวลาไทย, ใส่ปี พ.ศ. หรือ ค.ศ. ก็ได้)';

/**
 * Every date box in the bot, in one place, so a new one cannot be added
 * without deciding whether it belongs here. Keyed by command → subcommand →
 * option names that hold a date.
 */
const DATE_OPTIONS = {
  schedule: { add: ['when'], edit: ['when'] },
  project: { new: ['deadline'] },
};

/**
 * Suggestions for a date box, as the user types in it.
 *
 * Pure computation on purpose: autocomplete gets the same hard 3-second
 * window as everything else and fires on *every keystroke*, so it must never
 * touch Firestore.
 */
function handleAutocomplete(interaction) {
  const { sub, name, value } = D.readFocused(interaction.data || {});
  const fields = (DATE_OPTIONS[interaction.data?.name] || {})[sub] || [];
  if (!name || !fields.includes(name)) return [];
  return whenSuggestions(value);
}

async function handleSchedule(interaction, { sub, opts }) {
  const ctx = await A.resolveContext(interaction);
  if (ctx.error) return { content: ctx.error };
  const col = A.db().collection('chats').doc(ctx.chatId).collection('schedule');

  if (sub === 'add') {
    const title = String(opts.title || '').trim();

    // Nothing typed for the date — open the form, where the box can carry the
    // template as its placeholder and a working default as its value. A slash
    // option cannot show either; this is the only place Discord lets us put
    // the shape where the cursor already is.
    if (!String(opts.when || '').trim()) {
      return { modal: scheduleAddModal({ title, note: opts.note }) };
    }

    const at = parseWhen(opts.when);
    if (!title) return { content: 'ใส่ชื่อกำหนดการด้วย' };
    if (at === null) return { content: `อ่านวันที่ไม่ออก — ${WHEN_HELP}` };

    const id = 'sc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    await col.doc(id).set({
      id, title, at,
      note: String(opts.note || ''),
      createdBy: ctx.uid,
      createdAt: FieldValue.serverTimestamp(),
      source: 'discord',
    });
    const late = at < Date.now() ? '\n⚠️ เวลานี้ผ่านไปแล้ว' : '';
    return {
      content: `เพิ่มกำหนดการ **${escapeMd(title)}**\n`
        + `${discordTime(at, 'F')} · เหลืออีก ${discordTime(at, 'R')}${late}`,
    };
  }

  if (sub === 'edit') {
    const snap = await col.get();
    if (snap.empty) return { content: 'ยังไม่มีกำหนดการให้แก้' };

    const q = String(opts.event || '').trim().toLowerCase();
    const matches = q
      ? snap.docs.filter(d => String(d.data().title || '').toLowerCase().includes(q))
      : snap.docs;
    if (!matches.length) return { content: 'ไม่พบกำหนดการนั้น — ลอง `/schedule list`' };

    // Supplying any of the fields inline means "change exactly this" and skips
    // the modal — a one-field reschedule is faster typed than clicked.
    const inline = ['when', 'title', 'note'].some(k => opts[k] !== undefined);

    if (matches.length > 1) {
      if (!inline) {
        return pickerView('sched', matches.map(d => ({
          id: d.id,
          label: (d.data().projectId ? `${d.data().emoji || '📁'} ` : '') + (d.data().title || ''),
          description: formatWhen(d.data().at)
            + (d.data().projectId ? ' · เดดไลน์โปรเจกต์' : ''),
        })), { title: 'เลือกกำหนดการที่ต้องการแก้ไข', action: 'edit', multi: false });
      }
      return {
        content: 'พบหลายรายการที่ตรงกัน — ระบุให้ชัดเจนขึ้น:\n'
          + matches.slice(0, 10).map(d => `• ${escapeMd(d.data().title || '')}`).join('\n'),
      };
    }

    // Named one event but said nothing about what to change — open it
    // prefilled instead of scolding them for an incomplete command.
    if (!inline) return { modal: scheduleEditModal(matches[0]) };

    const patch = {};
    if (String(opts.title || '').trim()) patch.title = String(opts.title).trim();
    if (opts.note !== undefined) patch.note = String(opts.note || '');
    if (String(opts.when || '').trim()) {
      const at = parseWhen(opts.when);
      if (at === null) return { content: `อ่านวันที่ไม่ออก — ${WHEN_HELP}` };
      patch.at = at;
    }
    if (!Object.keys(patch).length) {
      return { content: 'ระบุสิ่งที่ต้องการแก้ด้วย — `when`, `title` หรือ `note`' };
    }

    return applyScheduleEdit(ctx.chatId, matches[0], patch, ctx.uid);
  }

  if (sub === 'remove') {
    const snap = await col.get();
    if (snap.empty) return { content: 'ยังไม่มีกำหนดการให้ลบ' };
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.at || 0) - (b.at || 0));
    return pickerView('sched', rows.map(r => ({
      id: r.id,
      label: (r.projectId ? `${r.emoji || '📁'} ` : '') + (r.title || ''),
      description: formatWhen(r.at) + (r.projectId ? ' · เดดไลน์โปรเจกต์' : ''),
    })), { title: 'เลือกกำหนดการที่ต้องการลบ' });
  }

  return scheduleView(ctx.chatId);
}

/* ------------------------------------------------------- pick-then-delete */

// Discord caps a select menu at 25 options.
const SELECT_LIMIT = 25;

/**
 * A select picker, so nobody has to type a name to act on something.
 *
 * `kind` is 'proj', 'todo' or 'sched' and `action` is 'del' or 'edit'; the two
 * form the custom_id that routes the selection to a handler. Values are
 * document ids, which keeps the selection unambiguous even when two items
 * share a title.
 *
 * Deleting is multi-select — tidying up is naturally a batch job. Editing is
 * single-select, because each edit opens its own prefilled modal and Discord
 * only lets one modal be open at a time.
 */
function pickerView(kind, items, { title, action = 'del', multi = true }) {
  if (!items.length) {
    return { content: action === 'edit' ? 'ไม่มีอะไรให้แก้ไข' : 'ไม่มีอะไรให้ลบ', components: [] };
  }
  const shown = items.slice(0, SELECT_LIMIT);
  return {
    content: title + (items.length > SELECT_LIMIT
      ? `\n_(แสดง ${SELECT_LIMIT} รายการแรกจาก ${items.length})_` : ''),
    components: [{
      type: 1,
      components: [{
        type: 3,                                  // string select
        custom_id: `${kind}${action}_pick`,
        placeholder: multi ? 'เลือกได้มากกว่า 1 รายการ' : 'เลือก 1 รายการ',
        min_values: 1,
        max_values: multi ? shown.length : 1,     // multi-select up to everything shown
        options: shown.map(it => ({
          label: truncate(String(it.label || '(ไม่มีชื่อ)'), 100),
          value: it.id,
          description: it.description ? truncate(String(it.description), 100) : undefined,
        })),
      }],
    }],
  };
}

/**
 * Selections are parked in Firestore between the picker and the confirm.
 *
 * The alternative is packing ids into the confirm button's custom_id, which
 * Discord caps at 100 characters — barely three project ids. Keyed by Discord
 * user so two people deleting at once in the same channel can't collide.
 */
async function savePending(discordUserId, data) {
  await A.db().collection('discordPending').doc(discordUserId).set({
    ...data,
    at: FieldValue.serverTimestamp(),
  });
}

async function readPending(discordUserId) {
  const snap = await A.db().collection('discordPending').doc(discordUserId).get();
  return snap.exists ? snap.data() : null;
}

// Which subcollection each picker kind lives in, and which field names it.
const PICK_TARGET = {
  proj:  { col: 'projects', label: 'title' },
  todo:  { col: 'tasks',    label: 'text'  },
  sched: { col: 'schedule', label: 'title' },
};

/** Turn a selection into a confirmation screen. */
async function handlePick(interaction, kind, ctx) {
  const ids = interaction.data.values || [];
  if (!ids.length) {
    return { mode: 'update', payload: { content: 'ไม่ได้เลือกอะไร', components: [] } };
  }

  const t = PICK_TARGET[kind];
  const docs = await Promise.all(ids.map(id =>
    A.db().collection('chats').doc(ctx.chatId).collection(t.col).doc(id).get()));
  const live = docs.filter(d => d.exists);
  if (!live.length) {
    return { mode: 'update', payload: { content: 'รายการที่เลือกถูกลบไปแล้ว', components: [] } };
  }

  const names = live.map(d => d.data()[t.label] || '(ไม่มีชื่อ)');
  const discordUserId = (interaction.member?.user || interaction.user)?.id;
  await savePending(discordUserId, { kind, chatId: ctx.chatId, ids: live.map(d => d.id) });

  // Projects carry comments and attachment records; say so before deleting.
  let extra = '';
  if (kind === 'proj') {
    const comments = live.reduce((n, d) => n + (d.data().comments || []).length, 0);
    if (comments) extra = `\nจะลบ ${comments} ความเห็นไปด้วย`;
  }

  return {
    mode: 'update',
    payload: {
      content: `⚠️ ลบ ${live.length} รายการ?\n`
        + names.map(n => `• ${escapeMd(n)}`).join('\n')
        + extra
        + '\nการลบนี้ย้อนกลับไม่ได้ และมีผลกับทุกคนในแชท',
      components: [{
        type: 1,
        components: [
          { type: 2, style: 4, label: `ลบ ${live.length} รายการ`, custom_id: `${kind}del_go` },
          { type: 2, style: 2, label: 'ยกเลิก', custom_id: 'cancel' },
        ],
      }],
    },
  };
}

/** Turn an edit-picker selection into a prefilled modal. */
async function handleEditPick(interaction, kind, ctx) {
  const id = (interaction.data.values || [])[0];
  if (!id) {
    return { mode: 'update', payload: { content: 'ไม่ได้เลือกอะไร', components: [] } };
  }

  const t = PICK_TARGET[kind];
  const doc = await A.db().collection('chats').doc(ctx.chatId).collection(t.col).doc(id).get();
  if (!doc.exists) {
    return { mode: 'update', payload: { content: 'รายการที่เลือกถูกลบไปแล้ว', components: [] } };
  }

  const modal = kind === 'proj' ? projectEditModal({ ...doc.data(), id: doc.id })
    : kind === 'todo' ? todoEditModal(doc)
    : scheduleEditModal(doc);
  return { mode: 'modal', payload: modal };
}

/** Execute a confirmed multi-delete. */
async function handleConfirmedDelete(interaction, kind, ctx) {
  const discordUserId = (interaction.member?.user || interaction.user)?.id;
  const pending = await readPending(discordUserId);
  if (!pending || pending.kind !== kind || pending.chatId !== ctx.chatId) {
    return { mode: 'update', payload: { content: 'หมดอายุแล้ว — เริ่มใหม่อีกครั้ง', components: [] } };
  }

  const t = PICK_TARGET[kind];
  const base = A.db().collection('chats').doc(ctx.chatId).collection(t.col);
  const deleted = [];
  let also = '';
  for (const id of pending.ids) {
    const ref = base.doc(id);
    const doc = await ref.get();
    if (!doc.exists) continue;                 // someone got there first
    const data = doc.data();                   // read before the delete
    deleted.push(data[t.label] || '(ไม่มีชื่อ)');
    await ref.delete();
    also += await unlinkOnDelete(ctx.chatId, kind, data);
  }
  await A.db().collection('discordPending').doc(discordUserId).delete();

  if (!deleted.length) {
    return { mode: 'update', payload: { content: 'ไม่มีอะไรถูกลบ — อาจถูกลบไปก่อนแล้ว', components: [] } };
  }
  return {
    mode: 'update',
    payload: {
      content: `ลบแล้ว ${deleted.length} รายการ:\n`
        + deleted.map(n => `• ~~${escapeMd(n)}~~`).join('\n')
        + also,
      components: [],
    },
  };
}

/**
 * Keep the project↔schedule pair consistent when one half is deleted.
 *
 * Deleting the project takes its deadline entry with it; deleting the entry
 * clears the deadline instead of deleting the project — dropping a whole
 * project because someone tidied up /schedule would be a nasty surprise.
 * Returns a line to append to the confirmation, or ''.
 */
async function unlinkOnDelete(chatId, kind, data = {}) {
  if (!data) return '';
  const chat = A.db().collection('chats').doc(chatId);

  if (kind === 'proj' && data.scheduleId) {
    const ref = chat.collection('schedule').doc(data.scheduleId);
    if ((await ref.get()).exists) {
      await ref.delete();
      return '\n_ลบเดดไลน์ออกจาก `/schedule` ให้แล้ว_';
    }
    return '';
  }

  if (kind === 'sched' && data.projectId) {
    const ref = chat.collection('projects').doc(data.projectId);
    const doc = await ref.get();
    if (doc.exists) {
      await ref.update({ deadline: null, scheduleId: null });
      return `\n_ล้างเดดไลน์ของโปรเจกต์ **${escapeMd(doc.data().title || '')}** แล้ว (โปรเจกต์ยังอยู่)_`;
    }
  }
  return '';
}

/* ----------------------------------------------------- pick-then-edit */

/**
 * Editing goes through a modal — Discord's only real form.
 *
 * The alternative is a slash command with one optional option per field, which
 * means retyping a description to fix a typo in it and gives no clue what the
 * current values are. A modal opens prefilled, so editing is editing rather
 * than re-entering.
 *
 * Two constraints shape everything below: a modal holds at most 5 text inputs,
 * and it must be the *first* response to an interaction — it cannot follow a
 * deferred reply. That is why the handlers return `{ modal }` and index.js
 * sends it straight back rather than doing any work first.
 */

// Text input styles: 1 = single line, 2 = paragraph.
const SHORT = 1, PARAGRAPH = 2;

function textInput(id, label, { value, style = SHORT, required = false, placeholder, max = 1000 } = {}) {
  const input = {
    type: 4,
    custom_id: id,
    label: truncate(label, 45),
    style,
    required,
    max_length: max,
  };
  // Discord rejects an empty `value`, and omitting it is the same thing.
  if (value) input.value = truncate(String(value), max);
  if (placeholder) input.placeholder = truncate(placeholder, 100);
  return { type: 1, components: [input] };
}

function todoEditModal(doc) {
  const t = doc.data();
  return {
    custom_id: `todoedit:${doc.id}`,
    title: 'แก้ไขงาน',
    components: [
      textInput('text', 'รายละเอียดงาน', {
        value: t.text, style: PARAGRAPH, required: true, max: 1000,
      }),
    ],
  };
}

// Five fields is exactly Discord's ceiling, so a project edit has no room to
// grow — anything new belongs in the app, not here.
function projectEditModal(p) {
  return {
    custom_id: `projedit:${p.id}`,
    title: 'แก้ไขโปรเจกต์',
    components: [
      textInput('title', 'ชื่อโปรเจกต์', { value: p.title, required: true, max: 200 }),
      textInput('emoji', 'อีโมจิ', { value: p.emoji, placeholder: '📁', max: 8 }),
      textInput('desc', 'คำอธิบาย', { value: p.desc, style: PARAGRAPH, max: 2000 }),
      whenInput('deadline', `เดดไลน์ ${WHEN_TEMPLATE} (เว้นว่าง = ไม่มี)`, {
        value: formatWhen(p.deadline),
      }),
      textInput('status', 'สถานะ', { value: p.status, placeholder: 'active / paused / done', max: 40 }),
    ],
  };
}

function scheduleEditModal(doc) {
  const e = doc.data();
  return {
    custom_id: `schededit:${doc.id}`,
    title: 'แก้ไขกำหนดการ',
    components: [
      textInput('title', 'ชื่อกำหนดการ', { value: e.title, required: true, max: 200 }),
      whenInput('when', `วันเวลา (${WHEN_TEMPLATE})`, { value: formatWhen(e.at), required: true }),
      textInput('note', 'รายละเอียด', { value: e.note, style: PARAGRAPH, max: 2000 }),
    ],
  };
}

/**
 * The add form. Only reached when the date was left blank, so the box starts
 * prefilled with tomorrow 09:00 *in the template shape* — a real date the
 * user edits digit by digit rather than a format they have to reproduce from
 * memory. The label and placeholder repeat the shape for anyone who clears it.
 */
function scheduleAddModal({ title, note } = {}) {
  return {
    custom_id: 'schedadd:new',
    title: 'เพิ่มกำหนดการ',
    components: [
      textInput('title', 'ชื่อกำหนดการ', { value: title, required: true, max: 200 }),
      whenInput('when', `วันเวลา (${WHEN_TEMPLATE})`, {
        value: formatWhen(startOfDay(Date.now()) + 86400000 + 9 * 3600000),
        required: true,
      }),
      textInput('note', 'รายละเอียด', { value: note, style: PARAGRAPH, max: 2000 }),
    ],
  };
}

/**
 * A date box. Every one in the bot goes through here, so the template shown
 * in the label, the placeholder and the accepted input can never drift apart.
 */
function whenInput(id, label, { value, required = false } = {}) {
  return textInput(id, label, { value, required, placeholder: WHEN_PLACEHOLDER, max: 40 });
}

/**
 * A submitted modal. Same { mode, payload } contract as handleComponent:
 *   'update'    — rewrite the message the picker was on
 *   'ephemeral' — a private error; the shared message is left alone
 *
 * Validation failures land here rather than in the modal itself: Discord has
 * no way to reject a submission and reopen the form, so a bad date comes back
 * as a private message and the user runs the command again.
 */
async function handleModal(interaction) {
  const [kind, id] = String(interaction.data?.custom_id || '').split(':');
  if (!['todoedit', 'projedit', 'schededit', 'schedadd'].includes(kind) || !id) {
    return { mode: 'ephemeral', payload: { content: 'ฟอร์มนี้ใช้ไม่ได้แล้ว' } };
  }

  // A modal can be submitted long after it opened, and membership can have
  // changed in between — re-check rather than trusting that it opened at all.
  const ctx = await A.resolveContext(interaction);
  if (ctx.error) return { mode: 'ephemeral', payload: { content: ctx.error } };

  const vals = D.readModal(interaction.data);
  const chat = A.db().collection('chats').doc(ctx.chatId);

  if (kind === 'schedadd') {
    // Discord has no way to reject a submission and reopen the form, so
    // anything wrong comes back privately — with what they typed still in the
    // channel history to copy from — rather than posting a broken event.
    const title = String(vals.title || '').trim();
    if (!title) return { mode: 'ephemeral', payload: { content: 'ใส่ชื่อกำหนดการด้วย' } };
    if (parseWhen(vals.when) === null) {
      return { mode: 'ephemeral', payload: { content: `อ่านวันที่ไม่ออก — ${WHEN_HELP}` } };
    }

    // Validated, so hand the write itself to the command — a second way to
    // create an event must not become a second set of rules for what gets
    // stored. The result is public: the channel is who the event is for.
    const payload = await handleSchedule(interaction, {
      sub: 'add',
      opts: { title, when: vals.when, note: vals.note },
    });
    return { mode: 'reply', payload };
  }

  if (kind === 'todoedit') {
    const ref = chat.collection('tasks').doc(id);
    const doc = await ref.get();
    // Deleted while the form was open — re-render so the stale row disappears.
    if (!doc.exists) return { mode: 'update', payload: await todoView(ctx.chatId) };

    const text = String(vals.text || '').trim();
    if (!text) return { mode: 'ephemeral', payload: { content: 'ข้อความของงานว่างไม่ได้' } };

    await ref.update({ text, updatedAt: FieldValue.serverTimestamp(), updatedBy: ctx.uid });
    return { mode: 'update', payload: await todoView(ctx.chatId) };
  }

  if (kind === 'projedit') {
    const ref = chat.collection('projects').doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      return { mode: 'update', payload: { content: 'โปรเจกต์นี้ถูกลบไปแล้ว', components: [] } };
    }
    const before = doc.data();

    const title = String(vals.title || '').trim();
    if (!title) return { mode: 'ephemeral', payload: { content: 'ใส่ชื่อโปรเจกต์ด้วย' } };

    // Reject a bad date before writing anything, exactly as /project new does.
    // A half-applied edit that silently drops the deadline is the worse
    // outcome, and the user still has their typed values in scroll-back.
    const raw = String(vals.deadline || '').trim();
    const at = raw ? parseWhen(raw) : null;
    if (raw && at === null) {
      return { mode: 'ephemeral', payload: { content: `อ่านเดดไลน์ไม่ออก — ${WHEN_HELP}` } };
    }

    const emoji = String(vals.emoji || '').trim() || '📁';
    const desc = String(vals.desc || '');
    const status = String(vals.status || '').trim() || 'active';

    const sync = await syncProjectSchedule(ctx.chatId, { ...before, id },
      { at, title, emoji, desc, uid: ctx.uid });

    await ref.update({
      title, emoji, desc, status,
      deadline: at,
      scheduleId: sync.scheduleId,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: ctx.uid,
    });

    const when = at === null
      ? ''
      : `\n⏰ เดดไลน์ ${discordTime(at, 'F')} · เหลืออีก ${discordTime(at, 'R')}`
        + (at < Date.now() ? '\n⚠️ เดดไลน์นี้ผ่านไปแล้ว' : '');

    return {
      mode: 'update',
      payload: {
        content: `แก้ไขโปรเจกต์แล้ว: ${emoji} **${escapeMd(title)}**${when}${sync.note}`,
        components: [],
      },
    };
  }

  // schededit
  const ref = chat.collection('schedule').doc(id);
  const doc = await ref.get();
  if (!doc.exists) {
    return { mode: 'update', payload: { content: 'กำหนดการนี้ถูกลบไปแล้ว', components: [] } };
  }

  const title = String(vals.title || '').trim();
  if (!title) return { mode: 'ephemeral', payload: { content: 'ใส่ชื่อกำหนดการด้วย' } };
  const at = parseWhen(vals.when);
  if (at === null) return { mode: 'ephemeral', payload: { content: `อ่านวันที่ไม่ออก — ${WHEN_HELP}` } };

  const payload = await applyScheduleEdit(ctx.chatId, doc,
    { title, at, note: String(vals.note || '') }, ctx.uid);
  return { mode: 'update', payload: { ...payload, components: [] } };
}

/**
 * Write a schedule patch and push the date back to the linked project.
 *
 * Shared by `/schedule edit` and the modal so the two cannot drift: a date
 * that lives in two documents has to be written by one piece of code.
 */
async function applyScheduleEdit(chatId, doc, patch, uid) {
  const before = doc.data();
  await doc.ref.update({ ...patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid });
  const after = { ...before, ...patch };

  // Push the change back to the project, or the two views start disagreeing
  // about the same date.
  let mirrored = '';
  if (before.projectId) {
    const pref = A.db().collection('chats').doc(chatId).collection('projects').doc(before.projectId);
    const pdoc = await pref.get();
    if (pdoc.exists) {
      const ppatch = { deadline: after.at };
      if (patch.title) ppatch.title = patch.title;
      await pref.update(ppatch);
      mirrored = `\n_อัปเดตเดดไลน์ของโปรเจกต์ **${escapeMd(pdoc.data().title || '')}** ให้แล้ว_`;
    }
  }

  return {
    content: `แก้ไขแล้ว **${escapeMd(after.title || '')}**\n`
      + `${discordTime(after.at, 'F')} · เหลืออีก ${discordTime(after.at, 'R')}${mirrored}`,
  };
}

/**
 * The other direction: keep a project's `/schedule` entry in step after the
 * project itself is edited. Creates, updates or removes the entry as the
 * deadline appears, moves or is cleared.
 *
 * Returns { scheduleId, note } — the id for the caller to store on the
 * project, and a line to append to the confirmation.
 */
async function syncProjectSchedule(chatId, project, { at, title, emoji, desc, uid }) {
  const col = A.db().collection('chats').doc(chatId).collection('schedule');
  const existingId = project.scheduleId || null;
  const existing = existingId ? await col.doc(existingId).get() : null;
  const live = existing && existing.exists;

  if (at === null) {
    if (!live) return { scheduleId: null, note: '' };
    await col.doc(existingId).delete();
    return { scheduleId: null, note: '\n_ลบเดดไลน์ออกจาก `/schedule` ให้แล้ว_' };
  }

  if (live) {
    await col.doc(existingId).update({
      title, at, note: desc, emoji,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: uid,
    });
    return { scheduleId: existingId, note: '\n_อัปเดตใน `/schedule` ให้แล้ว_' };
  }

  const id = 'sc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  await col.doc(id).set({
    id, title, at,
    note: desc,
    emoji,
    projectId: project.id,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    source: 'discord',
  });
  return { scheduleId: id, note: '\n_เพิ่มลง `/schedule` ให้แล้ว_' };
}

/* ----------------------------------------------------------------- shared */

// Stop user text from breaking out into Discord markdown.
function escapeMd(s) {
  return String(s).replace(/([*_~`|\\>])/g, '\\$1');
}

// Embed description caps at 4096; leave headroom rather than getting a 400.
function truncate(s, max) {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

module.exports = {
  handleLink, handleBind, handleTodo, handleProject, handlePoll, handleSchedule,
  handleComponent, handleModal, handleAutocomplete,
  todoView, scheduleView, parseWhen, formatWhen, whenSuggestions,
  WHEN_TEMPLATE,
};
