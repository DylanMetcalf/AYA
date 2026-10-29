import { and, asc, eq, inArray, isNull, ne, notInArray, sql } from "drizzle-orm";
import { COMPONENT_TYPES, type BookingStatus, type ComponentType } from "@/lib/domain/components";
import { assessReadiness } from "@/lib/domain/readiness";
import { type Actor, can, requirePermission } from "@/server/auth/actor";
import type { Db } from "@/server/db/client";
import { brands, guests, itineraryComponents, itineraryDays, supplierContacts, suppliers, tasks, trips, users, vehicleAllocations, vehicles } from "@/server/db/schema";
import { tripAllocations } from "./fleet";
import { tripPaymentSummary } from "./payments";
import { loadScopedTrip, tripScope } from "./trips";

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const VEHICLE_TYPES: ComponentType[] = ["classic_car", "support_vehicle"];

export async function tripReadiness(db: Db, actor: Actor, tripId: string) {
  const trip = await loadScopedTrip(db, actor, tripId);
  const [comps, allocations, openTasks] = await Promise.all([
    db.select({ id: itineraryComponents.id, type: itineraryComponents.type, title: itineraryComponents.title, bookingStatus: itineraryComponents.bookingStatus, dayNumber: itineraryDays.dayNumber }).from(itineraryComponents).innerJoin(itineraryDays, eq(itineraryDays.id, itineraryComponents.dayId)).where(eq(itineraryComponents.tripId, tripId)).orderBy(asc(itineraryDays.dayNumber), asc(itineraryComponents.position)),
    tripAllocations(db, tripId),
    db.select({ title: tasks.title, priority: tasks.priority }).from(tasks).where(and(eq(tasks.tripId, tripId), ne(tasks.status, "done"))),
  ]);
  const allocatedComponentIds = new Set(allocations.filter((a) => a.status !== "cancelled").map((a) => a.componentId));
  const vehicleSegmentsWithoutAllocation = comps.filter((c) => VEHICLE_TYPES.includes(c.type as ComponentType) && c.bookingStatus !== "cancelled" && !allocatedComponentIds.has(c.id)).map((c) => `Day ${c.dayNumber} ${c.title}`);
  let clientDepositOutstanding: boolean | null = null;
  if (can(actor, "finance.read_costs")) {
    const pay = await tripPaymentSummary(db, actor, tripId);
    if (pay.client && pay.client.quoteStatus === "accepted") clientDepositOutstanding = pay.client.depositOutstanding ? Number(pay.client.depositOutstanding) > 0 : Number(pay.client.outstanding) > 0 && Number(pay.client.received) === 0;
  }
  return assessReadiness({
    hasLeadGuest: !!trip.leadGuestId,
    hasDates: !!trip.startDate && !!trip.endDate,
    hasManager: !!trip.managerId,
    commerciallyApproved: !!trip.commercialApprovedAt,
    clientDepositOutstanding,
    components: comps.map((c) => ({ ...c, type: c.type as ComponentType, bookingStatus: c.bookingStatus as BookingStatus })),
    vehicleSegmentsWithoutAllocation,
    allocations: allocations.map((a) => ({ status: a.status, vehicleReady: a.readiness.ready, label: `${a.vehicle.make} ${a.vehicle.model} ${a.vehicle.registration}` })),
    openTasks,
  });
}

/** Supplier arrangements across open journeys, with the calendar date of each segment. */
export async function listBookings(db: Db, actor: Actor, f: { status?: BookingStatus | "open"; withinDays?: number } = {}) {
  requirePermission(actor, "trip.read");
  const rows = await db
    .select({
      id: itineraryComponents.id, title: itineraryComponents.title, type: itineraryComponents.type, bookingStatus: itineraryComponents.bookingStatus,
      confirmationRef: itineraryComponents.confirmationRef, supplierPaymentDue: itineraryComponents.supplierPaymentDue, startTime: itineraryComponents.startTime,
      dayNumber: itineraryDays.dayNumber, tripId: trips.id, reference: trips.reference, tripName: trips.name, tripStatus: trips.status, startDate: trips.startDate,
      supplierName: suppliers.name, supplierId: suppliers.id, leadName: users.name,
    })
    .from(itineraryComponents)
    .innerJoin(itineraryDays, eq(itineraryDays.id, itineraryComponents.dayId))
    .innerJoin(trips, eq(trips.id, itineraryComponents.tripId))
    .leftJoin(suppliers, eq(suppliers.id, itineraryComponents.supplierId))
    .leftJoin(users, eq(users.id, itineraryComponents.leadUserId))
    .where(and(tripScope(actor), isNull(trips.archivedAt), notInArray(trips.status, ["closed", "cancelled", "lost"]), notInArray(itineraryComponents.type, ["free_time", "logistics"])))
    .orderBy(sql`${trips.startDate} asc nulls last`, asc(itineraryDays.dayNumber), asc(itineraryComponents.position));
  const today = new Date().toISOString().slice(0, 10);
  const list = rows.map((r) => {
    const date = r.startDate ? addDays(r.startDate, r.dayNumber - 1) : null;
    const daysAway = date ? Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000) : null;
    const def = COMPONENT_TYPES[r.type as ComponentType];
    const unconfirmed = !["confirmed", "completed", "cancelled"].includes(r.bookingStatus);
    return { ...r, date, daysAway, critical: def.critical, label: def.label, urgent: def.critical && unconfirmed && daysAway !== null && daysAway >= 0 && daysAway <= 14 };
  });
  return list.filter((b) => {
    if (f.status === "open") return !["confirmed", "completed", "cancelled"].includes(b.bookingStatus);
    if (f.status) return b.bookingStatus === f.status;
    return true;
  }).filter((b) => f.withinDays === undefined || (b.daysAway !== null && b.daysAway >= 0 && b.daysAway <= f.withinDays));
}

/** Month view: journeys travelling, vehicle allocations and tasks due. */
export async function calendarMonth(db: Db, actor: Actor, month: string) {
  requirePermission(actor, "trip.read");
  const from = `${month}-01`;
  const to = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const [tripRows, allocs, due] = await Promise.all([
    db.select({ id: trips.id, reference: trips.reference, name: trips.name, status: trips.status, startDate: trips.startDate, endDate: trips.endDate, color: brands.colorAccent, brandName: brands.name })
      .from(trips).innerJoin(brands, eq(brands.id, trips.primaryBrandId))
      .where(and(tripScope(actor), isNull(trips.archivedAt), notInArray(trips.status, ["cancelled", "lost"]), sql`${trips.startDate} <= ${to}::date and ${trips.endDate} >= ${from}::date`)).orderBy(asc(trips.startDate)),
    can(actor, "fleet.read")
      ? db.select({ id: vehicleAllocations.id, startDate: vehicleAllocations.startDate, endDate: vehicleAllocations.endDate, status: vehicleAllocations.status, reg: vehicles.registration, model: sql<string>`${vehicles.make} || ' ' || ${vehicles.model}`, tripId: vehicleAllocations.tripId, reference: trips.reference })
          .from(vehicleAllocations).innerJoin(vehicles, eq(vehicles.id, vehicleAllocations.vehicleId)).innerJoin(trips, eq(trips.id, vehicleAllocations.tripId))
          .where(and(ne(vehicleAllocations.status, "cancelled"), sql`${vehicleAllocations.startDate} <= ${to}::date and ${vehicleAllocations.endDate} >= ${from}::date`))
      : Promise.resolve([]),
    db.select({ id: tasks.id, title: tasks.title, dueDate: tasks.dueDate, priority: tasks.priority, tripId: tasks.tripId }).from(tasks)
      .where(and(ne(tasks.status, "done"), sql`${tasks.dueDate} between ${from}::date and ${to}::date`, can(actor, "trip.read_all") ? undefined : eq(tasks.assigneeId, actor.id))),
  ]);
  return { from, to, trips: tripRows, allocations: allocs, tasks: due };
}

/** Run sheet: chronological operational view. Contains no commercial pricing. */
export async function runSheet(db: Db, actor: Actor, tripId: string) {
  const trip = await loadScopedTrip(db, actor, tripId);
  const [days, comps, allocations, openTasks, lead, guestFacing, manager] = await Promise.all([
    db.select().from(itineraryDays).where(eq(itineraryDays.tripId, tripId)).orderBy(asc(itineraryDays.dayNumber)),
    db.select({ c: itineraryComponents, supplierName: suppliers.name, supplierPhone: suppliers.phone, leadName: users.name, brandName: brands.name })
      .from(itineraryComponents).leftJoin(suppliers, eq(suppliers.id, itineraryComponents.supplierId)).leftJoin(users, eq(users.id, itineraryComponents.leadUserId)).leftJoin(brands, eq(brands.id, itineraryComponents.guestFacingBrandId))
      .where(and(eq(itineraryComponents.tripId, tripId), ne(itineraryComponents.bookingStatus, "cancelled"))).orderBy(asc(itineraryComponents.position)),
    tripAllocations(db, tripId),
    db.select({ title: tasks.title, dueDate: tasks.dueDate, priority: tasks.priority, assignee: users.name }).from(tasks).leftJoin(users, eq(users.id, tasks.assigneeId)).where(and(eq(tasks.tripId, tripId), ne(tasks.status, "done"))).orderBy(asc(tasks.dueDate)),
    trip.leadGuestId ? db.select().from(guests).where(eq(guests.id, trip.leadGuestId)).then((r) => r[0] ?? null) : null,
    db.select().from(brands).where(eq(brands.id, trip.guestFacingBrandId)).then((r) => r[0]!),
    trip.managerId ? db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, trip.managerId)).then((r) => r[0] ?? null) : null,
  ]);
  const supplierIds = [...new Set(comps.map((c) => c.c.supplierId).filter((x): x is string => !!x))];
  const contacts = supplierIds.length ? await db.select({ supplierId: supplierContacts.supplierId, name: supplierContacts.name, phone: supplierContacts.phone, role: supplierContacts.role, supplierName: suppliers.name }).from(supplierContacts).innerJoin(suppliers, eq(suppliers.id, supplierContacts.supplierId)).where(and(inArray(supplierContacts.supplierId, supplierIds), eq(supplierContacts.isPrimary, true))) : [];
  const sensitive = can(actor, "guest.read_sensitive") && lead ? { dietary: lead.dietary, accessibility: lead.accessibility, medicalNotes: lead.medicalNotes } : null;
  return {
    trip, guestFacing, manager, lead: lead ? { name: `${lead.firstName} ${lead.lastName}`, phone: lead.phone } : null, sensitive,
    days: days.map((d) => ({ ...d, date: trip.startDate ? addDays(trip.startDate, d.dayNumber - 1) : null, items: comps.filter((c) => c.c.dayId === d.id).sort((a, b) => (a.c.startTime ?? "99").localeCompare(b.c.startTime ?? "99") || a.c.position - b.c.position) })),
    allocations, openTasks, contacts,
  };
}
