// Seeds the demo world described in seed-scenario.ts.
//
//   npm run db:seed      (wipes the database in DATABASE_URL first)
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEMO_USERS } from "../src/lib/demo";
import { formatINR } from "../src/lib/pricing/money";
import { buildWorld, writeWorld } from "./seed-scenario";
import { truncateAll } from "./truncate";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_PRODUCTION !== "true") {
    throw new Error("Refusing to seed in production. Set SEED_ALLOW_PRODUCTION=true for a demo database.");
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const { world } = buildWorld(new Date());
  const { rec } = world;

  try {
    console.log("Clearing existing data…");
    await truncateAll(prisma);
    await writeWorld(prisma, world);

    const unread = rec.notifications.filter((n) => !n.readAt).length;
    console.log(`Seeded ${rec.communities.length} communities, ${rec.flats.length} flats, ${rec.users.length} users, ${rec.vendors.length} vendors.`);
    console.log(`Catalogue: ${rec.products.length} products, ${rec.services.length} services (${rec.serviceOptions.length} options).`);
    console.log(
      `Rounds: ${rec.rounds.length} (${rec.rounds.filter((r) => r.status === "OPEN").length} open), ${rec.bookings.length} bookings, ${rec.visits.length} visits, ${rec.ratings.length} ratings.`,
    );
    console.log(`Polls: ${rec.polls.length}, ${rec.votes.length} votes. Notifications: ${rec.notifications.length} (${unread} unread).`);
    console.log(`Wallet credit outstanding: ${formatINR([...world.wallet.values()].reduce((a, b) => a + b, 0))}`);
    console.log("\nDemo logins (any 6-digit OTP in mock mode):");
    for (const u of Object.values(DEMO_USERS)) console.log(`  ${u.role.padEnd(10)} ${u.phone.slice(3)}  ${u.name}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
