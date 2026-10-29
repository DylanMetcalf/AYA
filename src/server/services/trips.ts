import { and, asc, desc, eq, exists, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { TRIP_STATUS_LABEL, allowedNextStatuses, evaluateTransition, type TripStatus } from "@/lib/domain/trip-lifecycle";
import { transitionSchema, tripFieldsSchema, type TripFieldsInput } from "@/lib/validation/trip";
import { type Actor, can, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit";
import type { Db, DbOrTx } from "@/server/db/client";
import {
  brands,
  guests,
  itineraryComponents,
  itineraryDays,
  quotes,
  trips,
  tripAssignments,
  tripBrands,
  tripStatusHistory,
  users,
} from "@/server/db/schema";
import { conflict, forbidden, invalid, notFound } from "@/server/errors";

/**
 * Row-level scope: holders of trip.read_all see everything; others (e.g. guides) only see trips
 * they manage or are assigned to. Every trip read goes through this so manipulated ids return 404.
 */
export function tripScope(actor: Actor): SQL | undefined {
  requirePermission(actor, "trip.read");
  if (can(actor, "trip.read_all")) return undefined;
  return or(
    sql`"trips"."manager_id" = ${actor.id}`,
    exists(
      sql`(select 1 from ${tripAssignments} ta where ta.trip_id = "trips"."id" and ta.user_id = ${actor.id})`,
    ),
  );
}

export interface TripListFilters {
  q?: string;
  status?: TripStatus[];
  brandId?: string;
  managerId?: string;
  includeArchived?: boolean;
}

export async function listTrips(db: Db, actor: Actor, f: TripListFilters = {}) {
  const conds: (SQL | undefined)[] = [tripScope(actor)];
  if (!f.includeArchived) conds.push(isNull(trips.archivedAt));
  if (f.status?.length) conds.push(inArray(trips.status, f.status));
  if (f.brandId) conds.push(or(eq(trips.primaryBrandId, f.brandId), eq(trips.guestFacingBrandId, f.brandId)));
  if (f.managerId) conds.push(eq(trips.managerId, f.managerId));
  if (f.q?.trim()) {
    const q = `%${f.q.trim()}%`;
    conds.push(or(ilike(trips.name, q), ilike(trips.reference, q), ilike(trips.primaryDestination, q)));
  }
  return db
    .select({
      id: trips.id,
      reference: trips.reference,
      name: trips.name,
      status: trips.status,
      startDate: trips.startDate,
      endDate: trips.endDate,
      adults: trips.adults,
      children: trips.children,
      currency: trips.currency,
      estimatedValue: trips.estimatedValue,
      primaryDestination: trips.primaryDestination,
      isDemo: trips.isDemo,
      updatedAt: trips.updatedAt,
      brandName: brands.name,
      brandSlug: brands.slug,
      brandColor: brands.colorAccent,
      managerName: users.name,
      leadGuestName: sql<string | null>`${guests.firstName} || ' ' || ${guests.lastName}`,
    })
    .from(trips)
    .innerJoin(brands, eq(brands.id, trips.primaryBrandId))
    .leftJoin(users, eq(users.id, trips.managerId))
    .leftJoin(guests, eq(guests.id, trips.leadGuestId))
    .where(and(...conds))
    .orderBy(sql`${trips.startDate} asc nulls last`, desc(trips.updatedAt))
    .limit(500);
}

export async function loadScopedTrip(db: DbOrTx, actor: Actor, id: string, lock = false) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Trip");
  const q = db.select().from(trips).where(and(eq(trips.id, id), tripScope(actor)));
  const [trip] = lock ? await q.for("update") : await q;
  if (!trip) throw notFound("Trip");
  return trip;
}

export async function getTrip(db: Db, actor: Actor, id: string) {
  const trip = await loadScopedTrip(db, actor, id);
  const [brandRows, assignments, history, leadGuest, manager] = await Promise.all([
    db
      .select({ brandId: tripBrands.brandId, role: tripBrands.role, name: brands.name, slug: brands.slug })
      .from(tripBrands)
      .innerJoin(brands, eq(brands.id, tripBrands.brandId))
      .where(eq(tripBrands.tripId, id)),
    db
      .select({ userId: tripAssignments.userId, role: tripAssignments.role, name: users.name })
      .from(tripAssignments)
      .innerJoin(users, eq(users.id, tripAssignments.userId))
      .where(eq(tripAssignments.tripId, id)),
    db
      .select({
        id: tripStatusHistory.id,
        fromStatus: tripStatusHistory.fromStatus,
        toStatus: tripStatusHistory.toStatus,
        reason: tripStatusHistory.reason,
        overridden: tripStatusHistory.overridden,
        overriddenRules: tripStatusHistory.overriddenRules,
        at: tripStatusHistory.at,
        actorName: users.name,
      })
      .from(tripStatusHistory)
      .leftJoin(users, eq(users.id, tripStatusHistory.actorId))
      .where(eq(tripStatusHistory.tripId, id))
      .orderBy(desc(tripStatusHistory.at), desc(tripStatusHistory.id)),
    trip.leadGuestId
      ? db.select({ id: guests.id, firstName: guests.firstName, lastName: guests.lastName, email: guests.email }).from(guests).where(eq(guests.id, trip.leadGuestId)).then((r) => r[0] ?? null)
      : null,
    trip.managerId ? db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, trip.managerId)).then((r) => r[0] ?? null) : null,
  ]);
  const brandById = await db.select().from(brands).where(inArray(brands.id, [trip.primaryBrandId, trip.guestFacingBrandId]));
  const findBrand = (bid: string) => brandById.find((b) => b.id === bid)!; // FK guarantees existence
  const primaryBrand = findBrand(trip.primaryBrandId);
  const guestFacingBrand = findBrand(trip.guestFacingBrandId);
  return { trip, primaryBrand, guestFacingBrand, brandRows, assignments, history, leadGuest, manager };
}

async function assertBrandsExist(tx: DbOrTx, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  const found = await tx.select({ id: brands.id }).from(brands).where(inArray(brands.id, unique));
  if (found.length !== unique.length) throw invalid("One or more selected brands do not exist.");
}

async function nextReference(tx: DbOrTx) {
  const [row] = await tx.execute<{ n: string }>(sql`select nextval('trip_reference_seq')::text as n`);
  return `ULT-${new Date().getFullYear()}-${String(row!.n).padStart(4, "0")}`;
}

async function writeTripBrands(tx: DbOrTx, tripId: string, participating: string[], supplying: string[]) {
  await tx.delete(tripBrands).where(eq(tripBrands.tripId, tripId));
  const rows = [
    ...[...new Set(participating)].map((brandId) => ({ tripId, brandId, role: "participating" as const })),
    ...[...new Set(supplying)].map((brandId) => ({ tripId, brandId, role: "supplying" as const })),
  ];
  if (rows.length) await tx.insert(tripBrands).values(rows);
}

function toColumns(v: ReturnType<typeof tripFieldsSchema.parse>) {
  const { participatingBrandIds: _p, supplyingBrandIds: _s, ...cols } = v;
  return cols;
}

export async function createTrip(db: Db, actor: Actor, raw: TripFieldsInput, opts: { isDemo?: boolean } = {}) {
  requirePermission(actor, "trip.create");
  const v = tripFieldsSchema.parse(raw);
  return db.transaction(async (tx) => {
    await assertBrandsExist(tx, [v.primaryBrandId, v.guestFacingBrandId, ...v.participatingBrandIds, ...v.supplyingBrandIds]);
    const [trip] = await tx
      .insert(trips)
      .values({
        ...toColumns(v),
        managerId: v.managerId ?? actor.id,
        reference: await nextReference(tx),
        createdById: actor.id,
        isDemo: opts.isDemo ?? false,
      })
      .returning();
    await writeTripBrands(tx, trip!.id, v.participatingBrandIds, v.supplyingBrandIds);
    await tx.insert(tripStatusHistory).values({ tripId: trip!.id, toStatus: "enquiry", actorId: actor.id, reason: "Trip created" });
    await audit(tx, actor.id, { action: "trip.created", entityType: "trip", entityId: trip!.id, summary: `Created ${trip!.reference} “${trip!.name}”` });
    return trip!;
  });
}

const AUDITED_FIELDS = [
  "name", "primaryBrandId", "guestFacingBrandId", "operatingCompanyId", "quotingCompanyId", "managerId",
  "startDate", "endDate", "adults", "children", "rooms", "currency", "leadGuestId",
] as const;

/** Updates trip fields. `expectedVersion` prevents silently overwriting a colleague's concurrent edit. */
export async function updateTrip(db: Db, actor: Actor, id: string, expectedVersion: number, raw: TripFieldsInput) {
  requirePermission(actor, "trip.edit");
  const v = tripFieldsSchema.parse(raw);
  return db.transaction(async (tx) => {
    const before = await loadScopedTrip(tx, actor, id, true);
    if (before.version !== expectedVersion) {
      throw conflict("This trip was changed by someone else since you opened it. Reload to see the latest version.");
    }
    if (["closed", "cancelled", "lost"].includes(before.status)) throw invalid("Finished trips cannot be edited.");
    await assertBrandsExist(tx, [v.primaryBrandId, v.guestFacingBrandId, ...v.participatingBrandIds, ...v.supplyingBrandIds]);
    const [after] = await tx
      .update(trips)
      .set({ ...toColumns(v), version: before.version + 1, updatedAt: new Date() })
      .where(eq(trips.id, id))
      .returning();
    await writeTripBrands(tx, id, v.participatingBrandIds, v.supplyingBrandIds);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of AUDITED_FIELDS) if (before[k] !== after![k]) changes[k] = { from: before[k], to: after![k] };
    await audit(tx, actor.id, {
      action: "trip.updated",
      entityType: "trip",
      entityId: id,
      summary: `${before.reference}: ${Object.keys(changes).length ? `updated ${Object.keys(changes).join(", ")}` : "updated trip details"}`,
      changes,
    });
    return after!;
  });
}

/** Facts the lifecycle gates depend on, read from persisted quotes. */
async function transitionContext(tx: DbOrTx, trip: typeof trips.$inferSelect) {
  const rows = await tx.select({ status: quotes.status }).from(quotes).where(eq(quotes.tripId, trip.id));
  return {
    commerciallyApproved: trip.commercialApprovedAt !== null,
    hasIssuedQuote: rows.some((q) => q.status === "issued" || q.status === "accepted"),
    hasAcceptedQuote: rows.some((q) => q.status === "accepted"),
  };
}

/** Next statuses with their blockers, evaluated by the same rules transitionTrip enforces. */
export async function tripTransitionOptions(db: Db, actor: Actor, trip: typeof trips.$inferSelect) {
  const ctx = await transitionContext(db, trip);
  return allowedNextStatuses(trip.status).map((status) => {
    const ev = evaluateTransition(trip.status, status, ctx);
    return { status, blockers: ev.blockers, reasonRequired: ev.reasonRequired, permitted: can(actor, ev.permission) };
  });
}

export async function transitionTrip(db: Db, actor: Actor, id: string, raw: unknown) {
  const input = transitionSchema.parse(raw);
  return db.transaction(async (tx) => {
    const trip = await loadScopedTrip(tx, actor, id, true);
    if (trip.version !== input.expectedVersion) throw conflict("This trip changed since you opened it. Reload and try again.");
    const ev = evaluateTransition(trip.status, input.to, await transitionContext(tx, trip));
    if (!ev.valid) throw invalid(`A trip cannot move from “${trip.status}” to “${input.to}”.`);
    requirePermission(actor, ev.permission);
    if (ev.blockers.length) {
      if (!input.override) throw invalid(ev.blockers.join(" "));
      if (!can(actor, "trip.override")) throw forbidden("Only authorised users can override lifecycle rules.");
    }
    if (ev.reasonRequired && !input.reason) throw invalid("Please record a reason for this change.");
    const [updated] = await tx
      .update(trips)
      .set({
        status: input.to,
        version: trip.version + 1,
        updatedAt: new Date(),
        closingReason: input.to === "cancelled" || input.to === "lost" ? input.reason : trip.closingReason,
      })
      .where(eq(trips.id, id))
      .returning();
    const overridden = ev.blockers.length > 0;
    await tx.insert(tripStatusHistory).values({
      tripId: id,
      fromStatus: trip.status,
      toStatus: input.to,
      reason: input.reason ?? null,
      overridden,
      overriddenRules: overridden ? ev.blockers.join(" ") : null,
      actorId: actor.id,
    });
    await audit(tx, actor.id, {
      action: overridden ? "trip.status_overridden" : "trip.status_changed",
      entityType: "trip",
      entityId: id,
      summary: `${trip.reference}: ${TRIP_STATUS_LABEL[trip.status]} → ${TRIP_STATUS_LABEL[input.to]}${overridden ? " (rules overridden)" : ""}`,
      changes: { from: trip.status, to: input.to, reason: input.reason, overriddenRules: overridden ? ev.blockers : undefined },
    });
    return updated!;
  });
}

export async function recordCommercialApproval(db: Db, actor: Actor, id: string, expectedVersion: number) {
  requirePermission(actor, "trip.approve");
  return db.transaction(async (tx) => {
    const trip = await loadScopedTrip(tx, actor, id, true);
    if (trip.version !== expectedVersion) throw conflict("This trip changed since you opened it. Reload and try again.");
    if (trip.commercialApprovedAt) throw invalid("Commercial approval is already recorded.");
    await tx
      .update(trips)
      .set({ commercialApprovedAt: new Date(), commercialApprovedById: actor.id, version: trip.version + 1, updatedAt: new Date() })
      .where(eq(trips.id, id));
    await audit(tx, actor.id, { action: "trip.approved", entityType: "trip", entityId: id, summary: `${trip.reference}: commercial approval recorded` });
  });
}

/**
 * Duplicates a trip as a fresh enquiry (also how a past journey is used as a template). Copied: design
 * fields, brands, party size, notes, itinerary outline and planned costs. Never copied: dates, status,
 * approvals, history, quotes, payments, supplier confirmations, vehicle allocations, assignments.
 */
export async function duplicateTrip(db: Db, actor: Actor, id: string) {
  requirePermission(actor, "trip.create");
  return db.transaction(async (tx) => {
    const src = await loadScopedTrip(tx, actor, id);
    const srcBrands = await tx.select().from(tripBrands).where(eq(tripBrands.tripId, id));
    const [copy] = await tx
      .insert(trips)
      .values({
        reference: await nextReference(tx),
        name: `${src.name} (copy)`,
        primaryBrandId: src.primaryBrandId,
        guestFacingBrandId: src.guestFacingBrandId,
        operatingCompanyId: src.operatingCompanyId,
        quotingCompanyId: src.quotingCompanyId,
        managerId: actor.id,
        leadGuestId: src.leadGuestId,
        clientOrganisationId: src.clientOrganisationId,
        adults: src.adults,
        children: src.children,
        rooms: src.rooms,
        primaryDestination: src.primaryDestination,
        purpose: src.purpose,
        occasion: src.occasion,
        experienceStyle: src.experienceStyle,
        currency: src.currency,
        internalNotes: src.internalNotes,
        guestNotes: src.guestNotes,
        specialRequirements: src.specialRequirements,
        isDemo: src.isDemo,
        createdById: actor.id,
      })
      .returning();
    if (srcBrands.length) await tx.insert(tripBrands).values(srcBrands.map((b) => ({ ...b, tripId: copy!.id })));
    // Copy the itinerary outline and planned costing; supplier arrangements start again from "planned".
    const days = await tx.select().from(itineraryDays).where(eq(itineraryDays.tripId, id));
    for (const d of days) {
      const [nd] = await tx.insert(itineraryDays).values({ tripId: copy!.id, dayNumber: d.dayNumber, title: d.title, location: d.location, notes: d.notes }).returning();
      const comps = await tx.select().from(itineraryComponents).where(eq(itineraryComponents.dayId, d.id));
      if (comps.length) {
        await tx.insert(itineraryComponents).values(
          comps.map(({ id: _id, createdAt: _c, updatedAt: _u, ...c }) => ({
            ...c, tripId: copy!.id, dayId: nd!.id, bookingStatus: "planned" as const, confirmationRef: null, confirmedOn: null, supplierPaymentDue: null, actualCost: null,
          })),
        );
      }
    }
    await tx.insert(tripStatusHistory).values({ tripId: copy!.id, toStatus: "enquiry", actorId: actor.id, reason: `Duplicated from ${src.reference}` });
    await audit(tx, actor.id, { action: "trip.duplicated", entityType: "trip", entityId: copy!.id, summary: `${copy!.reference}: duplicated from ${src.reference}`, changes: { sourceTripId: id } });
    return copy!;
  });
}

export async function setTripArchived(db: Db, actor: Actor, id: string, archived: boolean) {
  requirePermission(actor, "trip.edit");
  await db.transaction(async (tx) => {
    const trip = await loadScopedTrip(tx, actor, id, true);
    await tx.update(trips).set({ archivedAt: archived ? new Date() : null, version: trip.version + 1, updatedAt: new Date() }).where(eq(trips.id, id));
    await audit(tx, actor.id, { action: archived ? "trip.archived" : "trip.restored", entityType: "trip", entityId: id, summary: `${trip.reference}: ${archived ? "archived" : "restored from archive"}` });
  });
}

export async function listBrands(db: DbOrTx) {
  return db.select().from(brands).where(eq(brands.isActive, true)).orderBy(asc(brands.name));
}
