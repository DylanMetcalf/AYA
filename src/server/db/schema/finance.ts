import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import type { QuoteSnapshot } from "@/lib/finance/quote";
import { currency, id, money, timestamps } from "./columns";
import { brands, users } from "./org";
import { suppliers } from "./suppliers";
import { trips } from "./trips";
import { itineraryComponents } from "./itinerary";

/** 1 unit of `fromCurrency` = `rate` units of `toCurrency`. Manual entries are labelled as such. */
export const currencyRates = pgTable(
  "currency_rates",
  {
    id: id(),
    fromCurrency: currency("from_currency").notNull(),
    toCurrency: currency("to_currency").notNull(),
    rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),
    source: varchar("source", { length: 200 }).notNull(),
    effectiveDate: date("effective_date").notNull(),
    isManual: boolean("is_manual").notNull().default(true),
    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("fx_pair_idx").on(t.fromCurrency, t.toCurrency, t.effectiveDate), check("fx_rate_ck", sql`${t.rate} > 0 and ${t.fromCurrency} <> ${t.toCurrency}`)],
);

export const QUOTE_STATUSES = ["draft", "approved", "issued", "accepted", "declined", "expired", "superseded"] as const;
export const quoteStatus = pgEnum("quote_status", QUOTE_STATUSES);
export const pricingMode = pgEnum("pricing_mode", ["margin", "markup"]);

/**
 * Quote versions. The snapshot holds everything presented to the client (itinerary, prices, FX, terms).
 * Once a quote leaves `draft`, a DB trigger (migration 0001) rejects changes to its commercial content.
 */
export const quotes = pgTable(
  "quotes",
  {
    id: id(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    status: quoteStatus("status").notNull().default("draft"),
    currency: currency("currency").notNull(),
    pricingMode: pricingMode("pricing_mode").notNull(),
    pricingPercent: numeric("pricing_percent", { precision: 6, scale: 2 }).notNull(),
    fxBufferPercent: numeric("fx_buffer_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    totalCost: money("total_cost").notNull(),
    totalSell: money("total_sell").notNull(),
    grossProfit: money("gross_profit").notNull(),
    depositPercent: numeric("deposit_percent", { precision: 5, scale: 2 }),
    depositDueDate: date("deposit_due_date"),
    balanceDueDate: date("balance_due_date"),
    validUntil: date("valid_until"),
    terms: text("terms"),
    inclusions: text("inclusions"),
    exclusions: text("exclusions"),
    snapshot: jsonb("snapshot").$type<QuoteSnapshot>().notNull(),
    approvedById: uuid("approved_by_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    issuedById: uuid("issued_by_id").references(() => users.id),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    clientFeedback: text("client_feedback"),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("quotes_trip_version_uq").on(t.tripId, t.version),
    // At most one live (accepted) quote per trip.
    uniqueIndex("quotes_one_accepted_uq").on(t.tripId).where(sql`${t.status} = 'accepted'`),
    check("quotes_amounts_ck", sql`${t.totalCost} >= 0 and ${t.totalSell} >= 0`),
  ],
);

export const paymentDirection = pgEnum("payment_direction", ["client_receipt", "supplier_payment"]);

/** Internally recorded payments. Not bank-verified unless `verified` is set by a future integration. */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "restrict" }),
    direction: paymentDirection("direction").notNull(),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "restrict" }),
    componentId: uuid("component_id").references(() => itineraryComponents.id, { onDelete: "set null" }),
    quoteId: uuid("quote_id").references(() => quotes.id, { onDelete: "restrict" }),
    amount: money("amount").notNull(),
    currency: currency("currency").notNull(),
    paidOn: date("paid_on").notNull(),
    method: varchar("method", { length: 60 }),
    reference: varchar("reference", { length: 120 }),
    /** Client-generated per form render; a resubmitted form cannot record the payment twice. */
    idempotencyKey: varchar("idempotency_key", { length: 64 }).notNull(),
    verified: boolean("verified").notNull().default(false),
    notes: text("notes"),
    createdById: uuid("created_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_idem_uq").on(t.idempotencyKey),
    index("payments_trip_idx").on(t.tripId),
    check("payments_amount_ck", sql`${t.amount} > 0`),
    check("payments_supplier_ck", sql`${t.direction} = 'client_receipt' or ${t.supplierId} is not null`),
  ],
);

/** Planned cost per category for a trip (trip budget). Compared with estimate and actuals. */
export const tripBudgets = pgTable(
  "trip_budgets",
  {
    id: id(),
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 40 }).notNull(),
    amount: money("amount").notNull(),
    currency: currency("currency").notNull(),
    note: text("note"),
    ...timestamps,
  },
  (t) => [uniqueIndex("trip_budgets_cat_uq").on(t.tripId, t.category), check("trip_budgets_amount_ck", sql`${t.amount} >= 0`)],
);

export const targetMetric = pgEnum("target_metric", ["confirmed_value", "gross_profit", "bookings"]);

export const targets = pgTable(
  "targets",
  {
    id: id(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    metric: targetMetric("metric").notNull(),
    brandId: uuid("brand_id").references(() => brands.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: currency("currency"),
    note: text("note"),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [check("targets_period_ck", sql`${t.periodEnd} >= ${t.periodStart} and ${t.amount} > 0`)],
);

/** Small key/value store for explicit business assumptions (e.g. forecast conversion rate). */
export const settings = pgTable("settings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedById: uuid("updated_by_id").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
