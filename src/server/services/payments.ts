import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { D, dec, fmt2 } from "@/lib/finance/money";
import { percentOf } from "@/lib/finance/pricing";
import { balance } from "@/lib/finance/quote";
import { componentCost } from "@/lib/finance/costing";
import { currencyCode, optText, optUuid, positiveAmount, reqDate } from "@/lib/validation/common";
import { type Actor, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit";
import type { Db } from "@/server/db/client";
import { itineraryComponents, payments, suppliers, users } from "@/server/db/schema";
import { invalid } from "@/server/errors";
import { currentQuotes } from "./quotes";
import { loadScopedTrip } from "./trips";

const paymentSchema = z
  .object({
    direction: z.enum(["client_receipt", "supplier_payment"]),
    supplierId: optUuid,
    componentId: optUuid,
    amount: positiveAmount,
    currency: currencyCode,
    paidOn: reqDate,
    method: optText(60),
    reference: optText(120),
    notes: optText(2000),
    idempotencyKey: z.string().min(8).max(64),
  })
  .refine((v) => v.direction === "client_receipt" || !!v.supplierId, { path: ["supplierId"], message: "Choose the supplier paid" });

/**
 * Records a payment made outside the system (no money moves here). Repeating the same submission
 * returns the original record instead of creating a duplicate.
 */
export async function recordPayment(db: Db, actor: Actor, tripId: string, raw: z.input<typeof paymentSchema>) {
  requirePermission(actor, "finance.edit");
  const v = paymentSchema.parse(raw);
  return db.transaction(async (tx) => {
    const trip = await loadScopedTrip(tx, actor, tripId, true);
    const [dup] = await tx.select().from(payments).where(eq(payments.idempotencyKey, v.idempotencyKey));
    if (dup) return { payment: dup, duplicate: true };
    let quoteId: string | null = null;
    if (v.direction === "client_receipt") {
      const q = (await currentQuotes(tx, [tripId])).get(tripId);
      if (!q) throw invalid("Issue a quote before recording client payments, so receipts are matched to agreed terms.");
      if (v.currency !== q.currency) throw invalid(`Client payments must be recorded in the quote currency (${q.currency}).`);
      quoteId = q.id;
    }
    const [p] = await tx.insert(payments).values({ ...v, tripId, quoteId, createdById: actor.id }).onConflictDoNothing({ target: payments.idempotencyKey }).returning();
    if (!p) {
      const [again] = await tx.select().from(payments).where(eq(payments.idempotencyKey, v.idempotencyKey));
      return { payment: again!, duplicate: true };
    }
    await audit(tx, actor.id, { action: v.direction === "client_receipt" ? "payment.client_received" : "payment.supplier_paid", entityType: "trip", entityId: tripId, summary: `${trip.reference}: ${v.direction === "client_receipt" ? "received" : "paid"} ${v.currency} ${v.amount}${v.reference ? ` (ref ${v.reference})` : ""}` });
    return { payment: p, duplicate: false };
  });
}

/** Client and supplier balances for one trip. Supplier balances stay in each supplier's currency. */
export async function tripPaymentSummary(db: Db, actor: Actor, tripId: string) {
  requirePermission(actor, "finance.read_costs");
  await loadScopedTrip(db, actor, tripId);
  const [rows, comps, quote] = await Promise.all([
    db.select({ p: payments, supplierName: suppliers.name, by: users.name }).from(payments).leftJoin(suppliers, eq(suppliers.id, payments.supplierId)).leftJoin(users, eq(users.id, payments.createdById)).where(eq(payments.tripId, tripId)).orderBy(desc(payments.paidOn), desc(payments.createdAt)),
    db.select({ c: itineraryComponents, supplierName: suppliers.name }).from(itineraryComponents).innerJoin(suppliers, eq(suppliers.id, itineraryComponents.supplierId)).where(and(eq(itineraryComponents.tripId, tripId), inArray(itineraryComponents.bookingStatus, ["requested", "provisional", "confirmed", "completed"]))).orderBy(asc(suppliers.name)),
    currentQuotes(db, [tripId]).then((m) => m.get(tripId) ?? null),
  ]);
  const received = rows.filter((r) => r.p.direction === "client_receipt").reduce((a, r) => a.plus(r.p.amount), new D(0));
  const client = quote
    ? (() => {
        const due = dec(quote.totalSell);
        const deposit = quote.depositPercent ? percentOf(due, dec(quote.depositPercent)) : null;
        const b = balance(due, received);
        return { currency: quote.currency, quoteVersion: quote.version, quoteStatus: quote.status, due: fmt2(due), received: fmt2(received), outstanding: fmt2(b.outstanding), overpaid: fmt2(b.overpaid), deposit: deposit ? fmt2(deposit) : null, depositOutstanding: deposit ? fmt2(balance(deposit, received).outstanding) : null, depositDueDate: quote.depositDueDate, balanceDueDate: quote.balanceDueDate };
      })()
    : null;
  // Supplier commitments: booked segments' costs, per supplier and currency.
  const owed = new Map<string, { supplierId: string; supplierName: string; currency: string; committed: InstanceType<typeof D>; paid: InstanceType<typeof D>; nextDue: string | null }>();
  for (const { c, supplierName } of comps) {
    const cost = componentCost({ unitCost: c.unitCost, quantity: c.quantity, minimumCharge: c.minimumCharge });
    if (!cost || !c.costCurrency) continue;
    const key = `${c.supplierId}|${c.costCurrency}`;
    const e = owed.get(key) ?? { supplierId: c.supplierId!, supplierName, currency: c.costCurrency, committed: new D(0), paid: new D(0), nextDue: null };
    e.committed = e.committed.plus(cost.amount);
    if (c.supplierPaymentDue && (!e.nextDue || c.supplierPaymentDue < e.nextDue)) e.nextDue = c.supplierPaymentDue;
    owed.set(key, e);
  }
  for (const r of rows.filter((x) => x.p.direction === "supplier_payment")) {
    const key = `${r.p.supplierId}|${r.p.currency}`;
    const e = owed.get(key) ?? { supplierId: r.p.supplierId!, supplierName: r.supplierName ?? "Supplier", currency: r.p.currency, committed: new D(0), paid: new D(0), nextDue: null };
    e.paid = e.paid.plus(r.p.amount);
    owed.set(key, e);
  }
  const supplierBalances = [...owed.values()].map((e) => ({ ...e, committed: fmt2(e.committed), paid: fmt2(e.paid), outstanding: fmt2(balance(e.committed, e.paid).outstanding) }));
  return { payments: rows.map((r) => ({ ...r.p, supplierName: r.supplierName, createdByName: r.by })), client, supplierBalances };
}
