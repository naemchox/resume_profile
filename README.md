# Portfolio

Selected projects. Each folder has its own README with architecture notes, how to run it,
and the constraints that shaped it.

| Project | What it is | Stack |
|---|---|---|
| [GameTranslator](./GameTranslator) | **Gloss** — always-on-top overlay that OCRs game text and translates it in place | Electron · Swift (Vision) · Win32 FFI · Tesseract · Claude API · Cloudflare Workers |
| [TarmSung-Dev](./TarmSung-Dev) | Web studio site + 19 demo builds, incl. a full storefront/admin demo | HTML/CSS/JS · Cloudflare Pages + Functions · Node audit tooling |
| [train-app](./train-app) | **Train With Myself** — schedule PWA where a rival avatar runs your own plan | React via CDN, no bundler · Service Worker · Supabase · th/en i18n |
| [scoreup](./scoreup) | TOEIC self-study PWA, offline-first — [live](https://scoreup-jek2026.netlify.app) | Single-file app · Service Worker · Google Apps Script |
| [arthid](./arthid) | Team chat, projects and meetings, with a Discord bot on the same data | Firebase · Cloud Functions 2nd gen · Discord Interactions |
| [pubchat](./pubchat) | Proximity chat for pubs — find people nearby, compass to meet up | Firebase · Firestore · Cloud Functions |
| [zamil](./zamil) | MAYA GREEN storefront — single-page site for a Bangkok boutique | React · Vite · TypeScript · Tailwind |
| [customer-websites-2](./customer-websites-2) | Sites built for real clients | Static + Vite/React |
| [iOS](./iOS) | **KruGeng** — SwiftUI app: stem separation, melody transcription, tab/MIDI export | SwiftUI |

## Notes

- Source only — the git history of each project was not carried over.
- Credentials have been removed. Where a config value is required to run something, it
  reads `REPLACE_WITH_YOUR_...`; the relevant README says which file to edit.
- Client-owned business details in `customer-websites-2` belong to those clients.
