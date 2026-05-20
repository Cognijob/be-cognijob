import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  console.error("Database connection string not found in environment variables.");
  process.exit(1);
}

console.log("Connecting to database:", connectionString.split("@")[1]);

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log("Connected successfully. Running migration SQL...");

    const sql = `
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "first_name" varchar(75);
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_name" varchar(75);
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "location" varchar(150);
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "whatsapp_number" varchar(20);
    `;

    await client.query(sql);
    console.log("Migration executed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await client.end();
  }
}

run();
