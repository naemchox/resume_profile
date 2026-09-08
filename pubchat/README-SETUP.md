# PubChat — Setup Guide

A mobile-first web chat app for pubs. People who are physically near each other can
discover one another, "catch" each other with a chat-ball minigame, chat in real time,
guide each other with an in-chat compass, and meet random people in **Stranger Mode**.

Everything lives in **`talk.html`** (one file). The other files configure Firebase.

---

## What you need (free)
- A Google account
- A **Firebase** project (free *Spark* plan is enough for Phase 1)
- **Node.js** installed (for the Firebase command-line tool) — https://nodejs.org

> ⚠️ Location and the phone compass only work over **HTTPS** (or `http://localhost`).
> That's why we deploy to **Firebase Hosting** — it gives you a free HTTPS URL.

---

## Step 1 — Create the Firebase project
1. Go to https://console.firebase.google.com → **Add project** → give it a name → Create.
2. In the left menu open **Build → Authentication → Get started**, then enable:
   - **Google** (toggle on, pick a support email, Save)
   - **Email/Password** (toggle on the first option, Save) — this powers the hidden admin login.
3. Open **Build → Firestore Database → Create database** → choose a location → start in
   **Production mode** (our `firestore.rules` file secures it properly).

### Create the admin account
The app has a hidden admin login (see "Admin login" below). Create its account now:
1. Still under **Authentication**, open the **Users** tab → **Add user**.
2. Enter exactly:
   - **Email:** `admin@pubchat.app`
   - **Password:** `pc_admin`
3. Click **Add user**.

> You'll log in inside the app with the simple **ID `admin` / password `admin`** — the app
> automatically translates that to the email/password above (Firebase requires an email and a
> 6-character-minimum password, so we map `admin` → `admin@pubchat.app` and `admin` → `pc_admin`).

## Step 2 — Get your web config keys
1. In the console, click the **gear icon → Project settings**.
2. Scroll to **Your apps** → click the **web** icon `</>` → register an app (any nickname).
3. Firebase shows a `firebaseConfig = { ... }` snippet. Copy those values.
4. Open **`talk.html`**, find the block near the top marked
   `STEP 1 — PASTE YOUR FIREBASE WEB CONFIG HERE`, and paste your values in.

## Step 3 — Point the project file at your project
Open **`.firebaserc`** and replace `REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID` with your real
**Project ID** (shown in Project settings, e.g. `pubchat-1a2b3`).

## Step 4 — Install the Firebase tool & log in
In a terminal, in this folder:
```bash
npm install -g firebase-tools
firebase login
```
(`firebase login` opens a browser to sign in with your Google account.)

## Step 5 — Deploy
```bash
firebase deploy --only firestore:rules,firestore:indexes,hosting
```
This uploads the security rules and publishes the app. When it finishes it prints a
**Hosting URL** like `https://your-project.web.app` — open that on your phone. 🎉

> The deploy automatically copies `talk.html` into a `public/` folder as `index.html`
> (see the `predeploy` step in `firebase.json`), so you only ever edit `talk.html`.

---

## How to test all 4 features
Open the Hosting URL in **two** browsers (e.g. Chrome + an incognito window, or two phones)
and sign in as two different people.

1. **Nearby (#1):** On each, open the **Nearby** tab → expand **🛠 Simulate my location**
   and set both to coordinates ~100 m apart (e.g. `13.7563 / 100.5018` and
   `13.7570 / 100.5018`). Each user appears on the other's radar. Flip **Visible to others** off → they vanish.
2. **Chat-ball (#2):** Tap a person → choose **Premium** ball → throw → 100% catch → chat opens.
   Try **Free** balls to see ~50% misses.
3. **Compass (#3):** Inside the chat, **both** people flip the compass switch (top-right) on.
   Two compass cards drop into the chat automatically — one guiding your partner to you, one
   you can tap (**Guide me**) to be led to them. Move a simulated location and watch the
   arrow/distance update. Turn either switch off → the compass pauses.
4. **Stranger Mode (#4):** On one device open **Stranger** → **Enter Stranger Mode**.
   On the other device, turn on **Findable by strangers**. The searcher gets a random card →
   **Chat** opens a room directly (no chat-ball needed); **Next** reshuffles.

**Safety:** inside any chat, the **⋮** menu lets you Block or Report. Blocked people disappear
from your radar, chats, and Stranger Mode.

---

## Admin login (hidden)
There is no "guest" button. Instead, on the sign-in screen, **hold `q` + `w` + `e` together on a
keyboard** to reveal the **Admin sign in** box, then enter **ID `admin` / password `admin`**.

- The hotkey needs a **physical keyboard**, so admin access is meant for a **desktop/laptop**
  (it won't trigger on a touch-only phone — by design).
- The account is flagged `isAdmin` in the database. It logs in like a normal user for now;
  dedicated admin powers can be added later.
- Requires the `admin@pubchat.app` / `pc_admin` account from the setup step above.

---

## Money (chat-balls)
- **Free balls** regenerate (1 every 30 min, up to 5).
- **Premium balls** (100% catch) are bought with **demo coins** in the **You** tab.
- **Get more coins** is a placeholder today — **Phase 2** wires real top-ups via **Stripe**
  (needs a Stripe account + upgrading Firebase to the pay-as-you-go *Blaze* plan and a
  Cloud Function to handle payment securely).

---

## Troubleshooting
| Problem | Fix |
|--------|-----|
| App shows "Almost there 👋" | You haven't pasted the Firebase config into `talk.html` yet (Step 2). |
| "Could not load nearby users" | Deploy the rules: `firebase deploy --only firestore:rules`. |
| Google sign-in popup blocked | Allow popups, or use **Continue as guest**. |
| No one on radar | Both users must be **Visible**, seen in the last 2 min, and within the range slider. Use the simulate panel. |
| Compass arrow doesn't rotate with the phone | Tap **Enable phone compass** (iOS asks permission). Without it, **North is up** and the arrow still points the right way. |
| Location permission denied | Use the **🛠 Simulate my location** panel on the Nearby tab. |
