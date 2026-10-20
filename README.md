# Milkar

Group buying for Indian residential communities: apartment societies, gated communities, PGs and co-living, hostels and office campuses. Neighbours pool grocery orders and book home services (AC servicing, deep cleaning, pest control, car wash…) together, so everyone pays the group price.

> Work in progress. This README covers local setup; the full guide (architecture, pricing rules, deployment, screenshots) comes in a later phase.

## Requirements

- Node.js 22+
- Docker Desktop (for PostgreSQL)

## Setup

```bash
npm install                 # also generates the Prisma client
cp .env.example .env
npm run db:up               # PostgreSQL 16 on localhost:5433 (databases: milkar, milkar_test)
npm run db:deploy           # apply migrations
npm run db:seed             # demo communities, vendors, rounds, Service Days, polls, notifications (wipes the database first)
npm run dev                 # http://localhost:3000
```

## Tests

```bash
npm test                    # unit tests (pricing engine, rules, formatting)
npm run test:int            # integration tests against the milkar_test database
npm run test:e2e            # browser tests incl. accessibility (axe) and a reload-loop guard; needs a seeded DB
E2E_DEV=1 npm run test:e2e  # the same against a running `npm run dev` (longer timeouts for on-demand compiles)
npm run measure:js          # compressed JavaScript per key page, against `npm run start`
npm run typecheck && npm run lint
```

`test:e2e` starts `npm run start` if nothing is listening; point it elsewhere with `E2E_BASE_URL`.

## How pricing works

- Every vendor price is a tier ladder, GST-exclusive. Residents pay vendor price + platform margin, then GST on both. Money is integer paise.
- **Groceries** reach tiers on **units** bought community-wide (each product on its own). **Service Days** reach tiers on **distinct flats** booked across all options of the service (family members and a second AC count once), and need a minimum number of flats.
- New units are charged at the tier *before* the change; when the group unlocks a better tier, everyone gets the difference back in their wallet at cutoff. Nobody ever pays more than they were charged (price protection).
- Reductions freeze 12 hours before cutoff, each offering has a per-flat cap, and quotes expire after 15 minutes.
- The pure engine lives in `src/lib/pricing/`, `src/lib/services/` (visit lifecycle, no-access refunds, 48-hour issues, slots) and `src/lib/polls.ts`, all unit-tested.

## Design system

Tokens (colours for light and dark, radius, shadows, motion) live in `src/app/globals.css`; components in `src/components/ui/`; the app shells in `src/components/shell/`. Open **`/design`** (development or `DEMO_MODE=true`) for a living style guide of every component in both themes. Dark mode follows the system setting by default; residents can override it in the account menu.

Integration tests refuse to run unless `TEST_DATABASE_URL` points at a database whose name contains `test`.
Browser tests need Chromium once: `npx playwright install chromium`. They change the dev database (new users, rounds, a converted poll), so run `npm run db:seed` before each run of the suite.

After a schema change (`prisma generate`), restart `npm run dev`: the dev server keeps its Prisma client across hot reloads.

## Captain tools (`/captain`)

- **Open a grocery round:** pick products (all ticked by default), the per-flat limit for each, the cutoff and delivery time. Prices are snapshotted from the catalogue when the round opens.
- **Open a Service Day:** pick a vendor's service, up to three dates and the cutoff. Time slots come from the vendor's templates (capacity = technicians). "Repeat every week" makes next week's round open automatically at cutoff.
- **Live dashboard** (`/captain/rounds/<id>`, refreshes every 30 seconds): flats, units and money collected; the items closest to a better price; slot load; recent orders. Share it on WhatsApp with an invite link that also lets new neighbours join; extend the cutoff, close orders now, or cancel with a reason. Cancelling refunds everyone exactly what they paid, to their wallet, under the same row lock checkout uses.
- **Interest polls:** publish a poll (the threshold defaults to the service's minimum flats), publish or dismiss residents' suggestions, and open a pre-filled round in one tap once enough flats vote. Votes count once per flat; the captain is notified once when the threshold is crossed, and a double tap opens only one round.
- Every round has a stable link, `/round/<id>`, used in notifications and invites.

## Login

- Phone number + 6-digit OTP. With `OTP_MODE=mock` (the default) any 6 digits are accepted and the generated code is printed in the server console.
- OTP requests are rate-limited per phone (3 per 15 minutes, 10 per day) and per network (30 per 15 minutes, 200 per day); see `.env.example`.
- The server refuses to start in production with `OTP_MODE=mock` unless `DEMO_MODE=true`.
- With `DEMO_MODE=true`, `/login` shows one-tap buttons for the seeded demo users.
- New residents join through an invite link, `/join/<community code>`, then pick their tower and flat (each community names these itself: a PG has wings and rooms). Demo codes: `GREENMDW` (Green Meadows CHS, Pune) and `SUNRISE` (Sunrise Co-living, Bengaluru).

## Notifications

Stored per user as a type plus parameters and rendered through `src/i18n` when read. The bell shows the unread count; `/notifications` (and `/vendor/notifications`, `/admin/notifications`) lists them. Sends are idempotent per user via a dedupe key. Push and SMS are stubs: set `NOTIFY_STUBS=log` to print what they would send.

## Demo logins

Any 6-digit OTP works in mock mode.

| Role | Phone | Name | Notes |
|---|---|---|---|
| Resident | 9000000003 | Rahul Deshmukh | Green Meadows, Flat A-101: orders, an AC booking, a held car-wash slot, a resolved complaint |
| Captain | 9000000002 | Sunita Kulkarni | Green Meadows, Flat B-402: a poll past its threshold and a resident suggestion |
| Resident | 9000000004 | Arnav Sinha | Sunrise Co-living (PG), Room A-103 |
| Vendor | 9000000013 | Suresh Pillai | CoolCare AC & Appliance (verified) |
| Vendor | 9000000014 | Nisha Thomas | SparkleHome Cleaning & Pest Control (verified, rated) |
| Vendor | 9000000015 | Manoj Yadav | WashWell Car Wash (verification pending) |
| Vendor | 9000000011 | Ramesh Agarwal | Shree Balaji Wholesale Traders (groceries) |
| Vendor | 9000000012 | Imran Shaikh | Annapurna Home Care Distributors (groceries) |
| Admin | 9000000001 | Priya Nair | |

The seed (`prisma/seed-scenario.ts`) prices every order through the real engine, on one timeline, so wallets, tier unlocks, refunds and notifications agree. It includes two completed grocery rounds and one open round; a completed deep-cleaning Service Day (ratings, a complaint fixed by a free revisit, a no-access visit with the visit fee kept); an open AC Service Day at 14 flats (6 more unlock ₹400, some slots full); a weekly car wash with last week's slots held for 24 hours; and four interest polls. GST rates and GSTINs are illustrative samples.

## Database migrations

`20261020090000_round_cancel_reason` adds the reason a captain gives when cancelling a round.

`20261019090000_communities_services_polls` renames Society→Community, Supplier→Vendor, RoundProduct→RoundOffering, DeliveryIssue→OrderIssue and SupplierPurchaseOrder→VendorOrder with `ALTER … RENAME`, so existing data is kept; `prisma migrate diff` against the schema is empty afterwards.
