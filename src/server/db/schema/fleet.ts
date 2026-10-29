import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { currency, id, money, timestamps } from "./columns";
import { legalCompanies, users } from "./org";
import { suppliers } from "./suppliers";
import { trips } from "./trips";
import { itineraryComponents } from "./itinerary";

export const vehicleCategory = pgEnum("vehicle_category", ["classic", "support", "luggage", "guest_transfer", "other"]);
/** Operational status set by fleet staff. Allocation state is derived from vehicle_allocations. */
export const vehicleStatus = pgEnum("vehicle_status", ["available", "maintenance", "unavailable", "retired"]);

export const vehicles = pgTable(
  "vehicles",
  {
    id: id(),
    registration: varchar("registration", { length: 20 }).notNull(),
    make: varchar("make", { length: 60 }).notNull(),
    model: varchar("model", { length: 60 }).notNull(),
    variant: varchar("variant", { length: 80 }),
    year: integer("year"),
    category: vehicleCategory("category").notNull(),
    /** Who owns the vehicle (Schmidt Car Hire, ULTIMA or another company). */
    ownerCompanyId: uuid("owner_company_id").references(() => legalCompanies.id, { onDelete: "restrict" }),
    /** Who supplies it to journeys commercially. */
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "restrict" }),
    status: vehicleStatus("status").notNull().default("available"),
    seats: integer("seats"),
    luggageNote: varchar("luggage_note", { length: 200 }),
    dailyRate: money("daily_rate"),
    rateCurrency: currency("rate_currency"),
    /** Preparation/cleaning days required after a return before the next allocation (OPEN_DECISIONS D10). */
    turnaroundDays: integer("turnaround_days").notNull().default(1),
    insuranceExpiry: date("insurance_expiry"),
    licenceExpiry: date("licence_expiry"),
    currentMileage: integer("current_mileage"),
    notes: text("notes"),
    isDemo: boolean("is_demo").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("vehicles_reg_uq").on(sql`upper(${t.registration})`), check("vehicles_turnaround_ck", sql`${t.turnaroundDays} between 0 and 30`)],
);

export const allocationStatus = pgEnum("allocation_status", ["provisional", "confirmed", "cancelled"]);

/**
 * Non-cancelled allocations of the same vehicle may not overlap, including the turnaround buffer.
 * Enforced by an exclusion constraint (migration 0001) so concurrent requests cannot double-book.
 */
export const vehicleAllocations = pgTable(
  "vehicle_allocations",
  {
    id: id(),
    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "restrict" }),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "restrict" }),
    componentId: uuid("component_id").references(() => itineraryComponents.id, { onDelete: "set null" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    bufferDays: integer("buffer_days").notNull(),
    status: allocationStatus("status").notNull().default("provisional"),
    pickupLocation: varchar("pickup_location", { length: 200 }),
    returnLocation: varchar("return_location", { length: 200 }),
    driverName: varchar("driver_name", { length: 120 }),
    mileageOut: integer("mileage_out"),
    mileageIn: integer("mileage_in"),
    fuelOut: varchar("fuel_out", { length: 20 }),
    fuelIn: varchar("fuel_in", { length: 20 }),
    handedOverAt: timestamp("handed_over_at", { withTimezone: true }),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("alloc_vehicle_idx").on(t.vehicleId),
    index("alloc_trip_idx").on(t.tripId),
    check("alloc_dates_ck", sql`${t.endDate} >= ${t.startDate} and ${t.bufferDays} >= 0`),
    check("alloc_mileage_ck", sql`${t.mileageIn} is null or ${t.mileageOut} is null or ${t.mileageIn} >= ${t.mileageOut}`),
  ],
);

export const inspectionKind = pgEnum("inspection_kind", ["pre_trip", "return", "periodic"]);
export type InspectionCheck = { item: string; result: "pass" | "fail" | "na"; note?: string };

export const vehicleInspections = pgTable("vehicle_inspections", {
  id: id(),
  vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "restrict" }),
  allocationId: uuid("allocation_id").references(() => vehicleAllocations.id, { onDelete: "set null" }),
  kind: inspectionKind("kind").notNull(),
  inspectorId: uuid("inspector_id").notNull().references(() => users.id),
  inspectedAt: timestamp("inspected_at", { withTimezone: true }).notNull().defaultNow(),
  checks: jsonb("checks").$type<InspectionCheck[]>().notNull(),
  mileage: integer("mileage"),
  fuel: varchar("fuel", { length: 20 }),
  notes: text("notes"),
  /** Inspector's sign-off. Not proof of mechanical safety without a qualified inspection. */
  signedOff: boolean("signed_off").notNull().default(false),
});

export const defectSeverity = pgEnum("defect_severity", ["minor", "major", "critical"]);
export const vehicleDefects = pgTable(
  "vehicle_defects",
  {
    id: id(),
    vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id, { onDelete: "restrict" }),
    inspectionId: uuid("inspection_id").references(() => vehicleInspections.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    severity: defectSeverity("severity").notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedById: uuid("resolved_by_id").references(() => users.id),
    resolution: text("resolution"),
    reportedById: uuid("reported_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [index("defects_vehicle_idx").on(t.vehicleId), check("defects_resolution_ck", sql`${t.resolvedAt} is null or ${t.resolution} is not null`)],
);
