/* PubChat — server-authoritative invites.
 *
 * WHY THIS EXISTS
 * The weekly invite allowance is the only thing money buys in this app (`inviteQuota()`,
 * talk.html). It lived entirely on the member's own user doc, and firestore.rules locked
 * uid/createdAt/status/plan/tier/tcs/isAdmin but not `inviteWeek` — so anyone could open
 * devtools and write `users/{self}.inviteWeek = {n:0}` for unlimited free invites. Rules cannot
 * fix this on their own: a rule can forbid a value, but it cannot count. The day we start selling
 * is the day people stop paying, which is why this runs before the first baht.
 *
 * The counter alone is not enough either. Opening a chat was a plain client write, so a member
 * could skip the invite entirely and create `chats/{a_b}` directly. So this function owns the
 * whole step — check the allowance, spend it, create the chat, log the invite — in one
 * transaction, and the rules hand chat creation to nobody else.
 *
 * DEPLOY ORDER MATTERS. `firestore.rules` now refuses client-side chat creation, so deploying
 * the rules before this function is live takes the app down:
 *     firebase deploy --only functions      # needs the Blaze plan
 *     firebase deploy --only firestore:rules
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();

// Bangkok, not the caller's device: the allowance resets on the week the member is living in,
// and a device with a wrong clock or a holiday timezone should not get a second Monday.
setGlobalOptions({ region: 'asia-southeast1', maxInstances: 10 });

/* Mirrors MEMBERSHIP in talk.html. Duplicated on purpose — the client copy decides what to draw,
 * this copy decides what is true. If you change one, change the other; a mismatch shows up as a
 * member who can see nine marks and spend eight. */
const QUOTA = { '': 2, free: 2, verified: 8, circle: 12 };

// Same ISO week the client computes, evaluated in Asia/Bangkok (UTC+7).
function isoWeekKey(now = new Date()) {
  const t = new Date(now.getTime() + 7 * 3600 * 1000);
  const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);       // Thursday decides the ISO year
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - y0) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const chatIdOf = (a, b) => [a, b].sort().join('_');

/* startChat({ to, origin, lang })
 *   → { cid, spent, left }
 *
 * `spent:false` means the chat already existed and no invite was taken, which is what the client
 * used to work out for itself before opening a room. Re-opening a conversation is free; only the
 * first one costs.
 *
 * Throws:
 *   unauthenticated   — not signed in
 *   invalid-argument  — no target, or targeting yourself
 *   not-found         — either account is missing
 *   permission-denied — caller is suspended/banned, or blocked by the other member
 *   resource-exhausted — allowance spent; the client opens the upgrade sheet on this one
 */
export const startChat = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');

  const to = String(req.data?.to || '');
  const origin = req.data?.origin === 'stranger' ? 'stranger' : 'catch';
  const lang = req.data?.lang === 'th' ? 'th' : 'en';
  if (!to || to === uid) throw new HttpsError('invalid-argument', 'Bad target.');

  const cid = chatIdOf(uid, to);
  const meRef = db.doc(`users/${uid}`);
  const themRef = db.doc(`users/${to}`);
  const chatRef = db.doc(`chats/${cid}`);
  // Blocking is stored on the blocker's side, so both directions have to be checked here —
  // the client only ever knows about its own list.
  const blockedByThem = db.doc(`blocks/${to}/blocked/${uid}`);
  const blockedByMe = db.doc(`blocks/${uid}/blocked/${to}`);

  return db.runTransaction(async (tx) => {
    const [meSnap, themSnap, chatSnap, bThem, bMe] = await Promise.all(
      [meRef, themRef, chatRef, blockedByThem, blockedByMe].map(r => tx.get(r)));

    if (!meSnap.exists || !themSnap.exists) throw new HttpsError('not-found', 'Account missing.');
    const me = meSnap.data(), them = themSnap.data();

    const status = me.status || 'active';
    if (status !== 'active') throw new HttpsError('permission-denied', 'Account is not active.');
    if (bThem.exists || bMe.exists) throw new HttpsError('permission-denied', 'Blocked.');

    // An existing conversation is free to reopen.
    if (chatSnap.exists) {
      const wk = isoWeekKey();
      const used = me.inviteWeek?.k === wk ? (me.inviteWeek.n || 0) : 0;
      const quota = QUOTA[me.plan || ''] ?? QUOTA.free;
      return { cid, spent: false, left: Math.max(0, quota - used) };
    }

    const wk = isoWeekKey();
    const used = me.inviteWeek?.k === wk ? (me.inviteWeek.n || 0) : 0;
    const quota = QUOTA[me.plan || ''] ?? QUOTA.free;
    if (used >= quota) {
      throw new HttpsError('resource-exhausted', 'No invites left this week.');
    }

    const now = Date.now();
    // Names and photos are copied from the user docs rather than taken from the caller, so a
    // member cannot open a chat that shows the other person under a name they chose.
    tx.set(chatRef, {
      members: [uid, to].sort(),
      createdBy: uid,
      origin,
      createdAt: now,
      lastMessage: '',
      lastAt: now,
      compassActive: false,
      locA: { on: false }, locB: { on: false },
      names: { [uid]: me.displayName || 'Someone', [to]: them.displayName || 'Someone' },
      photos: { [uid]: me.photoURL || '', [to]: them.photoURL || '' },
    });

    const sys = origin === 'catch'
      ? (lang === 'th' ? 'เชื่อมต่อผ่านการทัก' : 'Connected via a wave')
      : (lang === 'th' ? 'เชื่อมต่อผ่านการทำความรู้จัก' : 'Connected via Mingle');
    tx.set(chatRef.collection('messages').doc(), { type: 'sys', text: sys, createdAt: now });

    tx.update(meRef, { inviteWeek: { k: wk, n: used + 1 } });
    // The invite log is what reciprocity is scored from later: an invite with no reply from `to`
    // is exactly the signal we want to keep.
    tx.set(db.collection('invites').doc(), { from: uid, to, cid, at: now });

    return { cid, spent: true, left: Math.max(0, quota - used - 1) };
  });
});
