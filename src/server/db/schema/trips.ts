import { sql } from "drizzle-orm";
import {
  bigserial,
  check,
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { TRIP_STATUSES } from "@/lib/domain/trip-lifecycle";
import { currency, id, money, timestamps } from "./columns";
import { clientOrganisations, guests } from "./crm";
import { brands, legalCompanies, users } from "./org";

export const tripStatus = pgEnum("trip_status", TRIP_STATUSES);
export const tripReferenceSeq = pgSequence("trip_reference_seq", { startWith: 1 });

export const trips = pgTable(
  "trips",
  {
    id: id(),
    reference: varchar("reference", { length: 20 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    status: tripStatus("status").notNull().default("enquiry"),
    leadGuestId: uuid("lead_guest_id").references(() => guests.id, { onDelete: "set null" }),
    clientOrganisationId: uuid("client_organisation_id").references(() => clientOrganisations.id, {
      onDelete: "set null",
    }),
    /** Commercial context (see PRODUCT_SPECIFICATION §Business structure). */
    primaryBrandId: uuid("primary_brand_id").notNull().references(() => brands.id, { onDelete: "restrict" }),
    guestFacingBrandId: uuid("guest_facing_brand_id").notNull().references(() => brands.id, { onDelete: "restrict" }),
    operatingCompanyId: uuid("operating_company_id").references(() => legalCompanies.id, { onDelete: "restrict" }),
    quotingCompanyId: uuid("quoting_company_id").references(() => legalCompanies.id, { onDelete: "restrict" }),
    managerId: uuid("manager_id").references(() => users.id, { onDelete: "set null" }),
    startDate: date("start_date"),
    endDate: date("end_date"),
    adults: integer("adults").notNull().default(2),
    children: integer("children").notNull().default(0),
    rooms: integer("rooms").notNull().default(1),
    primaryDestination: varchar("primary_destination", { length: 200 }),
    purpose: varchar("purpose", { length: 200 }),
    occasion: varchar("occasion", { length: 200 }),
    experienceStyle: varchar("experience_style", { length: 200 }),
    enquirySource: varchar("enquiry_source", { length: 120 }),
    currency: currency("currency").notNull().default("ZAR"),
    /** Manager's estimate for pipeline purposes; never used as a financial fact. */
    estimatedValue: money("estimated_value"),
    internalNotes: text("internal_notes"),
    guestNotes: text("guest_notes"),
    specialRequirements: text("special_requirements"),
    commercialApprovedAt: timestamp("commercial_approved_at", { withTimezone: true }),
    commercialApprovedById: uuid("commercial_approved_by_id").references(() => users.id),
    closingReason: text("closing_reason"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    isDemo: boolean("is_demo").notNull().default(false),
    /** Optimistic concurrency: incremented on every update; writes must match the expected version. */
    version: integer("version").notNull().default(1),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("trips_reference_uq").on(t.reference),
    index("trips_status_idx").on(t.status),
    index("trips_start_idx").on(t.startDate),
    check("trips_dates_ck", sql`${t.endDate} is null or ${t.startDate} is null or ${t.endDate} >= ${t.startDate}`),
    check("trips_party_ck", sql`${t.adults} >= 0 and ${t.children} >= 0 and ${t.rooms} >= 0`),
  ],
);

/** Additional brands/companies participating in a trip (primary and guest-facing live on `trips`). */
export const tripBrandRole = pgEnum("trip_brand_role", ["participating", "supplying"]);
export const tripBrands = pgTable(
  "trip_brands",
  {
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id").notNull().references(() => brands.id, { onDelete: "restrict" }),
    role: tripBrandRole("role").notNull(),
    note: varchar("note", { length: 200 }),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.brandId, t.role] })],
);

export const tripGuests = pgTable(
  "trip_guests",
  {
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    guestId: uuid("guest_id").notNull().references(() => guests.id, { onDelete: "restrict" }),
    isLead: boolean("is_lead").notNull().default(false),
    travellerType: varchar("traveller_type", { length: 10 }).notNull().default("adult"),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.guestId] })],
);

export const tripAssignmentRole = pgEnum("trip_assignment_role", [
  "trip_manager",
  "operations",
  "guide",
  "driver",
  "host",
  "finance",
]);
export const tripAssignments = pgTable(
  "trip_assignments",
  {
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: tripAssignmentRole("role").notNull(),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.userId, t.role] }), index("trip_assign_user_idx").on(t.userId)],
);

export const tripStatusHistory = pgTable(
  "trip_status_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    fromStatus: tripStatus("from_status"),
    toStatus: tripStatus("to_status").notNull(),
    reason: text("reason"),
    /** True when lifecycle rules were bypassed by a user holding trip.override. */
    overridden: boolean("overridden").notNull().default(false),
    overriddenRules: text("overridden_rules"),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("trip_status_hist_trip_idx").on(t.tripId)],
);
