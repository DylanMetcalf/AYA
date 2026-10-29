import { and, asc, desc, eq, inArray, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { COMPONENT_TYPES } from "@/lib/domain/components";
import { CONFIRMED_STATUSES } from "@/lib/domain/trip-lifecycle";
import { forecastToTarget } from "@/lib/finance/forecast";
import { resolveRate, type FxRate } from "@/lib/finance/fx";
import { D, type Dec, dec, fmt2, round2 } from "@/lib/finance/money";
import { marginPercent } from "@/lib/finance/pricing";
import { costTrip } from "@/lib/finance/quote";
import { amount, currencyCode, optText, optUuid, percent, reqDate } from "@/lib/validation/common";
import { type Actor, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit";
import type { Db } from "@/server/db/client";
import { brands, currencyRates, itineraryComponents, payments, quotes, settings, targets, tripBudgets, trips } from "@/server/db/schema";
import { invalid, notFound } from "@/server/errors";
import { loadCostingInputs } from "./quotes";
import { loadScopedTrip, tripScope } from "./trips";

const today = () => new Date().toISOString().slice(0, 10);
const addTo = (m: Record<string, Dec>, k: string, v: Dec) => (m[k] = (m[k] ?? new D(0)).plus(v));
const toStrings = (m: Record<string, Dec>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, fmt2(v)]));

/**
 * Portfolio view. Definitions (docs/METRICS.md):
 *  - Quoted pipeline: sell value of issued quotes awaiting a decision.
 *  - Confirmed booking value: accepted quotes on trips not cancelled.
 *  - Cash received: client receipts recorded. None of these is accounting revenue.
 * Totals are kept per currency; nothing is silently converted.
 */
export async function getFinancials(db: Db, actor: Actor) {
  requirePermission(actor, "finance.read_costs");
  const rows = await db
    .select({ t: trips, brandName: brands.name, q: quotes })
    .from(trips)
    .innerJoin(brands, eq(brands.id, trips.primaryBrandId))
    .innerJoin(quotes, and(eq(quotes.tripId, trips.id), inArray(quotes.status, ["issued", "accepted"])))
    .where(and(tripScope(actor), isNull(trips.archivedAt)))
    .orderBy(sql`${trips.startDate} asc nulls last`);
  const received = await db
    .select({ tripId: payments.tripId, currency: payments.currency, total: sql<string>`sum(${payments.amount})::text` })
    .from(payments)
    .where(eq(payments.direction, "client_receipt"))
    .groupBy(payments.tripId, payments.currency);
  const supplierPaid = await db
    .select({ tripId: payments.tripId, currency: payments.currency, total: sql<string>`sum(${payments.amount})::text` })
    .from(payments)
    .where(eq(payments.direction, "supplier_payment"))
    .groupBy(payments.tripId, payments.currency);
  const pipeline: Record<string, Dec> = {}, confirmed: Record<string, Dec> = {}, profit: Record<string, Dec> = {}, cash: Record<string, Dec> = {}, outstanding: Record<string, Dec> = {};
  const lines = rows.map(({ t, brandName, q }) => {
    const rec = dec(received.find((r) => r.tripId === t.id && r.currency === q.currency)?.total ?? "0");
    const sell = dec(q.totalSell);
    const out = q.status === "accepted" && t.status !== "cancelled" ? D.max(sell.minus(rec), 0) : new D(0);
    if (q.status === "issued") addTo(pipeline, q.currency, sell);
    if (q.status === "accepted" && t.status !== "cancelled") {
      addTo(confirmed, q.currency, sell);
      addTo(profit, q.currency, dec(q.grossProfit));
      addTo(outstanding, q.currency, out);
    }
    addTo(cash, q.currency, rec);
    return {
      tripId: t.id, reference: t.reference, name: t.name, status: t.status, startDate: t.startDate, brandName, currency: q.currency,
      quoteVersion: q.version, quoteStatus: q.status, sell: q.totalSell, cost: q.totalCost, grossProfit: q.grossProfit,
      margin: marginPercent(sell, sell.minus(dec(q.grossProfit)))?.toFixed(1) ?? null, received: fmt2(rec), outstanding: fmt2(out),
      supplierPaid: supplierPaid.filter((s) => s.tripId === t.id).map((s) => `${s.currency} ${s.total}`).join(", ") || null,
      isDemo: t.isDemo,
    };
  });
  return { lines, totals: { pipeline: toStrings(pipeline), confirmed: toStrings(confirmed), grossProfit: toStrings(profit), cash: toStrings(cash), outstanding: toStrings(outstanding) } };
}

const budgetSchema = z.object({ category: z.enum(["accommodation", "transport", "experiences", "guest", "logistics"]), amount, note: optText(1000) });

export async function setTripBudget(db: Db, actor: Actor, tripId: string, raw: z.input<typeof budgetSchema>) {
  requirePermission(actor, "finance.edit");
  const v = budgetSchema.parse(raw);
  return db.transaction(async (tx) => {
    const trip = await loadScopedTrip(tx, actor, tripId);
    const [before] = await tx.select().from(tripBudgets).where(and(eq(tripBudgets.tripId, tripId), eq(tripBudgets.category, v.category)));
    await tx.insert(tripBudgets).values({ tripId, ...v, currency: trip.currency }).onConflictDoUpdate({ target: [tripBudgets.tripId, tripBudgets.category], set: { amount: v.amount, note: v.note ?? null, updatedAt: new Date() } });
    await audit(tx, actor.id, { action: "budget.set", entityType: "trip", entityId: tripId, summary: `${trip.reference}: ${v.category} budget ${before ? `${before.amount} → ` : ""}${trip.currency} ${v.amount}` });
  });
}

/** Budget vs quoted (issued snapshot) vs current estimate vs actual, per cost category, in trip currency. */
export async function getTripBudget(db: Db, actor: Actor, tripId: string) {
  requirePermission(actor, "finance.read_costs");
  const trip = await loadScopedTrip(db, actor, tripId);
  const [budgetRows, { components, fx }, quoteRows] = await Promise.all([
    db.select().from(tripBudgets).where(eq(tripBudgets.tripId, tripId)),
    loadCostingInputs(db, tripId),
    db.select().from(quotes).where(and(eq(quotes.tripId, tripId), inArray(quotes.status, ["issued", "accepted"]))).orderBy(sql`case when ${quotes.status} = 'accepted' then 0 else 1 end`, desc(quotes.version)).limit(1),
  ]);
  const estimate = costTrip(components, { currency: trip.currency, rates: fx, onDate: today() });
  // Actuals: recorded actual cost per segment, converted at today's rate (labelled as such in the UI).
  const actualByCat: Record<string, Dec> = {};
  const actualRows = await db.select({ id: itineraryComponents.id, actualCost: itineraryComponents.actualCost, currency: itineraryComponents.costCurrency }).from(itineraryComponents).where(and(eq(itineraryComponents.tripId, tripId), isNotNull(itineraryComponents.actualCost)));
  let actualUnconverted = 0;
  for (const r of actualRows) {
    const comp = components.find((c) => c.id === r.id);
    const rate = r.currency ? resolveRate(fx, r.currency, trip.currency, today()) : null;
    if (!comp || !rate) { actualUnconverted++; continue; }
    addTo(actualByCat, COMPONENT_TYPES[comp.type].category, round2(dec(r.actualCost!).times(rate.rate)));
  }
  const quotedByCat: Record<string, Dec> = {};
  const q = quoteRows[0];
  if (q) for (const l of q.snapshot.lines) addTo(quotedByCat, COMPONENT_TYPES[l.type as keyof typeof COMPONENT_TYPES]?.category ?? "experiences", dec(l.convertedCost));
  const cats = ["accommodation", "transport", "experiences", "guest", "logistics"] as const;
  const rows = cats.map((c) => {
    const budget = budgetRows.find((b) => b.category === c);
    const est = estimate.byCategory[c] ?? new D(0);
    return {
      category: c,
      budget: budget?.amount ?? null,
      quoted: quotedByCat[c] ? fmt2(quotedByCat[c]!) : null,
      estimate: fmt2(est),
      actual: actualByCat[c] ? fmt2(actualByCat[c]!) : null,
      variance: budget ? fmt2(est.minus(dec(budget.amount))) : null,
    };
  });
  const sumOf = (vals: (string | null)[]) => (vals.some((x) => x !== null) ? fmt2(vals.reduce((a, b) => a.plus(dec(b)), new D(0))) : null);
  return {
    currency: trip.currency,
    rows,
    totals: { budget: sumOf(rows.map((r) => r.budget)), quoted: sumOf(rows.map((r) => r.quoted)), estimate: fmt2(estimate.totalCost), actual: sumOf(rows.map((r) => r.actual)) },
    quoteVersion: q?.version ?? null,
    estimateIssues: estimate.issues.length,
    actualUnconverted,
  };
}

const targetSchema = z.object({ periodStart: reqDate, periodEnd: reqDate, metric: z.enum(["confirmed_value", "gross_profit", "bookings"]), brandId: optUuid, amount, currency: z.preprocess((v) => (v === "" ? null : v), currencyCode.nullish()), note: optText(1000) })
  .refine((v) => v.periodEnd >= v.periodStart, { path: ["periodEnd"], message: "Period end must be after start" })
  .refine((v) => v.metric === "bookings" || v.currency, { path: ["currency"], message: "Choose the target currency" })
  .refine((v) => Number(v.amount) > 0, { path: ["amount"], message: "Target must be greater than zero" });

export async function saveTarget(db: Db, actor: Actor, raw: z.input<typeof targetSchema>) {
  requirePermission(actor, "finance.edit");
  const v = targetSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [t] = await tx.insert(targets).values({ ...v, currency: v.metric === "bookings" ? null : v.currency, createdById: actor.id }).returning();
    await audit(tx, actor.id, { action: "target.created", entityType: "target", entityId: t!.id, summary: `Target ${v.metric.replace("_", " ")} ${v.currency ?? ""} ${v.amount} for ${v.periodStart} → ${v.periodEnd}` });
    return t!;
  });
}

export async function deleteTarget(db: Db, actor: Actor, id: string) {
  requirePermission(actor, "finance.edit");
  await db.transaction(async (tx) => {
    const [t] = await tx.delete(targets).where(eq(targets.id, id)).returning();
    if (!t) throw notFound("Target");
    await audit(tx, actor.id, { action: "target.deleted", entityType: "target", entityId: id, summary: `Removed ${t.metric} target ${t.amount}` });
  });
}

const FORECAST_KEY = "forecast.conversion";
const assumptionSchema = z.object({ conservative: z.preprocess((v) => (v === "" ? null : v), percent.nullish()), expected: z.preprocess((v) => (v === "" ? null : v), percent.nullish()), optimistic: z.preprocess((v) => (v === "" ? null : v), percent.nullish()) });

export async function saveForecastAssumptions(db: Db, actor: Actor, raw: z.input<typeof assumptionSchema>) {
  requirePermission(actor, "finance.edit");
  const v = assumptionSchema.parse(raw);
  for (const x of Object.values(v)) if (x && (Number(x) <= 0 || Number(x) > 100)) throw invalid("Conversion assumptions must be between 0 and 100%.");
  await db.transaction(async (tx) => {
    await tx.insert(settings).values({ key: FORECAST_KEY, value: v, updatedById: actor.id }).onConflictDoUpdate({ target: settings.key, set: { value: v, updatedById: actor.id, updatedAt: new Date() } });
    await audit(tx, actor.id, { action: "settings.forecast_assumptions", entityType: "settings", entityId: FORECAST_KEY, summary: `Forecast conversion assumptions: ${v.conservative ?? "—"}% / ${v.expected ?? "—"}% / ${v.optimistic ?? "—"}%` });
  });
}

function convertTo(fx: FxRate[], amountStr: string, from: string, to: string) {
  const r = resolveRate(fx, from, to, today());
  return r ? dec(amountStr).times(r.rate) : null;
}

/**
 * Target performance. Attribution rules (docs/METRICS.md): a booking counts once, under its primary
 * brand, in the period of its departure date; value = accepted quote, converted at the latest recorded rate.
 */
export async function getPerformance(db: Db, actor: Actor) {
  requirePermission(actor, "performance.read");
  const [targetRows, fxRows, accepted, decided, assumptionRow, brandRows, pipelineRows] = await Promise.all([
    db.select({ t: targets, brandName: brands.name }).from(targets).leftJoin(brands, eq(brands.id, targets.brandId)).orderBy(desc(targets.periodStart)),
    db.select().from(currencyRates),
    db.select({ tripId: trips.id, startDate: trips.startDate, brandId: trips.primaryBrandId, currency: quotes.currency, sell: quotes.totalSell, gp: quotes.grossProfit, isDemo: trips.isDemo })
      .from(quotes).innerJoin(trips, eq(trips.id, quotes.tripId)).where(and(eq(quotes.status, "accepted"), inArray(trips.status, CONFIRMED_STATUSES))),
    db.select({ status: quotes.status, n: sql<number>`count(*)::int` }).from(quotes).where(inArray(quotes.status, ["accepted", "declined"])).groupBy(quotes.status),
    db.select().from(settings).where(eq(settings.key, FORECAST_KEY)),
    db.select().from(brands).orderBy(asc(brands.name)),
    db.select({ currency: quotes.currency, total: sql<string>`sum(${quotes.totalSell})::text`, n: sql<number>`count(*)::int` }).from(quotes).innerJoin(trips, eq(trips.id, quotes.tripId)).where(and(eq(quotes.status, "issued"), notInArray(trips.status, ["cancelled", "lost"]))).groupBy(quotes.currency),
  ]);
  const fx: FxRate[] = fxRows.map((r) => ({ fromCurrency: r.fromCurrency, toCurrency: r.toCurrency, rate: r.rate, source: r.source, effectiveDate: r.effectiveDate }));
  const assumptions = (assumptionRow[0]?.value ?? { conservative: null, expected: null, optimistic: null }) as { conservative: string | null; expected: string | null; optimistic: string | null };
  const decidedCounts = { accepted: decided.find((d) => d.status === "accepted")?.n ?? 0, declined: decided.find((d) => d.status === "declined")?.n ?? 0 };

  const results = targetRows.map(({ t, brandName }) => {
    const inScope = accepted.filter((a) => a.startDate && a.startDate >= t.periodStart && a.startDate <= t.periodEnd && (!t.brandId || a.brandId === t.brandId));
    let achieved = new D(0);
    let unconverted = 0;
    const history: number[] = [];
    for (const a of accepted) {
      const v = t.metric === "bookings" ? null : convertTo(fx, t.metric === "gross_profit" ? a.gp : a.sell, a.currency, t.currency!);
      if (v && (!t.brandId || a.brandId === t.brandId)) history.push(v.toNumber());
    }
    for (const a of inScope) {
      if (t.metric === "bookings") { achieved = achieved.plus(1); continue; }
      const v = convertTo(fx, t.metric === "gross_profit" ? a.gp : a.sell, a.currency, t.currency!);
      if (v) achieved = achieved.plus(v); else unconverted++;
    }
    const forecast = forecastToTarget({
      target: Number(t.amount),
      achieved: achieved.toNumber(),
      historicalBookingValues: t.metric === "bookings" ? accepted.map(() => 1) : history,
      conversion: { conservative: assumptions.conservative ? Number(assumptions.conservative) : null, expected: assumptions.expected ? Number(assumptions.expected) : null, optimistic: assumptions.optimistic ? Number(assumptions.optimistic) : null },
      decided: decidedCounts,
    });
    return { target: t, brandName, achieved: t.metric === "bookings" ? achieved.toFixed(0) : fmt2(achieved), bookingsInPeriod: inScope.length, unconverted, demoIncluded: inScope.some((a) => a.isDemo), forecast };
  });

  // Brand breakdown: each booking counted once under its primary brand.
  const byBrand = brandRows.map((b) => {
    const mine = accepted.filter((a) => a.brandId === b.id);
    const value: Record<string, Dec> = {};
    for (const a of mine) addTo(value, a.currency, dec(a.sell));
    return { brand: b.name, bookings: mine.length, value: toStrings(value) };
  });
  return { results, assumptions, decided: decidedCounts, byBrand, pipeline: pipelineRows, fxCount: fx.length };
}

export const tripBudgetCategories = ["accommodation", "transport", "experiences", "guest", "logistics"] as const;
