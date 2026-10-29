/**
 * OPT-IN demonstration data for interface review. Every record is flagged is_demo and shown with a
 * "Demo" badge. Names are fictional; no supplier prices are created. Never run against production.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/server/db/schema";
import { loadActor } from "../src/server/auth/load-actor";
import { createTrip, recordCommercialApproval, transitionTrip } from "../src/server/services/trips";
import type { Db } from "../src/server/db/client";

if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production");
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const db = drizzle(sql, { schema }) as unknown as Db;

const [demoExists] = await db.select().from(schema.trips).where(eq(schema.trips.isDemo, true)).limit(1);
if (demoExists) {
  console.log("Demo data already present.");
  process.exit(0);
}
const [admin] = await db.select().from(schema.users).limit(1);
const actor = (await loadActor(db, admin!.id))!;
const brands = await db.select().from(schema.brands);
const b = (slug: string) => brands.find((x) => x.slug === slug)!.id;

const guests = await db.insert(schema.guests).values([
  { firstName: "Eleanor", lastName: "Whitcombe", email: "eleanor.w@example.com", nationality: "GB", preferences: "Prefers slow mornings and private dining.", isDemo: true },
  { firstName: "Marcus", lastName: "Adeyemi", email: "m.adeyemi@example.com", nationality: "US", isDemo: true },
  { firstName: "Sofia", lastName: "Lindqvist", email: "sofia.l@example.com", nationality: "SE", isDemo: true },
  { firstName: "Hiroshi", lastName: "Tanaka", email: "h.tanaka@example.com", nationality: "JP", isDemo: true },
]).returning();

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const plan: { name: string; lead: number; start: number; len: number; brand: string; path: string[]; est?: string; cur?: "ZAR" | "USD" | "GBP"; dest: string; approve?: boolean; participating?: string[]; supplying?: string[] }[] = [
  { name: "Panorama Route Classic & Lowveld Safari", lead: 0, start: 21, len: 6, brand: "ultima", path: ["discovery", "concept", "draft_itinerary", "costing"], est: "485000.00", dest: "Hoedspruit & Panorama Route", participating: ["aya"], supplying: ["schmidt"] },
  { name: "Private Sabi Sand Retreat", lead: 1, start: 48, len: 5, brand: "aya", path: ["discovery", "concept"], est: "38500.00", cur: "USD", dest: "Sabi Sand" },
  { name: "Anniversary Escape — Blyde & Klaserie", lead: 2, start: 12, len: 4, brand: "ultima", path: ["discovery"], est: "260000.00", dest: "Blyde River Canyon", participating: ["aya"] },
  { name: "Lowveld Motoring Weekend", lead: 3, start: 75, len: 3, brand: "ultima", path: [], dest: "Graskop", supplying: ["schmidt"] },
  { name: "Timbavati Family Safari", lead: 1, start: 34, len: 7, brand: "aya", path: ["discovery", "concept", "draft_itinerary", "costing", "internal_review", "quote_ready"], est: "52000.00", cur: "USD", dest: "Timbavati", approve: true },
];

for (const p of plan) {
  const t = await createTrip(db, actor, {
    name: p.name, primaryBrandId: b(p.brand), guestFacingBrandId: b(p.brand), leadGuestId: guests[p.lead]!.id,
    startDate: day(p.start), endDate: day(p.start + p.len), adults: 2, children: p.name.includes("Family") ? 2 : 0, rooms: p.name.includes("Family") ? 2 : 1,
    currency: p.cur ?? "ZAR", estimatedValue: p.est ?? "", primaryDestination: p.dest,
    participatingBrandIds: (p.participating ?? []).map(b), supplyingBrandIds: (p.supplying ?? []).map(b),
    occasion: p.name.includes("Anniversary") ? "25th wedding anniversary" : "", internalNotes: "Demonstration record.",
  }, { isDemo: true });
  let v = t.version;
  if (p.approve) { await recordCommercialApproval(db, actor, t.id, v); v += 1; }
  for (const to of p.path) v = (await transitionTrip(db, actor, t.id, { to, expectedVersion: v })).version;
}
console.log("Demo data created (flagged is_demo).");
await sql.end();
