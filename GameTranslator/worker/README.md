# Gloss API — licence + AI proxy

The thing that makes Gloss sellable to someone who is not a developer. Without it the only way to
get AI features is to paste your own Anthropic key into Settings, which means an Anthropic org, a
card, a minimum top-up and a minted key — a chain most buyers do not finish. With it, the app works
the moment it is installed.

It also does two jobs you get for free once the AI runs through a server you control: it enforces a
monthly allowance (so a one-time price survives a heavy user), and it makes the AI the licence check
(a cracked build has no key of its own and this Worker will not answer it).

## What it costs to run

Measured against the real call sites, at Haiku 4.5 rates ($1/M in, $5/M out), roughly:

| action | cost | units charged |
|---|---|---|
| one translation | ฿0.06 | 1 |
| one word card (cached forever after) | ฿0.07 | 1 |
| one Write-mode sentence check | ฿0.05 | 1 |
| one AI screen read (OCR fallback) | ฿0.09 | 2 |

`PRO_CREDITS = 500` is a bundle bought once and never refilled, so the worst case is a one-off ฿100
(at the measured ฿0.20/read ceiling in PRICING.md §1) against a ฿290 price — 66% margin even if the
buyer burns the lot on day one. Real average use is nearer 300 reads in total. It was 1,500 *per
month*, which is a subscription with a one-time price tag; PRICING-AI.md §11 explains why that is the
one shape this category punishes. Cloudflare Workers' free tier covers the request volume; the AI is
the only real cost.

## Deploy

```sh
cd worker
npm i -g wrangler          # or npx wrangler for every command below

wrangler kv namespace create GLOSS_KV
#   -> paste the printed id into wrangler.toml under [[kv_namespaces]]

wrangler secret put ANTHROPIC_API_KEY
#   -> paste the Anthropic key that will pay for everyone's AI. This is the only place it exists.

wrangler deploy
```

`wrangler deploy` prints the live URL. If it is not `https://gloss-api.workers.dev`, set
`GLOSS_API` in the app's environment or edit the constant in `main.js` — that one line is the whole
client-side configuration.

Check it answered:

```sh
curl https://<your-worker-url>/health
```

## Lemon Squeezy setup

Lemon Squeezy is the merchant of record, so it handles checkout, cards, VAT, invoices and refunds —
none of which are worth building.

1. Create the store and a product for Gloss Pro.
2. On the product, turn on **Licence keys**.
3. Set **activation limit** to the number of machines one purchase should cover (3 is a normal
   choice — high enough not to annoy someone with a laptop and a desktop, low enough that a key
   posted publicly stops working quickly).
4. Buy your own product once with a test payment and confirm the key it emails you is accepted.

No API token is needed here: the Worker uses the public `validate` / `activate` endpoints, where the
licence key is itself the credential.

**Verify before relying on any of this** — payout support and available payment methods for a Thai
seller need checking against your own Lemon Squeezy dashboard, and the licence API shape should be
confirmed against their current docs rather than taken from this file.

## Endpoints

| | |
|---|---|
| `GET /health` | liveness |
| `GET /v1/quota` | current plan, used and remaining — costs no units |
| `POST /v1/messages` | the proxied call; body is an Anthropic Messages request |

Auth is by header: `x-gloss-licence` for a paid install, `x-gloss-device` for the free trial (a
random id the app mints on first run). A licence wins when both are sent.

`402` means the allowance is spent. It is the one status the app surfaces to the user as something
they can act on; everything else falls back quietly (a translation still arrives via Google).

## Things worth knowing before changing it

- **Requests are clamped, not rebuilt.** The model is forced to Haiku and `max_tokens` capped, but
  the prompt comes from the client. So a leaked licence could be pointed at prompts other than
  Gloss's. That is deliberate — rebuilding all five prompts here would duplicate them across two
  repos and they would drift — and the exposure is bounded by the same quota a real user has.
- **KV is eventually consistent.** Two racing requests can read the same count, so a user may slip a
  few units past the limit. Accepted: a Durable Object per licence is a lot of machinery to prevent
  an overrun worth a fraction of a baht.
- **Failed upstream calls refund their units.** If Anthropic rate-limits us or is down, the user is
  not charged for a request that produced nothing.
- **The free trial is a lifetime count, not monthly.** A trial that refills every month is not a
  trial.
