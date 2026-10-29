import { numeric, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const id = () => uuid("id").primaryKey().defaultRandom();

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** Monetary amount. Drizzle returns numeric as string; always compute via src/lib/finance. */
export const money = (name: string) => numeric(name, { precision: 14, scale: 2 });
export const currency = (name: string) => varchar(name, { length: 3 });
