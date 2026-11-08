# Procurement

A mini-ERP for procurement, built for a client company (one installation per client). It follows a purchase through request, quotation, approval, purchase order, goods receipt, invoice and payment, and enforces separation-of-duties rules in the database rather than in the UI.

**Stack** — Supabase (Postgres, Auth with Google sign-in, Row Level Security, Storage) · vanilla JS ES modules with no build step · bundled `supabase-js` (no CDN at runtime) · Thai / English UI

Original Thai deployment guide: [`README-deploy.md`](./README-deploy.md)

---

## Features

- **Purchase request (PR)** with a Scope of Work (SOW) that is locked before quoting.
- **RFQ** — printable request-for-quotation per vendor. A hash of the exact printed text is stored in `rfq_prints`.
- **Quotes** — keyed in per vendor with per-line prices, SOW acceptance, and comparison views. Vendors that do not accept the SOW terms are excluded automatically.
- **Budget check** — cost centers, projects, budgets and a ledger. Over-budget purchases need a budget exception approved by the CEO. Budgets can be optional per client.
- **Approval** by amount range, with configurable limits.
- **PO** issue and print, **goods receipt (GR)** with delivery lines, **invoice** with a mandatory attachment, three-way match between PO, GR and invoice, **payment voucher**, **payment**, withholding-tax rates and retention release.
- **Reports** — budget, stuck documents, vendor history, withholding tax (accounting and CEO only), and the audit trail (accounting and CEO only).
- **Users and roles** — requester, purchasing, inspector, PM, PD, CEO, accounting, admin. Invites by email or by link with an expiry and use count; removal of users with history deactivates the account instead of deleting it.
- **Audit trail** — every change is logged and cannot be edited or deleted.
- **i18n** — Thai and English dictionaries in `i18n/`.

## Layout

```
index.html                Sign-in (Google) and first-admin setup
home.html                 Landing page after login
pr.html  quotes.html  approve.html  po.html  gr.html  invoice.html  pay.html
reports.html  admin.html  Documents, reports, system settings
print/rfq.html, po.html   Print views
js/
  supabase.js             Client init; reads js/config.js
  config.example.js       Template for js/config.js (copy it, see Setup)
  auth.js  api.js         Session and role loading, data access
  rfq.js  po-doc.js       Shared builders for printed documents
  money.js  form.js  ui.js  i18n.js  sorttable.js  datefield.js  storage.js  audit-text.js
  vendor/                 supabase-js and a buffer shim, bundled locally
i18n/th.js, en.js         Translations
css/app.css, print.css
db/                       SQL, run in numeric order (see below)
README-deploy.md          Thai install guide
```

`db/` files:

- `01_schema.sql` tables and enums · `02_views.sql` computed numbers (quote totals, budget balance, vendor history, pending approvals) · `03_rls.sql` who can read what · `04_functions.sql` who can do what (award, issue PO, lock SOW, ...) · `05_triggers.sql` audit log, append-only enforcement, segregation of duties, document numbers · `06_seed.sql` defaults · `07_invites.sql` · `08_remove_user.sql`.
- `10` to `23` are later changes (storage bucket policy, budget made optional, SOW unlock, delivery lines, invoice attachment policy, payment edit, approval by price range, and others). `09_undo_account_expiry.sql` is only for installations that ran the retired account-expiry feature.
- `tests.sql` is the rule test suite.

## Setup

1. Create a new Supabase project per client and run the files in `db/` in numeric order in the SQL editor (`README-deploy.md` lists 01 to 08; run the later numbered files too if you want the current behavior, skipping `09_undo_account_expiry.sql` on fresh installs).
2. `js/config.js` is **intentionally not in the repo** (it is git-ignored, one per client). Copy the template and edit it:

   ```bash
   cp js/config.example.js js/config.js
   ```

   Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` (currently the `xxxx` placeholders) and optionally `DEFAULT_LANG`. Until this is done the app treats itself as unconfigured.
3. Enable the Google provider in Supabase Auth, sign in once with the client's account, and use the "set myself as first admin" button. It works only while no admin exists.

## Running locally

No build step. Serve the folder with any static server:

```bash
python3 -m http.server 8000
# open http://localhost:8000/index.html
```

## Tests

`db/tests.sql` runs against a database that already has `01` to `06` applied:

```bash
psql "$DATABASE_URL" -f db/tests.sql
```

It contains about 45 cases. Cases marked `[ห้าม]` ("forbidden") are actions the database must reject, and any case that gets through is reported as FAIL. The script leaves sample users behind; delete them (`email like '%@t.local'`) before real use.

## Constraints / design notes

- **Rules live in the database.** Role checks, segregation of duties, budget gating and the three-way match are RLS policies, functions and triggers, so the browser cannot bypass them from DevTools. The anon key in `config.js` is therefore safe to ship.
- **Segregation of duties.** The person who keyed a quote cannot approve that PR; a requester cannot approve their own request; whoever records a delivery cannot inspect it; whoever keyed an invoice cannot approve its payment; nobody can grant themselves a role, admins included.
- **Money is integers.** Amounts are stored as satang in `bigint` and rates as basis points (700 bp = 7.00%), never floats.
- **Append-only audit log.** A trigger blocks updates and deletes on `audit_log`, with no exceptions.
- **Views use `security_invoker`**, so reports respect the caller's RLS rather than the view owner's.
- **One client, one project.** Each installation is a separate Supabase project and a separate `config.js`, so client data is never in the same database.
- **No runtime CDN.** Libraries are vendored, so the app works on networks that block outbound traffic as long as Supabase is reachable.
- **RFQ hashing.** The text that is hashed and the text that is printed come from the same function (`js/rfq.js`) so the stored hash can later prove what was sent.
- **Users with history are deactivated, not deleted**, because procurement records reference the person in many places. Removing the underlying Auth user requires a service key and is done in the Supabase dashboard.
