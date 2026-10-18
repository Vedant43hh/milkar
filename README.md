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
npm run typecheck && npm run lint
```

Integration tests refuse to run unless `TEST_DATABASE_URL` points at a database whose name contains `test`.

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
