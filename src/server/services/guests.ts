import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { guestSchema, type GuestInput } from "@/lib/validation/guest";
import { type Actor, can, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit";
import type { Db } from "@/server/db/client";
import { guests, trips } from "@/server/db/schema";
import { notFound } from "@/server/errors";
import { tripScope } from "./trips";

type GuestRow = typeof guests.$inferSelect;
const SENSITIVE = ["dietary", "accessibility", "medicalNotes"] as const;

/** Removes sensitive fields for actors without guest.read_sensitive. Applied to every guest read. */
function redact(actor: Actor, g: GuestRow) {
  if (can(actor, "guest.read_sensitive")) return { ...g, sensitiveRedacted: false };
  const copy = { ...g, sensitiveRedacted: true };
  for (const k of SENSITIVE) copy[k] = null;
  return copy;
}

export async function listGuests(db: Db, actor: Actor, q = "") {
  requirePermission(actor, "guest.read");
  const term = `%${q.trim()}%`;
  const rows = await db
    .select({ id: guests.id, firstName: guests.firstName, lastName: guests.lastName, email: guests.email, phone: guests.phone, nationality: guests.nationality, isDemo: guests.isDemo, tripCount: sql<number>`(select count(*)::int from trips t where t.lead_guest_id = ${guests.id})` })
    .from(guests)
    .where(q.trim() ? or(ilike(guests.firstName, term), ilike(guests.lastName, term), ilike(guests.email, term)) : undefined)
    .orderBy(asc(guests.lastName), asc(guests.firstName))
    .limit(500);
  return rows;
}

export async function getGuest(db: Db, actor: Actor, id: string) {
  requirePermission(actor, "guest.read");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Guest");
  const [g] = await db.select().from(guests).where(eq(guests.id, id));
  if (!g) throw notFound("Guest");
  // Trips listed here respect trip scope, so a guide only sees their assigned journeys.
  const guestTrips = can(actor, "trip.read")
    ? await db.select({ id: trips.id, reference: trips.reference, name: trips.name, status: trips.status, startDate: trips.startDate, endDate: trips.endDate })
        .from(trips).where(and(eq(trips.leadGuestId, id), tripScope(actor))).orderBy(desc(trips.startDate))
    : [];
  return { guest: redact(actor, g), trips: guestTrips };
}

export async function createGuest(db: Db, actor: Actor, raw: GuestInput) {
  requirePermission(actor, "guest.edit");
  const v = guestSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [g] = await tx.insert(guests).values(v).returning();
    await audit(tx, actor.id, { action: "guest.created", entityType: "guest", entityId: g!.id, summary: `Added guest ${v.firstName} ${v.lastName}` });
    return g!;
  });
}

export async function updateGuest(db: Db, actor: Actor, id: string, raw: GuestInput) {
  requirePermission(actor, "guest.edit");
  const v = guestSchema.parse(raw);
  // Users who cannot see sensitive fields cannot overwrite them either.
  const values: Partial<typeof v> = { ...v };
  if (!can(actor, "guest.read_sensitive")) for (const k of SENSITIVE) delete values[k];
  return db.transaction(async (tx) => {
    const [g] = await tx.update(guests).set({ ...values, updatedAt: new Date() }).where(eq(guests.id, id)).returning();
    if (!g) throw notFound("Guest");
    await audit(tx, actor.id, { action: "guest.updated", entityType: "guest", entityId: id, summary: `Updated guest ${g.firstName} ${g.lastName}` });
    return g;
  });
}

export async function guestOptions(db: Db, actor: Actor) {
  requirePermission(actor, "guest.read");
  return db.select({ id: guests.id, label: sql<string>`${guests.lastName} || ', ' || ${guests.firstName}` }).from(guests).orderBy(asc(guests.lastName));
}
