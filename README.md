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

## Portals and roles

Every account has one role and one portal. Nobody can enter another role's portal: every page, server action and route handler checks with `requirePortal()` (`src/lib/auth/current-user.ts`, rules in `src/lib/auth/rules.ts`).

| Portal | Path | Who | Navigation | Accent |
|---|---|---|---|---|
| Resident | `/app` | residents with an approved flat | bottom tabs: Home, Group buys, Orders, Wallet | teal |
| Society Manager | `/manager` | the manager (or an assistant) of one community | sidebar, a drawer on phones | indigo |
| Vendor | `/vendor` | grocery shops, wholesalers and service companies | sidebar, a drawer on phones | orange |
| Technician | `/tech` | a vendor's staff, added by the vendor | bottom tabs: Today, Upcoming, Me | sky blue |
| Platform admin | `/admin` | Milkar staff; never self-registered | sidebar, a drawer on phones | plum |

Opening another role's portal shows a friendly page ("This area is for Society Managers") with a button to your own, not a silent redirect; server actions answer with a 403. Society Managers run their community through `CommunityStaff` and don't use the resident app: to shop, they use a separate resident account. `/round/<id>` sends each role to the right page for a round.

## Landing, registering and logging in

- `/` is the public landing page: how group buying works, a price-drop simulator (slide from 1 to 100 flats and watch the price per flat, the building's savings and the vendor trips fall; the numbers in `src/lib/simulator.ts` are a labelled example), why vendors can charge less, and a card per role. `/welcome` asks "new or already have an account?".
- **Logging in never creates an account.** A number nobody registered gets "No account with this number yet" and a link to register.
- **`/register`** asks how you'll use Milkar, then walks through that role's steps and verifies your phone last. The account and its request are created together, in one transaction (`src/server/registration.ts`):
  - **Resident:** find your community by invite code or by searching live communities (name, city or pincode), pick your tower and flat, and your Society Manager approves you in `/manager/residents`. Until then `/app/join` shows the request (withdraw it, or ask again after a decline, with the manager's note). Invite links, `/join/<community code>`, open this with the community filled in. Demo codes: `GREENMDW` (Green Meadows CHS, Pune) and `SUNRISE` (Sunrise Co-living, Bengaluru).
  - **Society Manager:** the community's name, type and address, what it calls buildings and homes, and its layout (buildings × floors × homes per floor; flats are numbered floor × 100 + unit, up to 2,000). The community waits for a platform admin (`/admin/communities`); then the manager gets the invite link and code.
  - **Vendor:** business name, what you offer (groceries, home services, repairs), service-area pincodes and an optional GSTIN (its check digit is verified). The vendor portal shows a verification checklist until an admin verifies you in `/admin/vendors`.
  - **Technicians** don't register: their vendor adds them in `/vendor/technicians`, then they log in with their phone.
  - **Admins can never be self-registered.** The role isn't offered, and the server refuses any role other than resident, Society Manager or vendor, however the request is made.
- Every decision (approve, decline with a note, verify) notifies the person it's about, and new registrations notify whoever decides them.
- After the first login to a set-up account, a short skippable tour introduces the portal; it's saved as seen (`User.onboardedAt`).

## How pricing works

- Every vendor price is a tier ladder, GST-exclusive. Residents pay vendor price + platform margin, then GST on both. Money is integer paise.
- **Groceries** reach tiers on **units** bought community-wide (each product on its own). **Service Days** reach tiers on **distinct flats** booked across all options of the service (family members and a second AC count once), and need a minimum number of flats.
- New units are charged at the tier *before* the change; when the group unlocks a better tier, everyone gets the difference back in their wallet at cutoff. Nobody ever pays more than they were charged (price protection).
- Reductions freeze 12 hours before cutoff, each offering has a per-flat cap, and quotes expire after 15 minutes.
- The pure engine lives in `src/lib/pricing/`, `src/lib/services/` (visit lifecycle, no-access refunds, 48-hour issues, slots) and `src/lib/polls.ts`, all unit-tested.

## Design system

Tokens (a warm palette for light and dark, radius, shadows, motion) live in `src/app/globals.css`, with every text colour checked for WCAG AA contrast. Each portal's shell sets `data-portal`, which re-points the brand colour to that portal's accent, so buttons, links, active tabs and focus rings show where you are. Components are in `src/components/ui/` (including a step-by-step `Wizard`, `NeighbourFlats`, a swipeable `ChipScroller` and `PullToRefresh`); the shells are in `src/components/shell/`. Page transitions use React's `<ViewTransition>` and plain CSS (no motion library), and switch off with reduced motion. Open **`/design`** (development or `DEMO_MODE=true`) for a living style guide in both themes. Dark mode follows the system setting by default; anyone can override it in the account menu.

Integration tests refuse to run unless `TEST_DATABASE_URL` points at a database whose name contains `test`.
Browser tests need Chromium once: `npx playwright install chromium`. They change the dev database (new users, rounds, a converted poll), so run `npm run db:seed` before each run of the suite.

After a schema change (`prisma generate`), restart `npm run dev`: the dev server keeps its Prisma client across hot reloads.

**Translations and the browser bundle:** `src/i18n/en.ts` holds every string, and server code uses `t()`. Client components must not import it; they use `tu()` with the small shared dictionary in `src/i18n/en-ui.ts` (navigation, timers, prices, meters…), or receive text from the server (a namespace such as `messages().shop` as a prop, or already-translated action results). `src/i18n/client-boundary.test.ts` fails if anything a client component imports reaches the full dictionary.

## Residents

- **Groceries** (`/app/groceries`): every product with its price now, MRP, the per-flat limit and a live meter. Steppers change the cart instantly and the meter previews the community total with your change; **Review** asks the server for an exact price. Reductions and cancellations work until the freeze (12 hours before cutoff), additions until the cutoff.
- **Checkout:** if the wallet covers the change (or it only removes units) it is applied at once. Otherwise you pay the rest: on the built-in **test UPI screen** (`/app/pay/<id>`, pay or cancel, nothing is charged), or with **Razorpay in test mode** when `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are set (UPI shown first; the signature is verified on the server). A payment holds its price for 15 minutes. When the money arrives, everything is re-checked under the round lock and a per-resident wallet lock; if the order changed meanwhile (another tab, a family member hit the limit, the freeze started, the round closed or was cancelled), the money goes to the wallet instead.
- **Price unlocks:** the order that takes a product into a better tier shows a celebration, and everyone holding that product is notified once.
- **Services** (`/app/services`, then `/app/services/<id>`): each open Service Day with its vendor (Verified badge, rating), a meter of flats booked, and the price per unit for each option. Pick units, then a time slot; full slots are greyed out. Checkout works like groceries, and the seat in the slot is taken in the same transaction that records the payment: if the slot filled up while you were paying, the money goes to your wallet and you're asked to pick another. Change slot for free until the cutoff; removing every unit cancels the booking and frees the seat. On weekly rounds, "keep this slot every week" holds your slot in next week's round for 24 hours, prefilled with this week's order; with "pay from my wallet automatically" it's booked for you when the wallet covers it.
- **Polls** (`/app/polls`): "I'd join this" (one vote per flat, updated instantly), and **Suggest something** for your Society Manager (up to 3 waiting).
- **Home:** chips for the four kinds of group buy (groceries, home services, repairs, subscriptions) with what's open in each; a card per open group buy with today's price against MRP, how many more flats or packs unlock the next price, a countdown and the flats that have joined (numbers only, never names); money saved this month and the wallet; upcoming visits with their completion code; a held weekly slot to confirm; the community's impact; the polls closest to their threshold. With nothing open, it points to the polls. Pull down on a phone to refresh this and the other resident lists.
- **Group buys** (`/app/buys`, then `/app/buys/<category>`): the same cards, one kind at a time.
- **Community impact:** money saved together against MRP, and vendor trips avoided: every flat buying alone means a delivery per shop and a trip per visit, while together a vendor makes one trip per grocery round and one per day of a Service Day. Distance, fuel and CO₂ follow from those trips through stated assumptions (8 km a trip, 0.04 L of fuel per km, 2.3 kg of CO₂ per litre; `src/lib/impact.ts`), shown as estimates with how they're worked out.
- **Orders** (`/app/orders`, then `/app/orders/<round>`): every round you ordered in or your flat booked, with what you paid, what came back to the wallet and why (reductions, better tiers at cutoff, dropped items, short or damaged goods, no-access visits, cancellations, complaints) and what it cost in the end; the pickup code and delivery for groceries; for services, each visit's timeline (scheduled, on the way, started, done; or couldn't get in, or cancelled), the technician and the completion code until the job is done.
- **Rating and complaints:** anyone in the flat can rate a finished visit from 1 to 5 once (the vendor's average updates with it), and report a problem within 48 hours of the visit ending: a job not done properly, or a no-access fee they dispute. One complaint per visit; the community's Society Managers are notified, and the household gets a receipt. Resolving it (one free revisit or a refund) comes with the manager portal.
- **GST invoices** (`/app/orders/<round>/invoice`): once a round is confirmed, an invoice from Milkar for your confirmed items at their final prices, each split into taxable value and GST (CGST + SGST inside Milkar's state, IGST to another; the state comes from the GSTIN and the pincode), with a tax summary per rate and the round's payments and refunds. Print it or save it as a PDF. Without `PLATFORM_GSTIN` it is marked as a sample.
- **Wallet** (`/app/wallet`): the balance and the full ledger, each entry with its reason and a link to its order.

## Society Manager portal (`/manager`)

- **Open a grocery round:** pick products (all ticked by default), the per-flat limit for each, the cutoff and delivery time. Prices are snapshotted from the catalogue when the round opens.
- **Open a Service Day:** pick a vendor's service, up to three dates and the cutoff. Time slots come from the vendor's templates (capacity = technicians). "Repeat every week" makes next week's round open automatically at cutoff.
- **Live dashboard** (`/manager/rounds/<id>`, refreshes every 30 seconds): flats, units and money collected; the items closest to a better price; slot load; recent orders. Share it on WhatsApp with an invite link that also lets new neighbours join; extend the cutoff, close orders now, or cancel with a reason. Cancelling refunds everyone exactly what they paid, to their wallet, under the same row lock checkout uses.
- **Interest polls:** publish a poll (the threshold defaults to the service's minimum flats), publish or dismiss residents' suggestions, and open a pre-filled round in one tap once enough flats vote. Votes count once per flat; the manager is notified once when the threshold is crossed, and a double tap opens only one round.
- Every round has a stable link, `/round/<id>`, used in notifications and invites.
- **Close now** stops orders and runs the cutoff for that round straight away. Once a round is finalized, its dashboard shows the results: what was confirmed and at what price, what fell short of its minimum, money back to wallets, what's owed to vendors, the cost of price protection, pickup codes or visits, the vendor orders, and next week's round for a weekly Service Day.

## Cutoff and scheduled jobs

When a round's cutoff passes, the cutoff job finalizes it in one transaction under the round lock:

- Final prices come from the pure engine. Anyone who paid more than the final price gets the difference back in their wallet; anything that didn't reach its minimum (a grocery item, or a whole Service Day short of flats) is refunded in full. Each refund is one wallet entry per order item with a unique key, so a retried or overlapping run can never pay twice.
- Each vendor gets one order (a purchase order for goods, a job sheet for services) at their tier price plus GST, and is notified.
- **Groceries:** every flat with something confirmed gets a 4-digit pickup code for distribution.
- **Service Days:** every booked flat gets a visit in its slot with its own 4-digit completion code, sent to everyone in the flat with units. Holds nobody confirmed are cancelled and their seats freed.
- **Weekly Service Days** open next week's round (same service, same days and times a week later; only once per round). Flats that ticked "keep my slot" get that slot held for 24 hours, prefilled with last week's order. With auto-pay on and enough in the wallet (this week's refunds count) it's booked and paid there and then; otherwise the resident is asked to confirm and pay. A kept slot that's gone or full is skipped.
- Residents hear about refunds, confirmed rounds, visits and held or auto-booked slots; payments still waiting at the gateway expire, and money that arrives later goes to the wallet.

Alongside it, residents get a "closes soon" reminder 6 hours before cutoff (once per round; not for rounds opened inside that window), and weekly holds that ran out are released.

**How the jobs run:** with `CRON_TICK_SECONDS` set (60 in `.env.example`), the server runs them itself every that many seconds, which suits one long-running server and local development. On serverless hosting, set it to 0 and have a scheduler call `GET /api/cron` with `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this header automatically). Every step is idempotent and takes the same locks as checkout, so overlapping runs are safe.

## Login

- Phone number + 6-digit OTP. With `OTP_MODE=mock` (the default) any 6 digits are accepted and the generated code is printed in the server console.
- OTP requests are rate-limited per phone (3 per 15 minutes, 10 per day) and per network (30 per 15 minutes, 200 per day); see `.env.example`.
- The server refuses to start in production with `OTP_MODE=mock` unless `DEMO_MODE=true`.
- With `DEMO_MODE=true`, `/login` shows one-tap buttons for the seeded demo users, each labelled "Demo".

## Notifications

Stored per user as a type plus parameters and rendered through `src/i18n` when read. The bell shows the unread count; each portal has its own list (`/app/notifications`, `/manager/notifications`, `/vendor/notifications`, `/tech/notifications`, `/admin/notifications`). Sends are idempotent per user via a dedupe key. Push and SMS are stubs: set `NOTIFY_STUBS=log` to print what they would send.

## Demo logins

Any 6-digit OTP works in mock mode.

| Role | Phone | Name | Notes |
|---|---|---|---|
| Resident | 9000000003 | Rahul Deshmukh | Green Meadows, Flat A-101: orders, an AC booking, a held car-wash slot, a resolved complaint, yesterday's chimney visit to rate or complain about |
| Resident | 9000000005 | Kavya Deshpande | Green Meadows, Flat B-402: groceries, a deep clean, yesterday's chimney visit to rate, poll votes; hasn't booked the AC Service Day |
| Resident | 9000000004 | Arnav Sinha | Sunrise Co-living (PG), Room A-103 |
| Resident | 9000000008 | Nikhil Bhosale | Asked to join Green Meadows as Flat C-301; waiting for Sunita |
| Society Manager | 9000000002 | Sunita Kulkarni | Runs Green Meadows: a poll past its threshold and a resident suggestion |
| Society Manager | 9000000006 | Deepak Rao | Assistant manager at Green Meadows |
| Society Manager | 9000000007 | Anil Kapoor | Registered Lakeview Residency, Pune (48 flats); waiting for the admin |
| Vendor | 9000000013 | Suresh Pillai | CoolCare AC & Appliance (verified) |
| Vendor | 9000000014 | Nisha Thomas | SparkleHome Cleaning & Pest Control (verified, rated) |
| Vendor | 9000000015 | Manoj Yadav | WashWell Car Wash (verification pending) |
| Vendor | 9000000011 | Ramesh Agarwal | Shree Balaji Wholesale Traders (groceries) |
| Vendor | 9000000012 | Imran Shaikh | Annapurna Home Care Distributors (groceries) |
| Technician | 9000000021 | Raju Thapa | WashWell: this week's car-wash visits |
| Technician | 9000000022 | Lata Pawar | SparkleHome: the completed deep-clean visits |
| Admin | 9000000001 | Priya Nair | Lakeview Residency and WashWell are waiting for her |

The seed (`prisma/seed-scenario.ts`) prices every order through the real engine, on one timeline, so wallets, tier unlocks, refunds and notifications agree. It includes two completed grocery rounds and one open round; a completed deep-cleaning Service Day (ratings, a complaint fixed by a free revisit, a no-access visit with the visit fee kept); a kitchen chimney cleaning day finished yesterday, where Rahul's and Kavya's visits are still waiting for a rating and can still get a complaint; an open AC Service Day at 14 flats (6 more unlock ₹400, some slots full); a weekly car wash with last week's slots held for 24 hours; and four interest polls. GST rates and GSTINs are illustrative samples.

## Database migrations

`20261022090000_issue_reported_notification` adds the notification Society Managers get when a resident reports a problem with a visit.

`20261021150000_registration_notifications` adds the notifications sent when a community or a vendor registers.

`20261021090000_portals_and_roles` renames the `CAPTAIN` role to `MANAGER` and adds `TECHNICIAN`; existing captains become their community's primary Society Manager in `CommunityStaff`. It adds community approval (existing communities stay approved), join requests (one open request per user, enforced by a unique column and a check constraint), vendor categories and service areas, and the technician on each visit, and rewrites links stored in notifications to the new portal paths. Old paths such as `/groceries` and `/captain/...` redirect to their new homes.

`20261020090000_round_cancel_reason` adds the reason a manager gives when cancelling a round.

`20261019090000_communities_services_polls` renames Society→Community, Supplier→Vendor, RoundProduct→RoundOffering, DeliveryIssue→OrderIssue and SupplierPurchaseOrder→VendorOrder with `ALTER … RENAME`, so existing data is kept; `prisma migrate diff` against the schema is empty afterwards.
