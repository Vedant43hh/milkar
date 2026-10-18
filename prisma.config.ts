import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Neon/Vercel: point this at the direct (non-pooled) URL for migrations.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL,
  },
});
