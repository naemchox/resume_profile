# Client websites

Sites built for real businesses. Each folder is self-contained and can be served as-is.

| Folder | Client | Notes |
|---|---|---|
| `Maya Green/` | MAYA GREEN — cannabis boutique, Ekkamai, Bangkok | React + Vite + Tailwind |
| `Highland cafe 2/` | Highland Cafe | Static site |
| `House and Home/` | House and Home | Static site |
| `ช่างเจมส์/` | ช่างเจมส์ (contractor) | Static site |
| `salmon-site/` | Salmon | Static site |
| `zamil/` | ZAMIL storefront shell | React + Vite + Tailwind; the base `Maya Green` was built from |
| `customer_websites/` | Earlier collection | Kept for reference |

## Running one

Static folders need nothing but a server:

```bash
npx serve "Highland cafe 2"
```

The Vite projects build normally:

```bash
cd zamil
npm install
npm run dev       # http://localhost:5173
npm run build     # -> dist/
```

## On accuracy

`zamil` and `Maya Green` each carry a `FACTS.md`. The rule those sites are built under is
that **a claim not listed there as CONFIRMED does not go on the page** — no invented
hours, no social links for accounts that were never found, no stock photography standing
in for the client's own. When the photo library turned out to hold seven distinct frames
rather than eight, the category tiles became typographic instead of padding the page with
a duplicate crop.

Published business details in these folders belong to the clients.
