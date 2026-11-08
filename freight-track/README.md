# FreightTrack

A shipment tracking and back-office system built for a transport company client. Warehouse staff plan trips, drivers close each delivery stop from a phone with photos, GPS and a signature, customers track their parcels without logging in, and accounting issues invoices from the same data. The client's name and data have been replaced with placeholders ("Example Transport").

**Stack** — vanilla JS (ES modules, no build step) · Firebase (Auth, Firestore, Storage) · Google Apps Script backend (Sheets, Drive, LINE Messaging API) · Firebase Emulator + `@firebase/rules-unit-testing`

Original Thai notes: [`SECURITY.md`](./SECURITY.md) (security review) and [`OFFLINE.md`](./OFFLINE.md) (offline plan). The code comments are mostly in Thai.

---

## Features

- **Ops board** (`ops.html`) — trips and stops for the warehouse team, urgent real-time jobs, a daily list of files received from the customer, and a monthly photo-count banner against the client's quota.
- **Excel import** (`customer.html`, `js/xlsxImport.js`) — reads the customer's Excel format (columns A to Q plus a driver column) and turns grouped rows into jobs.
- **Driver page** (`driver.html`) — the driver's own trips. Closing a stop collects goods photos, the receiver's name and signature, GPS, and a photo of each invoice. A half-finished delivery can be saved as a draft on the phone (`js/deliverDraft.js`).
- **Driver helper page** (`helper.html`) — a second login on the driver's account for the person riding along: payment records, bill collection and printing an A4 POD (`js/pod.js`).
- **Customer tracking** (`index.html`, `track.html`) — public lookup by number, no login. It reads a sanitized copy of the data, not the real documents.
- **Billing** (`billing.html`, `bill.html`) — revenue and costs, per-invoice billing documents, a customer-facing bill link that opens without login, payment slips, and a fuel-price bar (`js/fuelPrice.js`).
- **Bill returns** (`returns.html`, `js/billCollect.js`) — tracks which paper invoices came back, who returned them, and lets a designated collector return a batch with evidence photos.
- **Dashboard** (`dashboard.html`) — summary report of shipments for a date range.
- **Users and roles** (`users.html`, `js/access.js`) — admin, executive, warehouse, accounting, and pending. Page-level `none / view / edit` permissions, overridable per person. Admins can create invite links.
- **Driver practice page** (`practice.html`) — a training mode for drivers.
- **LINE OA intake** (`apps-script-client/LineOA.js`) — the customer sends an Excel file to the LINE official account. The script downloads it, checks that the header row matches the expected format, stores it in Drive and replies to the sender.
- **Nightly Firestore backup** to Google Sheets (`Backup.js`) with a restore script (`Restore.js`).

## Layout

```
index.html / index-staff.html   Customer entry (tracking) / staff entry (office, driver, helper)
ops.html  customer.html  billing.html  returns.html  drivers.html  users.html  dashboard.html
driver.html  helper.html  track.html  bill.html  practice.html  migrate-photos.html
driver-copy.html                Earlier copy of the driver page
css/                            base, app, office, driver, dashboard, track, apple (theme), practice
js/
  config.js                     Per-client settings: bootstrap admins, URLs, company header, POD header
  firebase.js                   Firebase init (SDK from CDN); switches to the emulator on port 5600
  store.js                      The single data layer: localStorage cache + Firestore sync
  cloud.js  realtime.js         Cloud writes, urgent-job window
  access.js                     Roles, pages, permission levels
  auth.js  sheetAuth.js         Staff Google sign-in, driver sign-in via Apps Script
  api.js                        Calls to the Apps Script web app
  photoVault.js  deliverDraft.js  photoQuota.js  keepPhoto.js   Offline photo handling and quota
  xlsxImport.js  xlsxExport.js  opsAuto.js  masterSync.js       Excel in/out, daily file list, master-sheet sync
  billing.js  bills.js  billView.js  billCollect.js  payReport.js  jobReport.js
  driver.js  helper.js  pod.js  track.js  customer.js  ops.js  ...
firestore.rules  storage.rules  firebase.json
tests/rules/                    Rules test suite (Firestore + Storage)
apps-script-client/             Google Apps Script sources (see below)
SECURITY.md  OFFLINE.md         Thai audit report and offline plan
```

`apps-script-client/` contents: `Driver.js` (driver sheet API), `Auth.js` (driver login and Firebase custom tokens, staff check), `LineOA.js` (LINE webhook and format validation), `Master.js` (master sheet and two-way sync), `DriverForm.js`, `Backup.js`, `Restore.js`, `Migrate.js`, `sync.sh` (copies sources in and runs `clasp push`).

## Running locally

There is no build step. Serve the folder over HTTP (ES modules do not load from `file://`):

```bash
python3 -m http.server 5502
# open http://localhost:5502/index-staff.html
```

Opening the pages on port **5600** on localhost makes `js/firebase.js` use a `demo-ft` project and connect to the Firebase emulators instead of the real project. In that mode Apps Script calls are disabled.

## Setup

All values in the repo are placeholders. Replace them before the app can talk to a real backend:

| File | What to set |
|---|---|
| `js/firebase.js` | `firebaseConfig` (`REPLACE_WITH_YOUR_FIREBASE_*`) |
| `js/config.js` | `BOOTSTRAP_ADMINS`, `APPS_SCRIPT_URL`, `COMPANY`, `POD_ORIGIN`, `DEFAULT_CREDIT_DAYS` |
| `apps-script-client/Auth.js` | `FIREBASE_PROJECT`, `FIREBASE_WEB_API_KEY` |
| `apps-script-client/*.js` | `REPLACE_WITH_YOUR_SHEET_ID` / `..._DRIVE_FOLDER_ID` values (Driver, Master, Backup, DriverForm, Migrate, LineOA) |

Secrets are not stored in the code. In the Apps Script project, set Script properties `FIREBASE_SA_JSON` (service-account key, used to mint custom tokens and read Firestore) and `LINE_CHANNEL_ACCESS_TOKEN`. The LINE webhook URL is the deployed `/exec` URL.

```bash
# Rules
firebase deploy --only firestore:rules,storage

# Apps Script (needs clasp, run inside apps-script-client/)
./sync.sh
```

## Tests

The rules suite runs against the Firebase Emulator and does not touch real data. It needs a JDK and the `firebase` CLI.

```bash
cd tests/rules
npm install
npm test
```

It covers allow and deny cases for outsiders, admin, warehouse, executive, view-only, pending, disabled and removed staff, drivers, first admin, invite links, and the billing documents (customer link, slips). `SECURITY.md` records 80 passing Firestore cases and 9 Storage cases at the time of the rules rollout.

## Constraints / design notes

- **One data layer, two stores.** Every screen reads and writes through `js/store.js`. It writes to localStorage first so the UI responds immediately and works with a poor connection, then pushes to Firestore in the background; Firestore changes come back through `onSnapshot`.
- **Offline-first for drivers, partly.** `OFFLINE.md` documents the audit. Pending writes no longer get overwritten by cloud data, offline login works if the device has signed in before, and photos and signatures taken offline go to IndexedDB (`photoVault.js`) because base64 photos exhaust the roughly 5 MB localStorage limit after about ten stops. Opening the app with no connection at all still needs a service worker, which is listed as not done.
- **Access rules are written three times**: `js/access.js` (UI), `firestore.rules`, and the rules tests. They must be changed together, and the suite is run before every deploy.
- **Driver auth goes through Apps Script.** Driver IDs and passwords are checked server-side against a Google Sheet that the browser never reads. On success the script issues a Firebase custom token that identifies the driver, and the rules only let that driver see their own jobs. External driver links work the same way, scoped to one job.
- **Public tracking is a separate copy.** Customers read `trackKeys/{number}` then `trackData/{id}`; the rules allow `get` but not `list`, so a number must be known to see anything.
- **Photo quota counting.** Storage has no monthly counter, so uploads increment `photoUsage/<yyyy-mm>` (batched, bounded increments enforced by the rules). Going over only shows a warning; evidence photos are never blocked.
- **Security status.** `SECURITY.md` is an honest audit, not a clean bill of health. The Firestore and Storage rules and the Apps Script driver check were fixed and deployed; the LINE webhook signature check and audit logging are listed as still open.
