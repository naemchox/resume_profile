# PubChat backend — economy & Stripe cutover

This makes the **economy server-authoritative**. Today a user can edit their own
`users/{uid}` doc from the browser console and grant themselves unlimited coins,
premium balls, points or levels. After this cutover, every *increase* in value
happens inside a Cloud Function (Admin SDK); the client can only *spend*.

Nothing here changes your running app until **you** deploy it, so you can do it
when ready. Order matters — do the steps top to bottom.

## What's in the repo

| File | Purpose |
|------|---------|
| `functions/index.js` | Callable economy functions + Stripe webhook |
| `functions/package.json` | Functions deps (Node 20, firebase-admin, stripe) |
| `firestore.rules.hardened` | Locked rules — client can't inflate the economy |
| `firestore.rules` | **Current** rules (still safe to run today; already patched for message impersonation + immutable identity) |

## Prerequisites

- **Blaze (pay-as-you-go) plan** — Cloud Functions require it. There's a generous
  free tier; idle cost is ~$0.
- A **Stripe account** (only if you want real coin top-ups).

## Step 1 — Deploy the functions

```bash
cd functions && npm install && cd ..

# Only needed if you'll use Stripe coin top-ups:
firebase functions:secrets:set STRIPE_SECRET_KEY        # paste sk_live_... (or sk_test_...)
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET    # paste whsec_... from Step 4

firebase deploy --only functions
```

## Step 2 — Cut the client over to the functions

In `talk.html`, add `getFunctions` / `httpsCallable` to the firebase-functions import
block near the top, and a `fns` handle next to `db`:

```js
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
// ...after: const db = getFirestore(fbApp);
const fns = getFunctions(fbApp);
const call = (name, data) => httpsCallable(fns, name)(data).then(r => r.data);
```

Then replace these four client-side mutations (they currently write coins/balls/XP
directly, which the hardened rules will reject) with function calls:

**`buyBalls(n)`** — replace the direct `updateDoc(... coins/paidBalls ...)` with:
```js
async function buyBalls(n){
  const cost=PAID_BALL_COST*n;
  if(S.profile.coins<cost) return toast(T('Not enough coins','เหรียญไม่พอ'));
  try{ const r=await call('purchasePremiumBalls',{n});
    S.profile.coins=r.coins; S.profile.paidBalls=r.paidBalls;
  }catch(e){ return toast(T('Purchase failed — try again','ซื้อไม่สำเร็จ ลองใหม่')); }
  toast(T(`+${n} premium ball${n>1?'s':''}`,`+${n} ลูกบอลพรีเมียม`)); renderProfile(); refreshWalletPill();
}
```

**`redeemReward(id, sc)`** — swap the `updateDoc(... patch ...)` for `await call('redeemReward',{id})`,
then set `S.profile.points`, `paidBalls`, `coins` from the reward locally as it does now.

**`regenFreeBalls()`** — replace its `updateDoc(...)` with `const r=await call('grantFreeBallRegen'); if(r){ S.profile.freeBalls=r.freeBalls; S.profile.lastFreeRegen=r.lastFreeRegen; }`.
(The live 2-min countdown UI keeps working unchanged.)

**Friendship XP** — in `becomeFriends()` and `reconcileFriendChats()`, stop writing
`exp`/`points`/`friends` directly. After the chat is marked `friends:true`, call:
```js
const r = await call('creditFriendship',{otherUid});
if(r?.credited){ /* update S.profile.exp/points/friends from server, toast, refreshWalletPill() */ }
```
The function verifies the chat really is `friends:true` and that you're a member, and
never grants the same friend twice — so XP can't be farmed.

> Throwing a ball still decrements `freeBalls`/`paidBalls` from the client — that's
> a *spend*, which the hardened rules allow.

## Step 3 — Swap in the hardened rules

Only after Steps 1–2 are deployed and verified:

```bash
cp firestore.rules.hardened firestore.rules
firebase deploy --only firestore:rules,firestore:indexes
```

(`firestore:indexes` also ships the new geohash indexes added for the bounded
nearby/stranger queries.)

## Step 4 — Stripe coin top-ups (optional)

1. Stripe Dashboard → **Payment Links**, one per pack in `COIN_PACKS` (talk.html).
   Set each link's *After payment → Redirect* to `https://<your-app>/?paid=1`.
2. Paste each link URL into the matching `COIN_PACKS[i].url`.
3. Keep `STRIPE_AMOUNT_TO_COINS` in `functions/index.js` in sync with the pack prices
   (keys are the amount in the smallest currency unit — cents for USD).
4. Stripe Dashboard → **Developers → Webhooks → Add endpoint**:
   URL `https://us-central1-<project-id>.cloudfunctions.net/stripeWebhook`,
   event `checkout.session.completed`. Copy its signing secret into
   `STRIPE_WEBHOOK_SECRET` (Step 1) and redeploy functions.

Coins are credited only by the verified webhook — never by the client.

## Quick verification

- Console: `await firebase.firestore().doc('users/<uid>').update({coins:999999})` →
  **PERMISSION_DENIED** (with hardened rules live).
- Buy a ball in-app → coins drop, premium balls rise.
- Add a friend (scan) → +50 XP, and a second scan grants nothing.
