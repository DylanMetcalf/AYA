import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { BOOKING_STATUSES, COMPONENT_TYPE_KEYS, COMPONENT_TYPES, RATE_BASES, type ComponentType } from "@/lib/domain/components";
import { suggestQuantity } from "@/lib/finance/costing";
import { currencyCode, isUuid, optAmount, optDate, optText, optTime, optUuid, quantity, reqText } from "@/lib/validation/common";
import { type Actor, can, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit";
import type { Db, DbOrTx, Tx } from "@/server/db/client";
import { brands, itineraryComponents, itineraryDays, supplierRates, supplierServices, suppliers, trips, users, vehicleAllocations } from "@/server/db/schema";
import { invalid, notFound } from "@/server/errors";
import { loadScopedTrip } from "./trips";

const FINISHED = ["closed", "cancelled", "lost"];

async function editableTrip(tx: DbOrTx, actor: Actor, tripId: string) {
  requirePermission(actor, "trip.edit");
  const trip = await loadScopedTrip(tx, actor, tripId, true);
  if (FINISHED.includes(trip.status)) throw invalid("This journey is finished and its itinerary can no longer be changed.");
  if (trip.archivedAt) throw invalid("Restore the journey before editing its itinerary.");
  return trip;
}

/** Loads a component and its trip, checking the actor may edit that trip. */
async function editableComponent(tx: DbOrTx, actor: Actor, componentId: string) {
  if (!isUuid(componentId)) throw notFound("Segment");
  const [c] = await tx.select().from(itineraryComponents).where(eq(itineraryComponents.id, componentId)).for("update");
  if (!c) throw notFound("Segment");
  const trip = await editableTrip(tx, actor, c.tripId);
  return { component: c, trip };
}

const touchTrip = (tx: DbOrTx, tripId: string) => tx.update(trips).set({ updatedAt: new Date() }).where(eq(trips.id, tripId));

export async function getStudio(db: Db, actor: Actor, tripId: string) {
  const trip = await loadScopedTrip(db, actor, tripId);
  const days = await db.select().from(itineraryDays).where(eq(itineraryDays.tripId, tripId)).orderBy(asc(itineraryDays.dayNumber));
  const rows = await db
    .select({
      c: itineraryComponents,
      supplierName: suppliers.name,
      leadName: users.name,
      rateVersion: supplierRates.version,
      rateStatus: supplierRates.status,
      rateName: supplierRates.name,
    })
    .from(itineraryComponents)
    .leftJoin(suppliers, eq(suppliers.id, itineraryComponents.supplierId))
    .leftJoin(users, eq(users.id, itineraryComponents.leadUserId))
    .leftJoin(supplierRates, eq(supplierRates.id, itineraryComponents.supplierRateId))
    .where(eq(itineraryComponents.tripId, tripId))
    .orderBy(asc(itineraryComponents.position));
  const showCosts = can(actor, "finance.read_costs");
  const components = rows.map((r) => ({
    ...r.c,
    supplierName: r.supplierName,
    leadName: r.leadName,
    rateVersion: r.rateVersion,
    rateStatus: r.rateStatus,
    rateName: r.rateName,
    // Costs are stripped server-side for roles without finance visibility.
    ...(showCosts ? {} : { unitCost: null, minimumCharge: null, actualCost: null, costCurrency: null, quantity: null }),
  }));
  return { trip, days, components, showCosts };
}

export async function addDay(db: Db, actor: Actor, tripId: string, raw: { title?: string; location?: string }) {
  const v = z.object({ title: optText(200), location: optText(200) }).parse(raw);
  return db.transaction(async (tx) => {
    await editableTrip(tx, actor, tripId);
    const [{ max }] = (await tx.select({ max: sql<number>`coalesce(max(${itineraryDays.dayNumber}), 0)::int` }).from(itineraryDays).where(eq(itineraryDays.tripId, tripId))) as [{ max: number }];
    const [d] = await tx.insert(itineraryDays).values({ tripId, dayNumber: max + 1, ...v }).returning();
    await touchTrip(tx, tripId);
    await audit(tx, actor.id, { action: "itinerary.day_added", entityType: "trip", entityId: tripId, summary: `Added day ${max + 1}${v.title ? ` — ${v.title}` : ""}` });
    return d!;
  });
}

export async function updateDay(db: Db, actor: Actor, dayId: string, raw: { title?: string; location?: string; notes?: string }) {
  const v = z.object({ title: optText(200), location: optText(200), notes: optText(5000) }).parse(raw);
  return db.transaction(async (tx) => {
    const [day] = await tx.select().from(itineraryDays).where(eq(itineraryDays.id, dayId));
    if (!day) throw notFound("Day");
    await editableTrip(tx, actor, day.tripId);
    await tx.update(itineraryDays).set({ ...v, updatedAt: new Date() }).where(eq(itineraryDays.id, dayId));
    await touchTrip(tx, day.tripId);
  });
}

/** Removes an empty day and renumbers the following days. */
export async function removeDay(db: Db, actor: Actor, dayId: string) {
  return db.transaction(async (tx) => {
    const [day] = await tx.select().from(itineraryDays).where(eq(itineraryDays.id, dayId));
    if (!day) throw notFound("Day");
    await editableTrip(tx, actor, day.tripId);
    const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(itineraryComponents).where(eq(itineraryComponents.dayId, dayId))) as [{ n: number }];
    if (n > 0) throw invalid("Move or remove this day's segments before deleting the day.");
    await tx.delete(itineraryDays).where(eq(itineraryDays.id, dayId));
    // Two-step renumber avoids transient unique-key collisions.
    await tx.update(itineraryDays).set({ dayNumber: sql`${itineraryDays.dayNumber} + 10000` }).where(and(eq(itineraryDays.tripId, day.tripId), gt(itineraryDays.dayNumber, day.dayNumber)));
    await tx.update(itineraryDays).set({ dayNumber: sql`${itineraryDays.dayNumber} - 10001` }).where(and(eq(itineraryDays.tripId, day.tripId), gt(itineraryDays.dayNumber, 10000)));
    await touchTrip(tx, day.tripId);
    await audit(tx, actor.id, { action: "itinerary.day_removed", entityType: "trip", entityId: day.tripId, summary: `Removed day ${day.dayNumber}` });
  });
}

export const componentSchema = z.object({
  type: z.enum(COMPONENT_TYPE_KEYS as [ComponentType, ...ComponentType[]]),
  title: reqText(200, "Give the segment a title"),
  startTime: optTime,
  endTime: optTime,
  startLocation: optText(200),
  endLocation: optText(200),
  operatingBrandId: optUuid,
  guestFacingBrandId: optUuid,
  providerCompanyId: optUuid,
  supplierId: optUuid,
  leadUserId: optUuid,
  guestDescription: optText(5000),
  internalNotes: optText(5000),
  details: z.record(z.string(), z.string().max(500)).default({}),
  includedInQuote: z.boolean().default(true),
  supplierPaymentDue: optDate,
  costCurrency: z.preprocess((v) => (v === "" ? null : v), currencyCode.nullish()),
  unitCost: optAmount,
  quantity: z.preprocess((v) => (v === "" ? null : v), quantity.nullish()),
  costBasis: z.preprocess((v) => (v === "" ? null : v), z.enum(RATE_BASES).nullish()),
  minimumCharge: optAmount,
  actualCost: optAmount,
}).refine((v) => !v.unitCost || v.costCurrency, { path: ["costCurrency"], message: "Choose the currency of this cost" });
export type ComponentInput = z.input<typeof componentSchema>;

const COST_FIELDS = ["costCurrency", "unitCost", "quantity", "costBasis", "minimumCharge", "actualCost"] as const;

function stripCostsIfNotPermitted(actor: Actor, v: z.output<typeof componentSchema>) {
  if (can(actor, "finance.read_costs")) return v;
  const copy: Partial<z.output<typeof componentSchema>> = { ...v };
  for (const k of COST_FIELDS) delete copy[k];
  return copy;
}

async function assertBrandsExist(tx: DbOrTx, ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return;
  const found = await tx.select({ id: brands.id }).from(brands).where(inArray(brands.id, list));
  if (found.length !== list.length) throw invalid("Selected brand does not exist.");
}

export async function addComponent(db: Db, actor: Actor, dayId: string, raw: ComponentInput) {
  const v = componentSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [day] = await tx.select().from(itineraryDays).where(eq(itineraryDays.id, dayId));
    if (!day) throw notFound("Day");
    const trip = await editableTrip(tx, actor, day.tripId);
    await assertBrandsExist(tx, [v.operatingBrandId, v.guestFacingBrandId]);
    const [{ max }] = (await tx.select({ max: sql<number>`coalesce(max(${itineraryComponents.position}), -1)::int` }).from(itineraryComponents).where(eq(itineraryComponents.dayId, dayId))) as [{ max: number }];
    const values = stripCostsIfNotPermitted(actor, v);
    const [c] = await tx
      .insert(itineraryComponents)
      .values({
        ...values,
        type: v.type,
        title: v.title,
        tripId: day.tripId,
        dayId,
        position: max + 1,
        operatingBrandId: v.operatingBrandId ?? trip.primaryBrandId,
        costSource: values.unitCost ? "manual" : "none",
      })
      .returning();
    await touchTrip(tx, day.tripId);
    await audit(tx, actor.id, { action: "itinerary.segment_added", entityType: "trip", entityId: day.tripId, summary: `Day ${day.dayNumber}: added ${COMPONENT_TYPES[v.type].label.toLowerCase()} “${v.title}”` });
    return c!;
  });
}

export async function updateComponent(db: Db, actor: Actor, componentId: string, raw: ComponentInput) {
  const v = componentSchema.parse(raw);
  return db.transaction(async (tx) => {
    const { component: before } = await editableComponent(tx, actor, componentId);
    await assertBrandsExist(tx, [v.operatingBrandId, v.guestFacingBrandId]);
    const values = stripCostsIfNotPermitted(actor, v);
    // A manual cost edit detaches the component from the supplier rate it was priced from.
    const costChanged = can(actor, "finance.read_costs") && (values.unitCost !== before.unitCost || values.costCurrency !== before.costCurrency || values.costBasis !== before.costBasis);
    const [after] = await tx
      .update(itineraryComponents)
      .set({
        ...values,
        ...(costChanged ? { costSource: values.unitCost ? ("manual" as const) : ("none" as const), supplierRateId: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(itineraryComponents.id, componentId))
      .returning();
    await touchTrip(tx, before.tripId);
    await audit(tx, actor.id, {
      action: "itinerary.segment_updated",
      entityType: "trip",
      entityId: before.tripId,
      summary: `Updated “${after!.title}”${costChanged ? " (cost changed manually)" : ""}`,
      changes: costChanged ? { unitCost: { from: before.unitCost, to: after!.unitCost }, currency: { from: before.costCurrency, to: after!.costCurrency } } : undefined,
    });
    return after!;
  });
}

/** Applies an approved supplier rate to a segment. Quantity defaults from the rate basis and party. */
export async function applyRate(db: Db, actor: Actor, componentId: string, rateId: string) {
  requirePermission(actor, "finance.read_costs");
  return db.transaction(async (tx) => {
    const { component, trip } = await editableComponent(tx, actor, componentId);
    const [rate] = await tx
      .select({ r: supplierRates, supplierId: supplierServices.supplierId })
      .from(supplierRates)
      .innerJoin(supplierServices, eq(supplierServices.id, supplierRates.serviceId))
      .where(eq(supplierRates.id, rateId));
    if (!rate) throw notFound("Rate");
    if (rate.r.status !== "approved") throw invalid("Only approved rates can be used for costing. Submit this rate for review first.");
    const nights = Number(component.details?.nights) || undefined;
    const qty = component.quantity ?? String(suggestQuantity(rate.r.basis, { adults: trip.adults, children: trip.children, rooms: trip.rooms, nights, days: nights }));
    const [after] = await tx
      .update(itineraryComponents)
      .set({
        supplierRateId: rate.r.id,
        supplierId: rate.supplierId,
        costSource: "rate",
        costCurrency: rate.r.currency,
        unitCost: rate.r.amount,
        costBasis: rate.r.basis,
        minimumCharge: rate.r.minimumCharge,
        quantity: qty,
        updatedAt: new Date(),
      })
      .where(eq(itineraryComponents.id, componentId))
      .returning();
    await touchTrip(tx, component.tripId);
    await audit(tx, actor.id, { action: "itinerary.rate_applied", entityType: "trip", entityId: component.tripId, summary: `Priced “${component.title}” from rate “${rate.r.name}” v${rate.r.version} (${rate.r.currency} ${rate.r.amount})` });
    return after!;
  });
}

/** Moves a segment up/down within its day, or to the end of another day. Positions are renumbered densely. */
export async function moveComponent(db: Db, actor: Actor, componentId: string, move: { direction?: "up" | "down"; toDayId?: string }) {
  return db.transaction(async (tx) => {
    const { component } = await editableComponent(tx, actor, componentId);
    let targetDayId = component.dayId;
    if (move.toDayId && move.toDayId !== component.dayId) {
      const [day] = await tx.select().from(itineraryDays).where(and(eq(itineraryDays.id, move.toDayId), eq(itineraryDays.tripId, component.tripId)));
      if (!day) throw invalid("Target day is not part of this journey.");
      targetDayId = day.id;
    }
    const load = (dayId: string) => tx.select({ id: itineraryComponents.id }).from(itineraryComponents).where(eq(itineraryComponents.dayId, dayId)).orderBy(asc(itineraryComponents.position), asc(itineraryComponents.createdAt));
    const renumber = async (ids: string[], dayId: string) => {
      for (const [i, id] of ids.entries()) await tx.update(itineraryComponents).set({ position: i, dayId }).where(eq(itineraryComponents.id, id));
    };
    if (targetDayId !== component.dayId) {
      await renumber((await load(component.dayId)).map((r) => r.id).filter((id) => id !== componentId), component.dayId);
      await renumber([...(await load(targetDayId)).map((r) => r.id), componentId], targetDayId);
    } else if (move.direction) {
      const ids = (await load(component.dayId)).map((r) => r.id);
      const i = ids.indexOf(componentId);
      const j = move.direction === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j]!, ids[i]!];
      await renumber(ids, component.dayId);
    }
    await touchTrip(tx, component.tripId);
    await audit(tx, actor.id, { action: "itinerary.segment_moved", entityType: "trip", entityId: component.tripId, summary: `Moved “${component.title}”` });
  });
}

export async function removeComponent(db: Db, actor: Actor, componentId: string) {
  return db.transaction(async (tx) => {
    const { component } = await editableComponent(tx, actor, componentId);
    if (["confirmed", "provisional", "requested"].includes(component.bookingStatus)) {
      throw invalid("This segment has an active supplier arrangement. Record the cancellation with the supplier before removing it.");
    }
    const [alloc] = await tx.select({ id: vehicleAllocations.id }).from(vehicleAllocations).where(and(eq(vehicleAllocations.componentId, componentId), sql`${vehicleAllocations.status} <> 'cancelled'`));
    if (alloc) throw invalid("A vehicle is allocated to this segment. Cancel the allocation first.");
    await tx.delete(itineraryComponents).where(eq(itineraryComponents.id, componentId));
    await touchTrip(tx, component.tripId);
    await audit(tx, actor.id, { action: "itinerary.segment_removed", entityType: "trip", entityId: component.tripId, summary: `Removed “${component.title}”` });
  });
}

const bookingSchema = z
  .object({ status: z.enum(BOOKING_STATUSES), confirmationRef: optText(120), confirmedOn: optDate, note: optText(500) })
  .refine((v) => v.status !== "confirmed" || !!v.confirmationRef, { path: ["confirmationRef"], message: "Record the supplier's confirmation reference" });

/** Records the supplier arrangement state. Confirmation requires a supplier reference. */
export async function setBookingStatus(db: Db, actor: Actor, componentId: string, raw: z.input<typeof bookingSchema>) {
  const v = bookingSchema.parse(raw);
  return db.transaction(async (tx) => {
    const { component } = await editableComponent(tx, actor, componentId);
    await tx
      .update(itineraryComponents)
      .set({
        bookingStatus: v.status,
        confirmationRef: v.confirmationRef ?? component.confirmationRef,
        confirmedOn: v.status === "confirmed" ? (v.confirmedOn ?? new Date().toISOString().slice(0, 10)) : component.confirmedOn,
        updatedAt: new Date(),
      })
      .where(eq(itineraryComponents.id, componentId));
    await touchTrip(tx, component.tripId);
    await audit(tx, actor.id, {
      action: "booking.status_changed",
      entityType: "trip",
      entityId: component.tripId,
      summary: `“${component.title}”: ${component.bookingStatus} → ${v.status}${v.confirmationRef ? ` (ref ${v.confirmationRef})` : ""}`,
      changes: { note: v.note },
    });
  });
}

/** Creates days 1..n for a new itinerary from the trip dates (only when none exist). */
export async function generateDaysFromDates(db: Db, actor: Actor, tripId: string) {
  return db.transaction(async (tx: Tx) => {
    const trip = await editableTrip(tx, actor, tripId);
    const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(itineraryDays).where(eq(itineraryDays.tripId, tripId))) as [{ n: number }];
    if (n > 0) throw invalid("This itinerary already has days.");
    if (!trip.startDate || !trip.endDate) throw invalid("Set departure and return dates first, or add days one at a time.");
    const count = Math.round((Date.parse(trip.endDate) - Date.parse(trip.startDate)) / 86_400_000) + 1;
    if (count > 60) throw invalid("Journeys longer than 60 days must be built day by day.");
    await tx.insert(itineraryDays).values(Array.from({ length: count }, (_, i) => ({ tripId, dayNumber: i + 1 })));
    await audit(tx, actor.id, { action: "itinerary.days_generated", entityType: "trip", entityId: tripId, summary: `Created ${count} itinerary days from travel dates` });
  });
}
