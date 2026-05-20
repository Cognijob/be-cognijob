import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env.js";
import * as schema from "./schema.js";
const databaseUrl = new URL(env.DATABASE_URL);
const shouldUseSsl = databaseUrl.searchParams.get("sslmode") === "require";
if (shouldUseSsl) {
    databaseUrl.searchParams.delete("sslmode");
}
export const pool = new Pool({
    connectionString: databaseUrl.toString(),
    ssl: shouldUseSsl
        ? {
            rejectUnauthorized: false
        }
        : undefined
});
export const db = drizzle(pool, { schema });
export { schema };
