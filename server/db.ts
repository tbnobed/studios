import { Pool as PgPool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// Use regular PostgreSQL for all environments now
// This simplifies the setup and works both in development and Docker
const pool = new PgPool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? false : undefined
});

export const db = drizzle({ client: pool, schema });