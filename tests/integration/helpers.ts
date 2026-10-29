import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/server/db/schema";
import { ensureBaseOrganisation, ensureSystemRoles } from "@/server/bootstrap";
import { loadActor } from "@/server/auth/load-actor";
import type { Db } from "@/server/db/client";

const client = postgres(process.env.TEST_DATABASE_URL!, { max: 10, onnotice: () => {} });
export const db = drizzle(client, { schema }) as unknown as Db;

export async function resetDb() {
  const tables = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`);
  const names = tables.map((t) => `"${t.tablename}"`).join(", ");
  if (names) await db.execute(sql.raw(`truncate ${names} restart identity cascade`));
  await db.execute(sql`alter sequence trip_reference_seq restart with 1`);
  await ensureSystemRoles(db);
  await ensureBaseOrganisation(db);
}

let n = 0;
/** Creates an active user with the given system roles and returns their Actor. */
export async function makeActor(...roleKeys: string[]) {
  n += 1;
  const [user] = await db.insert(schema.users).values({ email: `user${n}-${Date.now()}@test.local`, name: `Test User ${n}` }).returning();
  for (const key of roleKeys) {
    const [role] = await db.select().from(schema.roles).where(eq(schema.roles.key, key));
    await db.insert(schema.userRoles).values({ userId: user!.id, roleId: role!.id });
  }
  return (await loadActor(db, user!.id))!;
}

export async function brandIds() {
  const rows = await db.select().from(schema.brands);
  const by = (slug: string) => rows.find((b) => b.slug === slug)!;
  return { ultima: by("ultima"), aya: by("aya"), schmidt: by("schmidt") };
}

export async function tripInput(overrides: Record<string, unknown> = {}) {
  const b = await brandIds();
  return {
    name: "Panorama Route & Lowveld Safari",
    primaryBrandId: b.ultima.id,
    guestFacingBrandId: b.ultima.id,
    adults: 2,
    children: 0,
    rooms: 1,
    currency: "ZAR" as const,
    startDate: "2027-05-10",
    endDate: "2027-05-15",
    participatingBrandIds: [b.aya.id],
    supplyingBrandIds: [b.schmidt.id],
    ...overrides,
  };
}

/** Actor with an ad-hoc role holding exactly these permissions (roles are configurable in the DB). */
export async function makeActorWithPermissions(...permissions: string[]) {
  n += 1;
  const [role] = await db.insert(schema.roles).values({ key: `custom_${n}_${Date.now()}`, name: `Custom ${n}` }).returning();
  if (permissions.length) await db.insert(schema.rolePermissions).values(permissions.map((permission) => ({ roleId: role!.id, permission })));
  const [user] = await db.insert(schema.users).values({ email: `custom${n}-${Date.now()}@test.local`, name: `Custom ${n}` }).returning();
  await db.insert(schema.userRoles).values({ userId: user!.id, roleId: role!.id });
  return (await loadActor(db, user!.id))!;
}
