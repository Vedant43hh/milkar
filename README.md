# Milkar

Group buying for Indian housing societies. Neighbours pool their grocery orders into one bulk order per society, so everyone pays the wholesale-tier price.

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
npm run db:seed             # demo society, suppliers, products and rounds (wipes the database first)
npm run dev                 # http://localhost:3000
```

## Tests

```bash
npm test                    # unit tests (pricing engine, rules, formatting)
npm run test:int            # integration tests against the milkar_test database
npm run test:e2e            # browser smoke tests (needs a seeded DB; starts `npm run start` if nothing is running)
npm run typecheck && npm run lint
```

Integration tests refuse to run unless `TEST_DATABASE_URL` points at a database whose name contains `test`.
Browser tests need Chromium once: `npx playwright install chromium`. They create a few throwaway users in the dev database; `npm run db:seed` resets it.

## Login

- Phone number + 6-digit OTP. With `OTP_MODE=mock` (the default) any 6 digits are accepted and the generated code is printed in the server console.
- OTP requests are rate-limited per phone (3 per 15 minutes, 10 per day) and per network (30 per 15 minutes, 200 per day); see `.env.example`.
- The server refuses to start in production with `OTP_MODE=mock` unless `DEMO_MODE=true`.
- With `DEMO_MODE=true`, `/login` shows one-tap buttons for the seeded demo users.
- New residents join through an invite link, `/join/<society code>` (the demo society's code is `GREENMDW`), then pick their tower and flat.

## Demo logins

Any 6-digit OTP works in mock mode.

| Role | Phone | Notes |
|---|---|---|
| Admin | 9000000001 | |
| Captain | 9000000002 | Tower B, Flat 402 |
| Resident | 9000000003 | Tower A, Flat 101 |
| Supplier | 9000000011 | Shree Balaji Wholesale Traders |
| Supplier | 9000000012 | Annapurna Home Care Distributors |

GST rates and GSTINs in the seed data are illustrative samples.
