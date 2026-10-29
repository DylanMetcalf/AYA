import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { currencyCode, isUuid, optAmount, optDate, optInt, optText, optUuid, reqDate, reqText } from "@/lib/validation/common";
import { type Actor, can, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit";
import type { Db, DbOrTx } from "@/server/db/client";
import { legalCompanies, suppliers, trips, users, vehicleAllocations, vehicleDefects, vehicleInspections, vehicles } from "@/server/db/schema";
import { conflict, forbidden, invalid, notFound } from "@/server/errors";
import { loadScopedTrip } from "./trips";

export const vehicleSchema = z.object({
  registration: reqText(20).transform((s) => s.toUpperCase()),
  make: reqText(60),
  model: reqText(60),
  variant: optText(80),
  year: optInt(1900, 2100),
  category: z.enum(["classic", "support", "luggage", "guest_transfer", "other"]),
  ownerCompanyId: optUuid,
  supplierId: optUuid,
  seats: optInt(1, 60),
  luggageNote: optText(200),
  dailyRate: optAmount,
  rateCurrency: z.preprocess((v) => (v === "" ? null : v), currencyCode.nullish()),
  turnaroundDays: z.coerce.number().int().min(0).max(30),
  insuranceExpiry: optDate,
  licenceExpiry: optDate,
  currentMileage: optInt(0, 5_000_000),
  notes: optText(5000),
}).refine((v) => !v.dailyRate || v.rateCurrency, { path: ["rateCurrency"], message: "Choose the rate currency" });

const today = () => new Date().toISOString().slice(0, 10);

/** A vehicle is ready only when operationally available, free of open critical defects, signed off, and its documents are current. */
export function vehicleReadiness(v: { status: string; insuranceExpiry: string | null; licenceExpiry: string | null }, openCritical: number, lastSignedOff: boolean | null) {
  const reasons: string[] = [];
  if (v.status !== "available") reasons.push(`Status is ${v.status}`);
  if (openCritical > 0) reasons.push(`${openCritical} open critical defect${openCritical > 1 ? "s" : ""}`);
  if (lastSignedOff === null) reasons.push("No inspection recorded");
  else if (!lastSignedOff) reasons.push("Latest inspection not signed off");
  if (v.insuranceExpiry && v.insuranceExpiry < today()) reasons.push("Insurance expired");
  if (v.licenceExpiry && v.licenceExpiry < today()) reasons.push("Licence expired");
  return { ready: reasons.length === 0, reasons };
}

export async function listVehicles(db: Db, actor: Actor) {
  requirePermission(actor, "fleet.read");
  const rows = await db
    .select({
      v: vehicles,
      ownerName: legalCompanies.name,
      supplierName: suppliers.name,
      openCritical: sql<number>`(select count(*)::int from vehicle_defects d where d.vehicle_id = ${vehicles.id} and d.resolved_at is null and d.severity = 'critical')`,
      openDefects: sql<number>`(select count(*)::int from vehicle_defects d where d.vehicle_id = ${vehicles.id} and d.resolved_at is null)`,
      lastSignedOff: sql<boolean | null>`(select i.signed_off from vehicle_inspections i where i.vehicle_id = ${vehicles.id} order by i.inspected_at desc limit 1)`,
      nextAllocation: sql<string | null>`(select a.start_date::text || '|' || t.reference from vehicle_allocations a join trips t on t.id = a.trip_id where a.vehicle_id = ${vehicles.id} and a.status <> 'cancelled' and a.end_date >= current_date order by a.start_date limit 1)`,
    })
    .from(vehicles)
    .leftJoin(legalCompanies, eq(legalCompanies.id, vehicles.ownerCompanyId))
    .leftJoin(suppliers, eq(suppliers.id, vehicles.supplierId))
    .where(ne(vehicles.status, "retired"))
    .orderBy(asc(vehicles.category), asc(vehicles.make), asc(vehicles.model));
  return rows.map((r) => ({ ...r.v, ownerName: r.ownerName, supplierName: r.supplierName, openDefects: r.openDefects, openCritical: r.openCritical, nextAllocation: r.nextAllocation, readiness: vehicleReadiness(r.v, r.openCritical, r.lastSignedOff) }));
}

export async function getVehicle(db: Db, actor: Actor, id: string) {
  requirePermission(actor, "fleet.read");
  if (!isUuid(id)) throw notFound("Vehicle");
  const [v] = await db.select().from(vehicles).where(eq(vehicles.id, id));
  if (!v) throw notFound("Vehicle");
  const [allocations, inspections, defects] = await Promise.all([
    db.select({ a: vehicleAllocations, reference: trips.reference, tripName: trips.name }).from(vehicleAllocations).innerJoin(trips, eq(trips.id, vehicleAllocations.tripId)).where(eq(vehicleAllocations.vehicleId, id)).orderBy(desc(vehicleAllocations.startDate)),
    db.select({ i: vehicleInspections, inspector: users.name }).from(vehicleInspections).innerJoin(users, eq(users.id, vehicleInspections.inspectorId)).where(eq(vehicleInspections.vehicleId, id)).orderBy(desc(vehicleInspections.inspectedAt)),
    db.select({ d: vehicleDefects, resolvedBy: users.name }).from(vehicleDefects).leftJoin(users, eq(users.id, vehicleDefects.resolvedById)).where(eq(vehicleDefects.vehicleId, id)).orderBy(sql`${vehicleDefects.resolvedAt} is not null`, desc(vehicleDefects.createdAt)),
  ]);
  const openCritical = defects.filter((d) => !d.d.resolvedAt && d.d.severity === "critical").length;
  return { vehicle: v, allocations, inspections, defects, readiness: vehicleReadiness(v, openCritical, inspections[0]?.i.signedOff ?? null) };
}

export async function saveVehicle(db: Db, actor: Actor, id: string | null, raw: z.input<typeof vehicleSchema>) {
  requirePermission(actor, "fleet.edit");
  const v = vehicleSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [dup] = await tx.select({ id: vehicles.id }).from(vehicles).where(and(sql`upper(${vehicles.registration}) = ${v.registration}`, id ? ne(vehicles.id, id) : undefined));
    if (dup) throw conflict(`A vehicle with registration ${v.registration} already exists.`);
    if (!id) {
      const [row] = await tx.insert(vehicles).values(v).returning();
      await audit(tx, actor.id, { action: "vehicle.created", entityType: "vehicle", entityId: row!.id, summary: `Added ${v.make} ${v.model} (${v.registration})` });
      return row!;
    }
    const [row] = await tx.update(vehicles).set({ ...v, updatedAt: new Date() }).where(eq(vehicles.id, id)).returning();
    if (!row) throw notFound("Vehicle");
    await audit(tx, actor.id, { action: "vehicle.updated", entityType: "vehicle", entityId: id, summary: `Updated ${v.make} ${v.model} (${v.registration})` });
    return row;
  });
}

async function openCriticalCount(tx: DbOrTx, vehicleId: string) {
  const [{ n }] = (await tx.select({ n: sql<number>`count(*)::int` }).from(vehicleDefects).where(and(eq(vehicleDefects.vehicleId, vehicleId), isNull(vehicleDefects.resolvedAt), eq(vehicleDefects.severity, "critical")))) as [{ n: number }];
  return n;
}

/**
 * Sets operational status. Releasing a vehicle to "available" with an open critical defect requires
 * fleet.safety_override and a reason; the override is recorded in the audit log.
 */
export async function setVehicleStatus(db: Db, actor: Actor, vehicleId: string, status: "available" | "maintenance" | "unavailable" | "retired", override?: { reason: string }) {
  requirePermission(actor, "fleet.edit");
  return db.transaction(async (tx) => {
    const [v] = await tx.select().from(vehicles).where(eq(vehicles.id, vehicleId)).for("update");
    if (!v) throw notFound("Vehicle");
    const critical = status === "available" ? await openCriticalCount(tx, vehicleId) : 0;
    if (critical > 0) {
      if (!override) throw invalid("This vehicle has an open critical defect. Resolve it, or record an authorised safety override.");
      if (!can(actor, "fleet.safety_override")) throw forbidden("Only users with safety-override permission can release a vehicle with a critical defect.");
      if (override.reason.trim().length < 10) throw invalid("Give a full reason for the safety override (at least 10 characters).");
    }
    if (status === "retired") {
      const [future] = await tx.select({ id: vehicleAllocations.id }).from(vehicleAllocations).where(and(eq(vehicleAllocations.vehicleId, vehicleId), ne(vehicleAllocations.status, "cancelled"), sql`${vehicleAllocations.endDate} >= current_date`));
      if (future) throw invalid("Cancel or reassign this vehicle's upcoming allocations before retiring it.");
    }
    await tx.update(vehicles).set({ status, updatedAt: new Date() }).where(eq(vehicles.id, vehicleId));
    await audit(tx, actor.id, {
      category: critical > 0 ? "security" : "business",
      action: critical > 0 ? "vehicle.safety_override" : "vehicle.status_changed",
      entityType: "vehicle",
      entityId: vehicleId,
      summary: `${v.registration}: ${v.status} → ${status}${critical > 0 ? ` — SAFETY OVERRIDE: ${override!.reason}` : ""}`,
      changes: critical > 0 ? { openCriticalDefects: critical, reason: override!.reason } : undefined,
    });
  });
}

const allocationSchema = z
  .object({ vehicleId: z.uuid(), tripId: z.uuid(), componentId: optUuid, startDate: reqDate, endDate: reqDate, status: z.enum(["provisional", "confirmed"]), pickupLocation: optText(200), returnLocation: optText(200), driverName: optText(120), notes: optText(2000) })
  .refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "End date must be on or after start date" });

const EXCLUSION_VIOLATION = "23P01";
const isExclusionViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === EXCLUSION_VIOLATION || err?.cause?.code === EXCLUSION_VIOLATION;
};

/** Finds an overlapping allocation (including turnaround buffers) to explain a conflict. */
async function findConflict(tx: DbOrTx, vehicleId: string, start: string, end: string, buffer: number, excludeId?: string) {
  const [c] = await tx
    .select({ reference: trips.reference, startDate: vehicleAllocations.startDate, endDate: vehicleAllocations.endDate, status: vehicleAllocations.status })
    .from(vehicleAllocations)
    .innerJoin(trips, eq(trips.id, vehicleAllocations.tripId))
    .where(and(
      eq(vehicleAllocations.vehicleId, vehicleId),
      ne(vehicleAllocations.status, "cancelled"),
      excludeId ? ne(vehicleAllocations.id, excludeId) : undefined,
      sql`daterange(${vehicleAllocations.startDate}, ${vehicleAllocations.endDate} + ${vehicleAllocations.bufferDays} + 1, '[)') && daterange(${start}::date, ${end}::date + ${buffer}::int + 1, '[)')`,
    ))
    .limit(1);
  return c;
}

export async function allocateVehicle(db: Db, actor: Actor, raw: z.input<typeof allocationSchema>) {
  requirePermission(actor, "fleet.edit");
  const v = allocationSchema.parse(raw);
  try {
    return await db.transaction(async (tx) => {
      const trip = await loadScopedTrip(tx, actor, v.tripId);
      if (["closed", "cancelled", "lost"].includes(trip.status)) throw invalid("Vehicles cannot be allocated to a finished journey.");
      const [veh] = await tx.select().from(vehicles).where(eq(vehicles.id, v.vehicleId));
      if (!veh) throw notFound("Vehicle");
      if (veh.status === "retired" || veh.status === "unavailable") throw invalid(`${veh.registration} is ${veh.status} and cannot be allocated.`);
      if (v.status === "confirmed" && (await openCriticalCount(tx, veh.id)) > 0) throw invalid(`${veh.registration} has an open critical defect; it can only be held provisionally until resolved.`);
      const clash = await findConflict(tx, veh.id, v.startDate, v.endDate, veh.turnaroundDays);
      if (clash) throw conflict(`${veh.registration} is already ${clash.status === "confirmed" ? "allocated" : "held"} for ${clash.reference} (${clash.startDate} → ${clash.endDate}, plus ${veh.turnaroundDays}-day turnaround).`);
      const [a] = await tx.insert(vehicleAllocations).values({ ...v, bufferDays: veh.turnaroundDays, createdById: actor.id }).returning();
      await audit(tx, actor.id, { action: "vehicle.allocated", entityType: "trip", entityId: trip.id, summary: `${trip.reference}: ${veh.make} ${veh.model} (${veh.registration}) ${v.status} ${v.startDate} → ${v.endDate}` });
      return a!;
    });
  } catch (e) {
    // The DB exclusion constraint is the final guard against concurrent double-booking.
    if (isExclusionViolation(e)) throw conflict("That vehicle was just allocated to another journey for overlapping dates. Refresh and choose another vehicle or dates.");
    throw e;
  }
}

export async function updateAllocation(db: Db, actor: Actor, allocationId: string, change: { status?: "provisional" | "confirmed" | "cancelled"; handover?: { mileageOut: number; fuelOut: string }; return?: { mileageIn: number; fuelIn: string } }) {
  requirePermission(actor, "fleet.edit");
  try {
    return await db.transaction(async (tx) => {
      const [a] = await tx.select().from(vehicleAllocations).where(eq(vehicleAllocations.id, allocationId)).for("update");
      if (!a) throw notFound("Allocation");
      const trip = await loadScopedTrip(tx, actor, a.tripId);
      const [veh] = await tx.select().from(vehicles).where(eq(vehicles.id, a.vehicleId));
      const set: Partial<typeof vehicleAllocations.$inferInsert> = { updatedAt: new Date() };
      let summary = "";
      if (change.status) {
        if (a.status === "cancelled") throw invalid("A cancelled allocation cannot be reinstated; create a new one.");
        if (change.status === "confirmed" && (await openCriticalCount(tx, a.vehicleId)) > 0) throw invalid(`${veh!.registration} has an open critical defect and cannot be confirmed.`);
        if (change.status === "provisional" || change.status === "confirmed") {
          const clash = await findConflict(tx, a.vehicleId, a.startDate, a.endDate, a.bufferDays, a.id);
          if (clash) throw conflict(`Conflicts with ${clash.reference} (${clash.startDate} → ${clash.endDate}).`);
        }
        set.status = change.status;
        summary = `${a.status} → ${change.status}`;
      }
      if (change.handover) {
        if (a.status !== "confirmed") throw invalid("Confirm the allocation before recording the handover.");
        Object.assign(set, { mileageOut: change.handover.mileageOut, fuelOut: change.handover.fuelOut, handedOverAt: new Date() });
        summary = `handed over at ${change.handover.mileageOut} km, fuel ${change.handover.fuelOut}`;
      }
      if (change.return) {
        if (!a.handedOverAt) throw invalid("Record the handover before the return.");
        if (a.mileageOut !== null && change.return.mileageIn < a.mileageOut) throw invalid(`Return mileage cannot be below handover mileage (${a.mileageOut} km).`);
        Object.assign(set, { mileageIn: change.return.mileageIn, fuelIn: change.return.fuelIn, returnedAt: new Date() });
        await tx.update(vehicles).set({ currentMileage: change.return.mileageIn, updatedAt: new Date() }).where(eq(vehicles.id, a.vehicleId));
        summary = `returned at ${change.return.mileageIn} km, fuel ${change.return.fuelIn} — return inspection due`;
      }
      await tx.update(vehicleAllocations).set(set).where(eq(vehicleAllocations.id, allocationId));
      await audit(tx, actor.id, { action: "vehicle.allocation_updated", entityType: "trip", entityId: trip.id, summary: `${trip.reference}: ${veh!.registration} ${summary}` });
    });
  } catch (e) {
    if (isExclusionViolation(e)) throw conflict("This change overlaps another allocation of the same vehicle.");
    throw e;
  }
}

const inspectionSchema = z.object({
  kind: z.enum(["pre_trip", "return", "periodic"]),
  allocationId: optUuid,
  checks: z.array(z.object({ item: z.string().min(1).max(120), result: z.enum(["pass", "fail", "na"]), note: z.string().max(500).optional() })).min(1),
  mileage: optInt(0, 5_000_000),
  fuel: optText(20),
  notes: optText(5000),
  signedOff: z.boolean(),
  defects: z.array(z.object({ description: z.string().trim().min(3).max(1000), severity: z.enum(["minor", "major", "critical"]) })).default([]),
}).refine((v) => !(v.signedOff && v.checks.some((c) => c.result === "fail") && v.defects.length === 0), { path: ["defects"], message: "Record a defect for each failed check before signing off" });

export const INSPECTION_TEMPLATE = ["Exterior condition", "Tyres & pressures", "Lights & indicators", "Brakes", "Fluids (oil, coolant, brake)", "Fuel level", "Battery", "Tools & spare wheel", "Emergency kit & fire extinguisher", "Vehicle documents on board", "Cleanliness", "Guest amenities"];

export async function recordInspection(db: Db, actor: Actor, vehicleId: string, raw: z.input<typeof inspectionSchema>) {
  requirePermission(actor, "fleet.edit");
  const v = inspectionSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [veh] = await tx.select().from(vehicles).where(eq(vehicles.id, vehicleId)).for("update");
    if (!veh) throw notFound("Vehicle");
    const [ins] = await tx.insert(vehicleInspections).values({ vehicleId, inspectorId: actor.id, kind: v.kind, allocationId: v.allocationId ?? null, checks: v.checks, mileage: v.mileage ?? null, fuel: v.fuel ?? null, notes: v.notes ?? null, signedOff: v.signedOff }).returning();
    if (v.defects.length) await tx.insert(vehicleDefects).values(v.defects.map((d) => ({ ...d, vehicleId, inspectionId: ins!.id, reportedById: actor.id })));
    const critical = v.defects.some((d) => d.severity === "critical");
    // A critical defect immediately takes the vehicle out of service.
    if (critical && veh.status === "available") await tx.update(vehicles).set({ status: "unavailable", updatedAt: new Date() }).where(eq(vehicles.id, vehicleId));
    if (v.mileage && (!veh.currentMileage || v.mileage > veh.currentMileage)) await tx.update(vehicles).set({ currentMileage: v.mileage }).where(eq(vehicles.id, vehicleId));
    await audit(tx, actor.id, { action: "vehicle.inspected", entityType: "vehicle", entityId: vehicleId, summary: `${veh.registration}: ${v.kind.replace("_", "-")} inspection, ${v.checks.filter((c) => c.result === "fail").length} failed check(s), ${v.defects.length} defect(s)${critical ? " — CRITICAL, vehicle taken out of service" : ""}${v.signedOff ? ", signed off" : ""}` });
    return ins!;
  });
}

export async function resolveDefect(db: Db, actor: Actor, defectId: string, resolution: string) {
  requirePermission(actor, "fleet.edit");
  if (resolution.trim().length < 5) throw invalid("Describe the corrective action taken.");
  return db.transaction(async (tx) => {
    const [d] = await tx.select().from(vehicleDefects).where(eq(vehicleDefects.id, defectId)).for("update");
    if (!d) throw notFound("Defect");
    if (d.resolvedAt) throw invalid("This defect is already resolved.");
    await tx.update(vehicleDefects).set({ resolvedAt: new Date(), resolvedById: actor.id, resolution: resolution.trim(), updatedAt: new Date() }).where(eq(vehicleDefects.id, defectId));
    await audit(tx, actor.id, { action: "vehicle.defect_resolved", entityType: "vehicle", entityId: d.vehicleId, summary: `Resolved ${d.severity} defect: ${d.description.slice(0, 80)} — ${resolution.trim().slice(0, 120)}` });
  });
}

export async function tripAllocations(db: DbOrTx, tripId: string) {
  const rows = await db
    .select({ a: vehicleAllocations, v: vehicles, lastSignedOff: sql<boolean | null>`(select i.signed_off from vehicle_inspections i where i.vehicle_id = ${vehicles.id} order by i.inspected_at desc limit 1)`, openCritical: sql<number>`(select count(*)::int from vehicle_defects d where d.vehicle_id = ${vehicles.id} and d.resolved_at is null and d.severity = 'critical')` })
    .from(vehicleAllocations)
    .innerJoin(vehicles, eq(vehicles.id, vehicleAllocations.vehicleId))
    .where(eq(vehicleAllocations.tripId, tripId))
    .orderBy(asc(vehicleAllocations.startDate));
  return rows.map((r) => ({ ...r.a, vehicle: r.v, readiness: vehicleReadiness(r.v, r.openCritical, r.lastSignedOff) }));
}

/** Allocations across the fleet for the calendar (window inclusive). */
export async function fleetSchedule(db: Db, actor: Actor, from: string, to: string) {
  requirePermission(actor, "fleet.read");
  return db
    .select({ id: vehicleAllocations.id, vehicleId: vehicleAllocations.vehicleId, startDate: vehicleAllocations.startDate, endDate: vehicleAllocations.endDate, bufferDays: vehicleAllocations.bufferDays, status: vehicleAllocations.status, tripId: trips.id, reference: trips.reference, tripName: trips.name })
    .from(vehicleAllocations)
    .innerJoin(trips, eq(trips.id, vehicleAllocations.tripId))
    .where(and(ne(vehicleAllocations.status, "cancelled"), sql`${vehicleAllocations.startDate} <= ${to}::date and ${vehicleAllocations.endDate} + ${vehicleAllocations.bufferDays} >= ${from}::date`));
}

export async function vehicleOptions(db: DbOrTx) {
  return db.select({ id: vehicles.id, label: sql<string>`${vehicles.make} || ' ' || ${vehicles.model} || ' · ' || ${vehicles.registration}`, category: vehicles.category, status: vehicles.status }).from(vehicles).where(inArray(vehicles.status, ["available", "maintenance"])).orderBy(asc(vehicles.make));
}
