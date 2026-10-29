import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, time, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { BOOKING_STATUSES, COMPONENT_TYPE_KEYS } from "@/lib/domain/components";
import { currency, id, money, timestamps } from "./columns";
import { brands, legalCompanies, users } from "./org";
import { rateBasis, supplierRates, suppliers } from "./suppliers";
import { trips } from "./trips";

export const itineraryDays = pgTable(
  "itinerary_days",
  {
    id: id(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    /** 1-based. The calendar date is derived from the trip start date, so date changes never go stale. */
    dayNumber: integer("day_number").notNull(),
    title: varchar("title", { length: 200 }),
    location: varchar("location", { length: 200 }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("itinerary_days_trip_day_uq").on(t.tripId, t.dayNumber), check("itinerary_days_day_ck", sql`${t.dayNumber} >= 1`)],
);

export const componentType = pgEnum("component_type", COMPONENT_TYPE_KEYS as [string, ...string[]]);
export const bookingStatus = pgEnum("booking_status", BOOKING_STATUSES);
export const costSource = pgEnum("cost_source", ["rate", "manual", "none"]);

/**
 * A journey segment. Carries its own brand context (operating / guest-facing), provider and supplier,
 * booking state, and costing inputs. Cost = unit_cost × quantity (min charge applied) via src/lib/finance.
 */
export const itineraryComponents = pgTable(
  "itinerary_components",
  {
    id: id(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    dayId: uuid("day_id").notNull().references(() => itineraryDays.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    type: componentType("type").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    startTime: time("start_time"),
    endTime: time("end_time"),
    startLocation: varchar("start_location", { length: 200 }),
    endLocation: varchar("end_location", { length: 200 }),
    operatingBrandId: uuid("operating_brand_id").references(() => brands.id, { onDelete: "restrict" }),
    guestFacingBrandId: uuid("guest_facing_brand_id").references(() => brands.id, { onDelete: "restrict" }),
    providerCompanyId: uuid("provider_company_id").references(() => legalCompanies.id, { onDelete: "restrict" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "restrict" }),
    supplierRateId: uuid("supplier_rate_id").references(() => supplierRates.id, { onDelete: "restrict" }),
    leadUserId: uuid("lead_user_id").references(() => users.id, { onDelete: "set null" }),
    bookingStatus: bookingStatus("booking_status").notNull().default("planned"),
    confirmationRef: varchar("confirmation_ref", { length: 120 }),
    confirmedOn: date("confirmed_on"),
    supplierPaymentDue: date("supplier_payment_due"),
    guestDescription: text("guest_description"),
    internalNotes: text("internal_notes"),
    details: jsonb("details").$type<Record<string, string>>().notNull().default({}),
    costSource: costSource("cost_source").notNull().default("none"),
    costCurrency: currency("cost_currency"),
    unitCost: money("unit_cost"),
    quantity: numeric("quantity", { precision: 10, scale: 2 }),
    costBasis: rateBasis("cost_basis"),
    minimumCharge: money("minimum_charge"),
    actualCost: money("actual_cost"),
    /** Excluded components stay in the plan but are not priced into quotes (e.g. guest pays direct). */
    includedInQuote: boolean("included_in_quote").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("components_trip_idx").on(t.tripId),
    index("components_day_idx").on(t.dayId, t.position),
    index("components_rate_idx").on(t.supplierRateId),
    check("components_cost_ck", sql`(${t.unitCost} is null or ${t.unitCost} >= 0) and (${t.quantity} is null or ${t.quantity} >= 0) and (${t.actualCost} is null or ${t.actualCost} >= 0)`),
    check("components_cost_currency_ck", sql`${t.unitCost} is null or ${t.costCurrency} is not null`),
  ],
);
