// Runs before each integration test file, before any app module is imported.
import "dotenv/config";
import { testDatabaseUrl } from "./global-setup";

process.env.DATABASE_URL = testDatabaseUrl();
