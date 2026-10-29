import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { currency, id, money, timestamps } from "./columns";
import { users } from "./org";
import { trips } from "./trips";

export const inventoryKind = pgEnum("inventory_kind", ["consumable", "reusable"]);

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: id(),
    sku: varchar("sku", { length: 40 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    category: varchar("category", { length: 60 }).notNull(),
    kind: inventoryKind("kind").notNull(),
    unit: varchar("unit", { length: 20 }).notNull().default("each"),
    reorderThreshold: integer("reorder_threshold").notNull().default(0),
    unitCost: money("unit_cost"),
    currency: currency("currency"),
    location: varchar("location", { length: 120 }),
    isActive: boolean("is_active").notNull().default(true),
    isDemo: boolean("is_demo").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("inventory_sku_uq").on(sql`upper(${t.sku})`), check("inventory_threshold_ck", sql`${t.reorderThreshold} >= 0`)],
);

/**
 * Stock ledger. Quantities are always positive; the movement type gives the direction.
 *   on_hand  : receive +, adjust_in +, return +, issue −, adjust_out −, write_off −
 *   reserved : reserve +, release −, issue − (issuing consumes the trip's reservation)
 *   with trip (reusable): issue +, return −, lost −
 * Balances are derived, never stored, so the history always explains the quantity.
 */
export const movementType = pgEnum("movement_type", ["receive", "adjust_in", "adjust_out", "reserve", "release", "issue", "return", "write_off", "lost"]);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: id(),
    itemId: uuid("item_id").notNull().references(() => inventoryItems.id, { onDelete: "restrict" }),
    tripId: uuid("trip_id").references(() => trips.id, { onDelete: "restrict" }),
    type: movementType("type").notNull(),
    quantity: integer("quantity").notNull(),
    note: text("note"),
    idempotencyKey: varchar("idempotency_key", { length: 64 }),
    actorId: uuid("actor_id").references(() => users.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("movements_item_idx").on(t.itemId),
    index("movements_trip_idx").on(t.tripId),
    uniqueIndex("movements_idem_uq").on(t.idempotencyKey),
    check("movements_qty_ck", sql`${t.quantity} > 0`),
    check("movements_trip_ck", sql`${t.type} not in ('reserve','release','issue','return','lost') or ${t.tripId} is not null`),
  ],
);
