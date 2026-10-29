import "dotenv/config";
import postgres from "postgres";
import { runMigrations } from "../../scripts/migrate";

/** Rebuilds the test database schema from migrations once per run (verifies migrations apply cleanly). */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  if (!/test/.test(new URL(url).pathname)) throw new Error("Refusing to reset a database whose name does not contain 'test'");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql`drop schema if exists public cascade`;
  await sql`drop schema if exists drizzle cascade`;
  await sql`create schema public`;
  await sql.end();
  await runMigrations(url);
}
