import { asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { computeBalances, normaliseConsumableBalances, validateMovement, type MovementType } from "@/lib/domain/inventory";
import { currencyCode, isUuid, optAmount, optText, optUuid, reqText } from "@/lib/validation/common";
import { type Actor, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit";
import type { Db } from "@/server/db/client";
import { inventoryItems, inventoryMovements, trips, users } from "@/server/db/schema";
import { conflict, invalid, notFound } from "@/server/errors";
import { loadScopedTrip } from "./trips";

export const itemSchema = z.object({
  sku: reqText(40).transform((s) => s.toUpperCase()),
  name: reqText(200),
  category: reqText(60),
  kind: z.enum(["consumable", "reusable"]),
  unit: reqText(20),
  reorderThreshold: z.coerce.number().int().min(0).max(1_000_000),
  unitCost: optAmount,
  currency: z.preprocess((v) => (v === "" ? null : v), currencyCode.nullish()),
  location: optText(120),
});

async function itemsWithBalances(db: Db) {
  const items = await db.select().from(inventoryItems).where(eq(inventoryItems.isActive, true)).orderBy(asc(inventoryItems.category), asc(inventoryItems.name));
  // Balances depend on chronological order (an issue consumes the earlier reservation).
  const moves = await db.select({ itemId: inventoryMovements.itemId, type: inventoryMovements.type, quantity: inventoryMovements.quantity, tripId: inventoryMovements.tripId }).from(inventoryMovements).orderBy(asc(inventoryMovements.at), asc(inventoryMovements.id));
  return items.map((i) => {
    const b = normaliseConsumableBalances(computeBalances(moves.filter((m) => m.itemId === i.id)), i.kind);
    return { ...i, onHand: b.onHand, reserved: b.reserved, available: b.available, withTrips: b.withTrips, belowThreshold: b.available <= i.reorderThreshold };
  });
}

export async function listInventory(db: Db, actor: Actor) {
  requirePermission(actor, "inventory.read");
  return itemsWithBalances(db);
}

export async function getInventoryItem(db: Db, actor: Actor, id: string) {
  requirePermission(actor, "inventory.read");
  if (!isUuid(id)) throw notFound("Item");
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
  if (!item) throw notFound("Item");
  const movements = await db.select({ m: inventoryMovements, reference: trips.reference, actor: users.name }).from(inventoryMovements).leftJoin(trips, eq(trips.id, inventoryMovements.tripId)).leftJoin(users, eq(users.id, inventoryMovements.actorId)).where(eq(inventoryMovements.itemId, id)).orderBy(desc(inventoryMovements.at));
  const b = normaliseConsumableBalances(computeBalances([...movements].reverse().map((r) => r.m)), item.kind);
  return { item, movements, balances: { onHand: b.onHand, reserved: b.reserved, available: b.available, withTrips: b.withTrips, byTrip: [...b.byTrip.entries()].filter(([k]) => k !== "_").map(([tripId, e]) => ({ tripId, ...e, reference: movements.find((m) => m.m.tripId === tripId)?.reference ?? null })) } };
}

export async function saveInventoryItem(db: Db, actor: Actor, id: string | null, raw: z.input<typeof itemSchema>) {
  requirePermission(actor, "inventory.edit");
  const v = itemSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [dup] = await tx.select({ id: inventoryItems.id }).from(inventoryItems).where(sql`upper(${inventoryItems.sku}) = ${v.sku} ${id ? sql`and ${inventoryItems.id} <> ${id}` : sql``}`);
    if (dup) throw conflict(`SKU ${v.sku} is already used.`);
    if (!id) {
      const [row] = await tx.insert(inventoryItems).values(v).returning();
      await audit(tx, actor.id, { action: "inventory.item_created", entityType: "inventory_item", entityId: row!.id, summary: `Added ${v.name} (${v.sku})` });
      return row!;
    }
    const [row] = await tx.update(inventoryItems).set({ ...v, updatedAt: new Date() }).where(eq(inventoryItems.id, id)).returning();
    if (!row) throw notFound("Item");
    await audit(tx, actor.id, { action: "inventory.item_updated", entityType: "inventory_item", entityId: id, summary: `Updated ${v.name}` });
    return row;
  });
}

const movementSchema = z.object({
  type: z.enum(["receive", "adjust_in", "adjust_out", "reserve", "release", "issue", "return", "write_off", "lost"]),
  quantity: z.coerce.number().int().positive("Quantity must be greater than zero").max(1_000_000),
  tripId: optUuid,
  note: optText(1000),
  idempotencyKey: z.string().min(8).max(64),
}).refine((v) => !["reserve", "release", "issue", "return", "lost"].includes(v.type) || v.tripId, { path: ["tripId"], message: "Choose the journey" })
  .refine((v) => !["adjust_in", "adjust_out", "write_off", "lost"].includes(v.type) || v.note, { path: ["note"], message: "Explain the adjustment" });

export const MOVEMENT_LABEL: Record<MovementType, string> = { receive: "Received", adjust_in: "Adjusted up", adjust_out: "Adjusted down", reserve: "Reserved", release: "Released", issue: "Issued", return: "Returned", write_off: "Written off (damaged)", lost: "Lost on journey" };

/**
 * Records a stock movement. The item row is locked so concurrent movements are validated in sequence,
 * preventing double allocation; the idempotency key prevents duplicate submissions.
 */
export async function recordMovement(db: Db, actor: Actor, itemId: string, raw: z.input<typeof movementSchema>) {
  requirePermission(actor, "inventory.edit");
  const v = movementSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, itemId)).for("update");
    if (!item) throw notFound("Item");
    const [dup] = await tx.select().from(inventoryMovements).where(eq(inventoryMovements.idempotencyKey, v.idempotencyKey));
    if (dup) return { movement: dup, duplicate: true };
    if (v.tripId) await loadScopedTrip(tx, actor, v.tripId);
    const moves = await tx.select({ type: inventoryMovements.type, quantity: inventoryMovements.quantity, tripId: inventoryMovements.tripId }).from(inventoryMovements).where(eq(inventoryMovements.itemId, itemId)).orderBy(asc(inventoryMovements.at), asc(inventoryMovements.id));
    const error = validateMovement(computeBalances(moves), { type: v.type, quantity: v.quantity, tripId: v.tripId ?? null }, item.kind);
    if (error) throw invalid(error);
    const [m] = await tx.insert(inventoryMovements).values({ itemId, tripId: v.tripId ?? null, type: v.type, quantity: v.quantity, note: v.note ?? null, idempotencyKey: v.idempotencyKey, actorId: actor.id }).returning();
    await audit(tx, actor.id, { action: `inventory.${v.type}`, entityType: "inventory_item", entityId: itemId, summary: `${MOVEMENT_LABEL[v.type]} ${v.quantity} × ${item.name}${v.note ? ` — ${v.note}` : ""}` });
    return { movement: m!, duplicate: false };
  });
}

export async function tripInventory(db: Db, actor: Actor, tripId: string) {
  requirePermission(actor, "inventory.read");
  await loadScopedTrip(db, actor, tripId);
  const itemIds = (await db.selectDistinct({ id: inventoryMovements.itemId }).from(inventoryMovements).where(eq(inventoryMovements.tripId, tripId))).map((r) => r.id);
  const out = [];
  for (const id of itemIds) {
    const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    const moves = await db.select().from(inventoryMovements).where(eq(inventoryMovements.itemId, id)).orderBy(asc(inventoryMovements.at), asc(inventoryMovements.id));
    const e = computeBalances(moves).byTrip.get(tripId) ?? { reserved: 0, out: 0, issued: 0 };
    out.push({ item: item!, reserved: e.reserved, issued: e.issued, out: item!.kind === "reusable" ? e.out : 0 });
  }
  return out;
}
