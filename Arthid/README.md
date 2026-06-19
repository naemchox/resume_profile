# Arthid

A Firebase-backed chat web app. Authentication, real-time messaging, friend
lookups, file attachments, and OS-level notifications are built on Firebase
Auth, Firestore, and Cloud Storage. The app is delivered as plain static HTML
files that load the Firebase SDK directly from the CDN — there is no build
step or bundler.

## Notable files

- `index3.html` — The main single-page chat application (large self-contained HTML/CSS/JS file).
- `auth.html` — Standalone sign-in page (Google and email/password) titled "Sign in — Arthid".
- `firebase.js` — Initializes the Firebase app (project `arthid-0417`) and exposes the Auth, Firestore, and Storage SDK on `window` for the legacy script-tag code; also mirrors each signed-in user into `users/{uid}`.
- `firestore.rules` — Security rules for the Firestore database (users, chats, etc.); kept in the repo and pasted into the Firebase Console to publish.
- `storage.rules` — Security rules for the Cloud Storage bucket, governing chat attachment uploads under `chats/{chatId}/{senderUid}/`.
- `sw.js` — Notification service worker that fires OS-level notifications when backgrounded and bridges click/reply actions back to the page.
- `rail spacer_horizontal.png` — Image asset used by the UI.
- `CLAUDE.md` — Guidance for Claude Code (git workflow and project notes).
- `notepad.txt` — Scratch file.
- `.gitignore` — Ignores `node_modules/`, env files, build output, and editor/OS cruft.
