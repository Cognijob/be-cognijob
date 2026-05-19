import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Gunakan DIRECT_URL untuk migrations (bukan pooler)
    // Pooler tidak support DDL statements yang dibutuhkan drizzle-kit
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
    ssl: { rejectUnauthorized: false } as any
  }
});
