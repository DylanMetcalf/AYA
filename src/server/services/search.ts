import { and, asc, ilike, or } from "drizzle-orm";
import { type Actor, can } from "@/server/auth/actor";
import type { Db } from "@/server/db/client";
import { guests, suppliers, trips } from "@/server/db/schema";
import { tripScope } from "./trips";

/** Permission-aware search across trips, guests and suppliers. Each domain is skipped if not readable. */
export async function globalSearch(db: Db, actor: Actor, q: string) {
  const term = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const [t, g, s] = await Promise.all([
    can(actor, "trip.read")
      ? db.select({ id: trips.id, reference: trips.reference, name: trips.name, status: trips.status, startDate: trips.startDate, endDate: trips.endDate })
          .from(trips).where(and(tripScope(actor), or(ilike(trips.name, term), ilike(trips.reference, term), ilike(trips.primaryDestination, term)))).limit(20)
      : [],
    can(actor, "guest.read")
      ? db.select({ id: guests.id, firstName: guests.firstName, lastName: guests.lastName, email: guests.email })
          .from(guests).where(or(ilike(guests.firstName, term), ilike(guests.lastName, term), ilike(guests.email, term))).orderBy(asc(guests.lastName)).limit(20)
      : [],
    can(actor, "supplier.read")
      ? db.select({ id: suppliers.id, name: suppliers.name, category: suppliers.category, region: suppliers.region })
          .from(suppliers).where(or(ilike(suppliers.name, term), ilike(suppliers.region, term))).limit(20)
      : [],
  ]);
  return { trips: t, guests: g, suppliers: s };
}
