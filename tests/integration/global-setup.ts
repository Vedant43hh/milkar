// Runs once before the integration suite: checks the test database URL is safe, then migrates it.
import "dotenv/config";
import { execSync } from "node:child_process";

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example).");
  const dbName = new URL(url).pathname.slice(1);
  if (!/test/i.test(dbName) || url === process.env.DATABASE_URL) {
    throw new Error(`Refusing to run integration tests against "${dbName}": the database name must contain "test" and differ from DATABASE_URL.`);
  }
  return url;
}

export default function setup() {
  const url = testDatabaseUrl();
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}
