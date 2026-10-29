import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/server/db/schema";
import { ensureBaseOrganisation, ensureSystemRoles } from "../src/server/bootstrap";
import { hashPassword } from "../src/server/auth/crypto";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const sql = postgres(url, { max: 1 });
const db = drizzle(sql, { schema });

await db.transaction(async (tx) => {
  await ensureSystemRoles(tx);
  await ensureBaseOrganisation(tx);
  const [anyUser] = await tx.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (!anyUser) {
    const email = process.env.SEED_ADMIN_EMAIL;
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!email || !password || password.length < 12) throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (12+ chars) to create the first administrator.");
    const [user] = await tx.insert(schema.users).values({ email, name: "System Administrator", passwordHash: await hashPassword(password) }).returning();
    const [owner] = await tx.select().from(schema.roles).where(eq(schema.roles.key, "owner"));
    await tx.insert(schema.userRoles).values({ userId: user!.id, roleId: owner!.id });
    console.log(`Created administrator ${email}`);
  }
});
console.log("Seed complete.");
await sql.end();
