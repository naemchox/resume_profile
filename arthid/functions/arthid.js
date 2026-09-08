// The Arthid side of the bridge: resolving a Discord user to an Arthid
// account, and a Discord channel to an Arthid chat.
//
// Two mappings, both stored in Firestore and both readable only by the Admin
// SDK (the security rules have no `match` for these paths, so client access is
// denied by default — which is what we want; nothing in the web app needs them):
//
//   discordLinks/{discordUserId}    -> { uid, primaryKey, linkedAt }
//   discordChannels/{channelId}     -> { chatId, guildId, boundByUid, boundAt }

const admin = require('firebase-admin');

function db() {
  return admin.firestore();
}

/** Discord user id -> Arthid uid, or null if they've never run /link. */
async function uidForDiscordUser(discordUserId) {
  const snap = await db().collection('discordLinks').doc(discordUserId).get();
  return snap.exists ? snap.data().uid : null;
}

/**
 * Bind a Discord account to an Arthid one via the Primary Key the user can
 * already see in the app. Reuses users.primaryKeyLower, which is the same
 * indexed field the "Add friend by key" flow queries.
 */
async function linkByPrimaryKey(discordUserId, primaryKey) {
  const key = String(primaryKey || '').trim().toLowerCase();
  if (!key) return { ok: false, reason: 'empty' };

  const q = await db().collection('users')
    .where('primaryKeyLower', '==', key)
    .limit(1)
    .get();
  if (q.empty) return { ok: false, reason: 'not-found' };

  const doc = q.docs[0];

  // One Arthid account per Discord account and vice versa — otherwise two
  // Discord users could both act as the same person and the audit trail on
  // every task and vote becomes meaningless.
  const existing = await db().collection('discordLinks')
    .where('uid', '==', doc.id)
    .limit(1)
    .get();
  if (!existing.empty && existing.docs[0].id !== discordUserId) {
    return { ok: false, reason: 'taken' };
  }

  await db().collection('discordLinks').doc(discordUserId).set({
    uid: doc.id,
    primaryKey: doc.data().primaryKey || null,
    linkedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ok: true, uid: doc.id, name: doc.data().name || doc.data().email || 'Arthid user' };
}

async function unlinkDiscordUser(discordUserId) {
  await db().collection('discordLinks').doc(discordUserId).delete();
}

/** Discord channel -> Arthid chat, or null if the channel has no /bind yet. */
async function chatForChannel(channelId) {
  const snap = await db().collection('discordChannels').doc(channelId).get();
  return snap.exists ? snap.data().chatId : null;
}

async function bindChannel(channelId, guildId, chatId, boundByUid) {
  await db().collection('discordChannels').doc(channelId).set({
    chatId,
    guildId: guildId || null,
    boundByUid,
    boundAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/** Every Arthid chat this uid is a member of, for the /bind picker. */
async function chatsForUid(uid) {
  const q = await db().collection('chats')
    .where('members', 'array-contains', uid)
    .limit(25)          // Discord select menus cap at 25 options
    .get();
  return q.docs.map(d => ({ id: d.id, type: d.data().type || 'dm', members: d.data().members || [] }));
}

/**
 * A readable name for a chat. Group docs don't carry a title — the web app
 * keeps group names client-side — so DMs are named after the other member and
 * groups fall back to a member count.
 */
async function describeChat(chat, viewerUid) {
  if (chat.type === 'dm') {
    const otherUid = (chat.members || []).find(m => m !== viewerUid);
    if (otherUid) {
      const u = await db().collection('users').doc(otherUid).get();
      if (u.exists) return `DM · ${u.data().name || u.data().email || otherUid}`;
    }
    return 'DM';
  }
  return `Group · ${(chat.members || []).length} members`;
}

/** Resolve uids to display names in one pass, for rendering task/vote authors. */
async function namesForUids(uids) {
  const unique = [...new Set(uids.filter(Boolean))];
  if (!unique.length) return {};
  const docs = await db().getAll(...unique.map(u => db().collection('users').doc(u)));
  const out = {};
  docs.forEach(d => {
    if (d.exists) out[d.id] = d.data().name || d.data().email || d.id.slice(0, 6);
  });
  return out;
}

/**
 * Every command except /link needs both mappings. Returns a ready-to-send
 * error string when either is missing, so handlers stay linear.
 */
async function resolveContext(interaction) {
  const discordUserId = (interaction.member && interaction.member.user && interaction.member.user.id)
    || (interaction.user && interaction.user.id);

  // These two lookups are independent, and Discord's 3-second budget is tight
  // enough that a needless serial round trip is worth removing.
  const [uid, chatId] = await Promise.all([
    uidForDiscordUser(discordUserId),
    chatForChannel(interaction.channel_id),
  ]);

  if (!uid) {
    return { error: 'ยังไม่ได้เชื่อมบัญชี — ใช้ `/link` พร้อม Primary Key จากแอป Arthid ก่อน\n(Not linked yet — run `/link` with your Arthid Primary Key first.)' };
  }
  if (!chatId) {
    return { error: 'ห้องนี้ยังไม่ได้ผูกกับแชท Arthid — ใช้ `/bind` ก่อน\n(This channel isn\'t bound to an Arthid chat yet — run `/bind`.)' };
  }
  // Membership is re-checked here rather than trusted from the bind, because
  // people leave groups after a channel is bound.
  const chat = await db().collection('chats').doc(chatId).get();
  if (!chat.exists || !(chat.data().members || []).includes(uid)) {
    return { error: 'คุณไม่ได้เป็นสมาชิกของแชทที่ผูกกับห้องนี้\n(You are not a member of the chat bound to this channel.)' };
  }
  return { uid, chatId, discordUserId };
}

module.exports = {
  db,
  uidForDiscordUser, linkByPrimaryKey, unlinkDiscordUser,
  chatForChannel, bindChannel, chatsForUid, describeChat, namesForUids,
  resolveContext,
};
