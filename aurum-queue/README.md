# AURUM — online booking and queue system for salons and clinics

A booking system for beauty salons and aesthetic clinics: a one-screen booking desk for
customers, a self-service page to check, move or cancel a booking, and a six-screen back
office for staff. It runs entirely in the browser with no build step.

**Stack** — vanilla JavaScript (ES modules) · hand-written CSS · `localStorage` as the
data layer (swappable driver)

Original Thai notes: [`README.th.md`](./README.th.md) · build roadmap: [`queue.md`](./queue.md)

---

## Pages

| File | What it is |
|---|---|
| `index.html` | Sales page: problem, evidence, approach, how to choose, pricing, FAQ |
| `book.html` | Single-page booking desk: calendar + times, services, staff + confirm |
| `manage.html` | Customer looks up a booking by code or phone number, then moves or cancels it |
| `admin.html` | Back office, six screens: queue board, staff, services, reminders, stats, branding |

## Features

- **Availability that matches what can actually be booked** — subtracts off-shift time,
  breaks, staff leave, shop closures, existing bookings plus a setup/cleanup buffer, and a
  minimum lead time.
- **Booking-time re-check** — `book()` recomputes free gaps from current data and rejects a
  booking that does not fit inside a gap, instead of trusting what the UI displayed.
- **Three-pane booking desk with no wizard** — calendar, service and staff panes filter each
  other in any order; the confirm button states what is still missing.
- **Responsive layout** — three columns, then two with a sticky confirm bar, then stacked
  steps on narrow screens.
- **Reminders** — a 24-hour reminder queue that POSTs JSON to a configurable webhook (for
  example LINE, SMS gateway, Make, Zapier). Without a webhook it runs in a trial mode that
  records the message it would have sent.
- **White-label branding** — shop name, tagline, hue, intensity and dark/cream background;
  the whole palette is generated from one hue and the favicon follows.
- **Export / import** of the whole database as JSON from the branding screen.

## Layout

```
index.html, book.html, manage.html, admin.html
css/
  base.css          tokens, typography, motif, motion, atmosphere
  app.css           components, statuses, queue board
  book-minimal.css  "minimal" mode, loaded by book.html only (every rule scoped to body.minimal)
js/
  store.js          the single data layer (async, id-based); seeds demo data
  availability.js   free-slot calculation and the double-booking guard
  ui.js             app shell shared by every page: branding, nav, toasts, reveal effects
  booking.js        booking desk logic
  admin.js          the six admin screens
  reminders.js      reminder queue and webhook dispatch
queue.md            five-phase development roadmap (Thai)
```

## Running locally

No `package.json`, nothing to install. Serve the folder over HTTP (ES modules do not load
from `file://`), for example:

```bash
python3 -m http.server 8000      # then open http://localhost:8000/
```

or use the VS Code Live Server extension on `index.html`. On first load the store seeds a
small demo shop (staff, services, a few appointments) into the browser.

## Constraints / design notes

- **One data layer.** Every read and write goes through `js/store.js`. It currently persists
  to `localStorage` under the key `aurum.db.v1`; the driver is isolated at the bottom of the
  file so it can be replaced with a network backend without touching the pages. There is no
  server, so bookings live only in one browser and are not shared between devices.
- **One availability engine feeds three panes.** `daySlotMatrix(date)` returns, for a whole
  day, a map of time to service to available staff. The calendar, service list and staff
  list all read from that one structure, which is how selections filter each other
  consistently.
- **Reminder jobs are state-aware.** A booking made less than 24 hours ahead produces a
  `skipped` job; if it is later rescheduled further out, the job returns to `scheduled`
  (from both `reschedule()` and `reconcile()`). Jobs already `sent` or `failed` are left alone.
- **Per-page styling is scoped.** The minimal booking look is a separate stylesheet whose
  rules all start with `body.minimal`, so no other page changes. Removing the class and the
  `<link>` restores the default look.
- **Accessibility and Thai typography.** Reduced-motion mode disables the ambient effects
  while keeping pages fully readable; display line-height stays at or above 1.22 so Thai
  tone marks are not clipped.
- **Demo data is fictional.** The seed names and phone numbers in `js/store.js` are
  placeholders.
