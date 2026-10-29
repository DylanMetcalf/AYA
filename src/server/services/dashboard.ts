import { and, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { CONFIRMED_STATUSES, type TripStatus } from "@/lib/domain/trip-lifecycle";
import { TRIP_VIEWS } from "@/lib/domain/trip-views";
import { type Actor, can } from "@/server/auth/actor";
import type { Db } from "@/server/db/client";
import { auditEvents, brands, trips, users } from "@/server/db/schema";
import { tripScope } from "./trips";

const AWAITING_QUOTE: TripStatus[] = TRIP_VIEWS.awaiting_quote.statuses;
const AWAITING_DECISION: TripStatus[] = TRIP_VIEWS.awaiting_decision.statuses;
const SALES_OPEN: TripStatus[] = [...TRIP_VIEWS.enquiries.statuses, ...AWAITING_QUOTE, ...AWAITING_DECISION];
const UPCOMING_OPS: TripStatus[] = TRIP_VIEWS.operations.statuses;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** All Command Centre figures, computed from persisted records. Definitions: docs/METRICS.md. */
export async function getCommandCentre(db: Db, actor: Actor, brandSlug: string | null, today = new Date()) {
  const base: (SQL | undefined)[] = [tripScope(actor), isNull(trips.archivedAt)];
  if (brandSlug) {
    const [b] = await db.select({ id: brands.id }).from(brands).where(eq(brands.slug, brandSlug));
    if (b) base.push(or(eq(trips.primaryBrandId, b.id), eq(trips.guestFacingBrandId, b.id)));
  }
  const where = (...extra: (SQL | undefined)[]) => and(...base, ...extra);
  const todayIso = isoDate(today);
  const in30 = isoDate(new Date(today.getTime() + 30 * 86_400_000));
  const in90 = isoDate(new Date(today.getTime() + 90 * 86_400_000));

  const countWhere = (cond: SQL | undefined) =>
    db.select({ n: sql<number>`count(*)::int` }).from(trips).where(where(cond)).then((r) => r[0]!.n);

  const tripCols = {
    id: trips.id, reference: trips.reference, name: trips.name, status: trips.status,
    startDate: trips.startDate, endDate: trips.endDate, managerName: users.name, brandName: brands.name, brandColor: brands.colorAccent,
    commercialApprovedAt: trips.commercialApprovedAt, managerId: trips.managerId,
  };

  const [activeTrips, awaitingQuote, awaitingDecision, operating, upcoming, atRisk, unassigned, pipeline] = await Promise.all([
    countWhere(inArray(trips.status, TRIP_VIEWS.active.statuses)),
    countWhere(inArray(trips.status, AWAITING_QUOTE)),
    countWhere(inArray(trips.status, AWAITING_DECISION)),
    countWhere(inArray(trips.status, UPCOMING_OPS)),
    db.select(tripCols).from(trips).innerJoin(brands, eq(brands.id, trips.primaryBrandId)).leftJoin(users, eq(users.id, trips.managerId))
      .where(where(inArray(trips.status, [...UPCOMING_OPS, ...AWAITING_DECISION]), gte(trips.endDate, todayIso), lte(trips.startDate, in90)))
      .orderBy(trips.startDate).limit(8),
    // Departing within 30 days but not yet confirmed: needs intervention.
    db.select(tripCols).from(trips).innerJoin(brands, eq(brands.id, trips.primaryBrandId)).leftJoin(users, eq(users.id, trips.managerId))
      .where(where(inArray(trips.status, SALES_OPEN), gte(trips.startDate, todayIso), lte(trips.startDate, in30)))
      .orderBy(trips.startDate).limit(10),
    db.select(tripCols).from(trips).innerJoin(brands, eq(brands.id, trips.primaryBrandId)).leftJoin(users, eq(users.id, trips.managerId))
      .where(where(isNull(trips.managerId), inArray(trips.status, [...SALES_OPEN, ...UPCOMING_OPS]))).limit(10),
    db.select({ currency: trips.currency, total: sql<string>`coalesce(sum(${trips.estimatedValue}), 0)::text`, n: sql<number>`count(${trips.estimatedValue})::int` })
      .from(trips).where(where(inArray(trips.status, SALES_OPEN))).groupBy(trips.currency),
  ]);

  // Confirmed without approval can only happen through a recorded override; surface it.
  const confirmedWithoutApproval = await db.select(tripCols).from(trips).innerJoin(brands, eq(brands.id, trips.primaryBrandId)).leftJoin(users, eq(users.id, trips.managerId))
    .where(where(inArray(trips.status, CONFIRMED_STATUSES), isNull(trips.commercialApprovedAt), sql`${trips.status} <> 'closed'`)).limit(10);

  const recentActivity = can(actor, "trip.read_all")
    ? await db
        .select({ id: auditEvents.id, at: auditEvents.at, action: auditEvents.action, summary: auditEvents.summary, entityType: auditEvents.entityType, entityId: auditEvents.entityId, actorName: users.name })
        .from(auditEvents).leftJoin(users, eq(users.id, auditEvents.actorId))
        .where(eq(auditEvents.category, "business")).orderBy(desc(auditEvents.at)).limit(12)
    : [];

  return {
    counts: { activeTrips, awaitingQuote, awaitingDecision, operating },
    upcoming,
    attention: { departingUnconfirmed: atRisk, unassigned, confirmedWithoutApproval },
    pipeline: pipeline.filter((p) => p.n > 0),
    recentActivity,
  };
}
