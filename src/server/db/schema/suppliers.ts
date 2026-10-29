import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { currency, id, money, timestamps } from "./columns";
import { legalCompanies, users } from "./org";

export const supplierCategory = pgEnum("supplier_category", [
  "lodge",
  "camp",
  "accommodation",
  "restaurant",
  "private_chef",
  "guide",
  "host",
  "helicopter",
  "aviation",
  "vehicle_partner",
  "transfer",
  "activity",
  "conservation",
  "amenity",
  "event",
  "other",
]);

export const verificationStatus = pgEnum("verification_status", ["unverified", "verified", "needs_review"]);

export const suppliers = pgTable(
  "suppliers",
  {
    id: id(),
    name: varchar("name", { length: 200 }).notNull(),
    category: supplierCategory("category").notNull(),
    /** Set when the supplier is itself a configured legal company (e.g. Schmidt Car Hire). */
    legalCompanyId: uuid("legal_company_id").references(() => legalCompanies.id, { onDelete: "set null" }),
    email: varchar("email", { length: 254 }),
    phone: varchar("phone", { length: 50 }),
    website: varchar("website", { length: 300 }),
    location: varchar("location", { length: 200 }),
    region: varchar("region", { length: 120 }),
    description: text("description"),
    paymentTerms: text("payment_terms"),
    cancellationTerms: text("cancellation_terms"),
    defaultCurrency: currency("default_currency").notNull().default("ZAR"),
    verification: verificationStatus("verification").notNull().default("unverified"),
    internalNotes: text("internal_notes"),
    isActive: boolean("is_active").notNull().default(true),
    isDemo: boolean("is_demo").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("suppliers_name_idx").on(t.name)],
);

export const supplierContacts = pgTable("supplier_contacts", {
  id: id(),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 120 }).notNull(),
  role: varchar("role", { length: 120 }),
  email: varchar("email", { length: 254 }),
  phone: varchar("phone", { length: 50 }),
  isPrimary: boolean("is_primary").notNull().default(false),
  ...timestamps,
});

export const rateBasis = pgEnum("rate_basis", [
  "per_person",
  "per_person_sharing",
  "per_room_per_night",
  "per_room_per_stay",
  "per_vehicle_per_day",
  "per_vehicle_per_km",
  "per_transfer",
  "per_flight",
  "per_hour",
  "per_guide_per_day",
  "per_activity",
  "per_group",
  "per_item",
  "fixed",
]);

/** Bookable service offered by a supplier (a room type, a helicopter route, a vehicle-day). */
export const supplierServices = pgTable("supplier_services", {
  id: id(),
  supplierId: uuid("supplier_id").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  componentType: varchar("component_type", { length: 40 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

export const rateType = pgEnum("rate_type", [
  "public",
  "supplier_provided",
  "trade",
  "contracted",
  "indicative",
  "manual_estimate",
]);

export const rateStatus = pgEnum("rate_status", ["draft", "pending_review", "approved", "superseded", "rejected"]);

/**
 * Versioned rate. A change never edits an approved row: it inserts a new version that supersedes the
 * previous one. Quotes store their own snapshot, so rate changes never alter issued quotes.
 */
export const supplierRates = pgTable(
  "supplier_rates",
  {
    id: id(),
    serviceId: uuid("service_id").notNull().references(() => supplierServices.id, { onDelete: "cascade" }),
    /** Stable identity across versions of the same rate line. */
    lineageId: uuid("lineage_id").notNull(),
    version: integer("version").notNull().default(1),
    name: varchar("name", { length: 200 }).notNull(),
    currency: currency("currency").notNull(),
    amount: money("amount").notNull(),
    basis: rateBasis("basis").notNull(),
    minimumCharge: money("minimum_charge"),
    minimumNights: integer("minimum_nights"),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    season: varchar("season", { length: 80 }),
    occupancyNote: varchar("occupancy_note", { length: 200 }),
    inclusions: text("inclusions"),
    exclusions: text("exclusions"),
    type: rateType("type").notNull(),
    status: rateStatus("status").notNull().default("draft"),
    source: varchar("source", { length: 300 }).notNull(),
    obtainedOn: date("obtained_on"),
    verifiedOn: date("verified_on"),
    internalNotes: text("internal_notes"),
    createdById: uuid("created_by_id").references(() => users.id),
    approvedById: uuid("approved_by_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("supplier_rates_lineage_version_uq").on(t.lineageId, t.version),
    index("supplier_rates_service_idx").on(t.serviceId),
  ],
);
