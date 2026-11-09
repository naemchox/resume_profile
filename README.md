# Portfolio

Selected projects. Each folder has its own README with architecture notes, how to run it,
and the constraints that shaped it.

## Systems and backends

| Project | What it is | Stack |
|---|---|---|
| [basalt](./basalt) | **Basalt** — backend-as-a-service: Postgres with row-level security, auto REST API, JWT auth with refresh-token rotation, realtime, storage, admin studio. 49 tests, mostly adversarial | Node · PGlite (Postgres in WASM) · Vite studio |
| [freight-track](./freight-track) | **FreightTrack** — end-to-end shipment system for a transport company: intake, warehouse ops, driver app with photo/GPS/signature proof of delivery, customer tracking, billing | Firebase (Auth, Firestore, Storage) · rules test suite · Google Apps Script · LINE OA |
| [procurement](./procurement) | Mini-ERP procurement: PR → RFQ/quotes → approval → PO → goods receipt → invoice → payment, with audit trail and segregation of duties enforced in the database | Supabase · Postgres RLS, views, triggers · vanilla JS · th/en i18n |
| [coop-coding](./coop-coding) | **Co-op Coding** — VS Code extension for real-time collaborative editing where files stay real files on every participant's disk | TypeScript · VS Code API · Cloudflare Workers + Durable Objects |
| [stock-line-bot](./stock-line-bot) | Multi-user LINE bot that pushes Thai and US stock prices on a schedule and splits the free push quota fairly between users | TypeScript · Cloudflare Workers + KV · LINE Messaging API |
| [arthid](./arthid) | Team chat, projects and meetings, with a Discord bot on the same data | Firebase · Cloud Functions 2nd gen · Discord Interactions |
| [gemini-code](https://github.com/naemchox/gemini-code) | **Gemini Code** — terminal client for Gemini with a web mode and an API agent mode (separate repo) | Python · Playwright · Gemini API |

## Apps

| Project | What it is | Stack |
|---|---|---|
| [GameTranslator](./GameTranslator) | **Gloss** — always-on-top overlay that OCRs game text and translates it in place | Electron · Swift (Vision) · Win32 FFI · Tesseract · Claude API · Cloudflare Workers |
| [train-app](./train-app) | **Train With Myself** — schedule PWA where a rival avatar runs your own plan | React via CDN, no bundler · Service Worker · Supabase · th/en i18n |
| [scoreup](./scoreup) | TOEIC self-study PWA, offline-first — [live](https://scoreup-jek2026.netlify.app) | Single-file app · Service Worker · Google Apps Script |
| [pubchat](./pubchat) | Proximity chat for pubs — find people nearby, compass to meet up | Firebase · Firestore · Cloud Functions |
| [aurum-queue](./aurum-queue) | **AURUM** — online booking and queue system for salons and clinics, with a six-screen back office | Vanilla JS (ES modules) · no build step |
| [ticket-system](./ticket-system) | Internal ticket tracker with a Google Sheet as the database | HTML/JS · Google Apps Script · Google Sheets |
| [iOS](./iOS) | **KruGeng** — SwiftUI app: stem separation, melody transcription, tab/MIDI export | SwiftUI |
| [meow-cafe-tycoon](./meow-cafe-tycoon) | **Meow Meow Café Tycoon** — Roblox tycoon game (in progress) | Luau · Rojo |

## Client websites

| Project | What it is | Stack |
|---|---|---|
| [sports-association](./sports-association) | Public website and content admin for a national sports association | Firebase (Firestore, Storage, Auth) · vanilla JS |
| [zamil](./zamil) | MAYA GREEN storefront — single-page site for a Bangkok boutique | React · Vite · TypeScript · Tailwind |
| [TarmSung-Dev](./TarmSung-Dev) | Web studio site + 19 demo builds, incl. a full storefront/admin demo | HTML/CSS/JS · Cloudflare Pages + Functions · Node audit tooling |
| [customer-websites-2](./customer-websites-2) | Sites built for real clients | Static + Vite/React |

## Notes

- Source only — the git history of each project was not carried over.
- Credentials have been removed. Where a config value is required to run something, it
  reads `REPLACE_WITH_YOUR_...`; the relevant README says which file to edit.
- `freight-track` and `sports-association` were built for real clients. Their names, contact
  details and project IDs have been replaced with placeholders.
- Client-owned business details in `customer-websites-2` belong to those clients.
