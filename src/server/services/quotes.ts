import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { ComponentType, RateBasis } from "@/lib/domain/components";
import { type FxRate } from "@/lib/finance/fx";
import { fmt2 } from "@/lib/finance/money";
import { buildSnapshot, costTrip, priceFromCost, type PricingInput } from "@/lib/finance/quote";
import { optDate, optText, percent } from "@/lib/validation/common";
import { type Actor, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit";
import type { Db, DbOrTx } from "@/server/db/client";
import { brands, currencyRates, guests, itineraryComponents, itineraryDays, legalCompanies, quotes, supplierRates, suppliers, trips } from "@/server/db/schema";
import { conflict, invalid, notFound } from "@/server/errors";
import { loadScopedTrip } from "./trips";

/** Loads everything the costing engine needs for a trip, in a consistent read. */
export async function loadCostingInputs(db: DbOrTx, tripId: string) {
  const rows = await db
    .select({
      c: itineraryComponents,
      dayNumber: itineraryDays.dayNumber,
      dayTitle: itineraryDays.title,
      dayLocation: itineraryDays.location,
      supplierName: suppliers.name,
      rateVersion: supplierRates.version,
      brandName: brands.name,
    })
    .from(itineraryComponents)
    .innerJoin(itineraryDays, eq(itineraryDays.id, itineraryComponents.dayId))
    .leftJoin(suppliers, eq(suppliers.id, itineraryComponents.supplierId))
    .leftJoin(supplierRates, eq(supplierRates.id, itineraryComponents.supplierRateId))
    .leftJoin(brands, eq(brands.id, itineraryComponents.operatingBrandId))
    .where(eq(itineraryComponents.tripId, tripId))
    .orderBy(asc(itineraryDays.dayNumber), asc(itineraryComponents.position));
  const components = rows.map((r) => ({
    id: r.c.id, dayNumber: r.dayNumber, dayTitle: r.dayTitle, dayLocation: r.dayLocation, position: r.c.position, type: r.c.type as ComponentType,
    title: r.c.title, startTime: r.c.startTime, endTime: r.c.endTime, startLocation: r.c.startLocation, endLocation: r.c.endLocation,
    guestDescription: r.c.guestDescription, includedInQuote: r.c.includedInQuote, costCurrency: r.c.costCurrency, unitCost: r.c.unitCost,
    quantity: r.c.quantity, minimumCharge: r.c.minimumCharge, costBasis: r.c.costBasis as RateBasis | null, supplierName: r.supplierName,
    supplierRateId: r.c.supplierRateId, rateVersion: r.rateVersion, operatingBrandName: r.brandName,
  }));
  const fx: FxRate[] = (await db.select().from(currencyRates)).map((r) => ({ fromCurrency: r.fromCurrency, toCurrency: r.toCurrency, rate: r.rate, source: r.source, effectiveDate: r.effectiveDate }));
  return { components, fx };
}

const today = () => new Date().toISOString().slice(0, 10);

/** Live costing for the Trip Studio (not a commercial document). */
export async function getTripCosting(db: Db, actor: Actor, tripId: string, fxBufferPercent = "0") {
  requirePermission(actor, "finance.read_costs");
  const trip = await loadScopedTrip(db, actor, tripId);
  const { components, fx } = await loadCostingInputs(db, tripId);
  return { trip, costing: costTrip(components, { currency: trip.currency, rates: fx, onDate: today(), fxBufferPercent }) };
}

export const quoteSchema = z
  .object({
    pricingMode: z.enum(["margin", "markup"]),
    pricingPercent: percent,
    discountPercent: percent.default("0"),
    commissionPercent: percent.default("0"),
    fxBufferPercent: percent.default("0"),
    depositPercent: z.preprocess((v) => (v === "" ? null : v), percent.nullish()),
    depositDueDate: optDate,
    balanceDueDate: optDate,
    validUntil: optDate,
    inclusions: optText(5000),
    exclusions: optText(5000),
    terms: optText(10000),
  })
  .refine((v) => v.pricingMode === "markup" || Number(v.pricingPercent) < 100, { path: ["pricingPercent"], message: "Margin must be below 100%" })
  .refine((v) => Number(v.discountPercent) <= 100 && Number(v.commissionPercent) <= 100 && Number(v.fxBufferPercent) <= 50, { path: ["discountPercent"], message: "Check discount, commission and FX buffer percentages" })
  .refine((v) => !v.depositPercent || Number(v.depositPercent) <= 100, { path: ["depositPercent"], message: "Deposit cannot exceed 100%" });

/** Preview pricing for the quote builder — same functions as quote creation, nothing persisted. */
export async function previewQuote(db: Db, actor: Actor, tripId: string, raw: z.input<typeof quoteSchema>) {
  requirePermission(actor, "finance.read_costs");
  const v = quoteSchema.parse(raw);
  const trip = await loadScopedTrip(db, actor, tripId);
  const { components, fx } = await loadCostingInputs(db, tripId);
  const costing = costTrip(components, { currency: trip.currency, rates: fx, onDate: today(), fxBufferPercent: v.fxBufferPercent });
  const pricing = priceFromCost(costing.totalCost, { mode: v.pricingMode, percent: v.pricingPercent, discountPercent: v.discountPercent, commissionPercent: v.commissionPercent });
  return { costing, pricing };
}

/**
 * Generates a draft quote version with a full snapshot. An existing draft is replaced (drafts are
 * working documents); issued versions are never touched.
 */
export async function createQuote(db: Db, actor: Actor, tripId: string, raw: z.input<typeof quoteSchema>) {
  requirePermission(actor, "trip.edit", "finance.read_costs");
  const v = quoteSchema.parse(raw);
  return db.transaction(async (tx) => {
    const trip = await loadScopedTrip(tx, actor, tripId, true);
    if (["closed", "cancelled", "lost"].includes(trip.status)) throw invalid("Quotes cannot be generated for a finished journey.");
    const { components, fx } = await loadCostingInputs(tx, tripId);
    if (!components.some((c) => c.includedInQuote)) throw invalid("Add priced itinerary segments before generating a quote.");
    const costing = costTrip(components, { currency: trip.currency, rates: fx, onDate: today(), fxBufferPercent: v.fxBufferPercent });
    if (costing.issues.length) {
      const names = costing.issues.slice(0, 4).map((i) => `“${i.component.title}” (${i.issue === "no_cost" ? "no cost" : `no ${i.component.costCurrency}→${trip.currency} rate`})`).join(", ");
      throw invalid(`Cannot generate a quote: ${costing.issues.length} segment(s) need attention — ${names}.`);
    }
    const pricingInput: PricingInput = { mode: v.pricingMode, percent: v.pricingPercent, discountPercent: v.discountPercent, commissionPercent: v.commissionPercent };
    const pricing = priceFromCost(costing.totalCost, pricingInput);
    const [brand] = await tx.select().from(brands).where(eq(brands.id, trip.guestFacingBrandId));
    const [quoting] = trip.quotingCompanyId ? await tx.select().from(legalCompanies).where(eq(legalCompanies.id, trip.quotingCompanyId)) : [];
    const [lead] = trip.leadGuestId ? await tx.select().from(guests).where(eq(guests.id, trip.leadGuestId)) : [];
    const snapshot = buildSnapshot({
      costing,
      pricing,
      pricingInput: { ...pricingInput, fxBufferPercent: v.fxBufferPercent },
      trip: { reference: trip.reference, name: trip.name, startDate: trip.startDate, endDate: trip.endDate, adults: trip.adults, children: trip.children, rooms: trip.rooms, leadGuestName: lead ? `${lead.firstName} ${lead.lastName}` : null },
      brand: { name: brand!.name, tagline: brand!.tagline, colorPrimary: brand!.colorPrimary, colorAccent: brand!.colorAccent, contactEmail: brand!.contactEmail, contactPhone: brand!.contactPhone, website: brand!.website, documentFooter: brand!.documentFooter, quotingEntity: quoting?.name ?? null },
      terms: { depositPercent: v.depositPercent ?? null, depositDueDate: v.depositDueDate ?? null, balanceDueDate: v.balanceDueDate ?? null, validUntil: v.validUntil ?? null, inclusions: v.inclusions ?? null, exclusions: v.exclusions ?? null, terms: v.terms ?? null },
    });
    const existing = await tx.select().from(quotes).where(eq(quotes.tripId, tripId)).orderBy(desc(quotes.version));
    const draft = existing.find((q) => q.status === "draft");
    if (draft) await tx.delete(quotes).where(eq(quotes.id, draft.id));
    const version = draft?.version ?? (existing[0]?.version ?? 0) + 1;
    const [q] = await tx
      .insert(quotes)
      .values({
        tripId, version, status: "draft", currency: trip.currency, pricingMode: v.pricingMode, pricingPercent: v.pricingPercent,
        fxBufferPercent: v.fxBufferPercent, totalCost: fmt2(pricing.cost), totalSell: fmt2(pricing.sell), grossProfit: fmt2(pricing.grossProfit),
        depositPercent: v.depositPercent ?? null, depositDueDate: v.depositDueDate ?? null, balanceDueDate: v.balanceDueDate ?? null,
        validUntil: v.validUntil ?? null, inclusions: v.inclusions ?? null, exclusions: v.exclusions ?? null, terms: v.terms ?? null,
        snapshot, createdById: actor.id,
      })
      .returning();
    await audit(tx, actor.id, { action: draft ? "quote.draft_regenerated" : "quote.generated", entityType: "trip", entityId: tripId, summary: `${trip.reference}: quote v${version} drafted — ${trip.currency} ${fmt2(pricing.sell)}`, changes: { quoteId: q!.id } });
    return q!;
  });
}

async function loadQuote(tx: DbOrTx, actor: Actor, quoteId: string) {
  const [q] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for("update");
  if (!q) throw notFound("Quote");
  const trip = await loadScopedTrip(tx, actor, q.tripId, true);
  return { q, trip };
}

/** Approval records the trip's commercial approval as well. */
export async function approveQuote(db: Db, actor: Actor, quoteId: string) {
  requirePermission(actor, "trip.approve");
  return db.transaction(async (tx) => {
    const { q, trip } = await loadQuote(tx, actor, quoteId);
    if (q.status !== "draft") throw invalid(`Quote v${q.version} is already ${q.status}.`);
    await tx.update(quotes).set({ status: "approved", approvedById: actor.id, approvedAt: new Date(), updatedAt: new Date() }).where(eq(quotes.id, quoteId));
    if (!trip.commercialApprovedAt) await tx.update(trips).set({ commercialApprovedAt: new Date(), commercialApprovedById: actor.id, version: trip.version + 1, updatedAt: new Date() }).where(eq(trips.id, trip.id));
    await audit(tx, actor.id, { action: "quote.approved", entityType: "trip", entityId: trip.id, summary: `${trip.reference}: quote v${q.version} approved (${q.currency} ${q.totalSell})` });
  });
}

/** Issuing locks the snapshot (DB trigger) and supersedes earlier issued versions. */
export async function issueQuote(db: Db, actor: Actor, quoteId: string) {
  requirePermission(actor, "quote.issue");
  return db.transaction(async (tx) => {
    const { q, trip } = await loadQuote(tx, actor, quoteId);
    if (q.status !== "approved") throw invalid("A quote must be approved before it is issued.");
    const [accepted] = await tx.select({ id: quotes.id }).from(quotes).where(and(eq(quotes.tripId, q.tripId), eq(quotes.status, "accepted")));
    if (accepted) throw conflict("This journey already has an accepted quote. Record a change with the client before issuing a new version.");
    await tx.update(quotes).set({ status: "superseded", updatedAt: new Date() }).where(and(eq(quotes.tripId, q.tripId), eq(quotes.status, "issued")));
    await tx.update(quotes).set({ status: "issued", issuedById: actor.id, issuedAt: new Date(), updatedAt: new Date() }).where(eq(quotes.id, quoteId));
    await audit(tx, actor.id, { action: "quote.issued", entityType: "trip", entityId: trip.id, summary: `${trip.reference}: quote v${q.version} issued — ${q.currency} ${q.totalSell}` });
  });
}

export async function recordQuoteDecision(db: Db, actor: Actor, quoteId: string, decision: "accepted" | "declined", feedback?: string) {
  requirePermission(actor, "trip.edit");
  return db.transaction(async (tx) => {
    const { q, trip } = await loadQuote(tx, actor, quoteId);
    if (q.status !== "issued") throw invalid("Only an issued quote can be accepted or declined.");
    await tx.update(quotes).set({ status: decision, decidedAt: new Date(), clientFeedback: feedback?.slice(0, 5000) ?? null, updatedAt: new Date() }).where(eq(quotes.id, quoteId));
    await audit(tx, actor.id, { action: `quote.${decision}`, entityType: "trip", entityId: trip.id, summary: `${trip.reference}: client ${decision} quote v${q.version}`, changes: { feedback } });
  });
}

export async function discardDraftQuote(db: Db, actor: Actor, quoteId: string) {
  requirePermission(actor, "trip.edit");
  return db.transaction(async (tx) => {
    const { q, trip } = await loadQuote(tx, actor, quoteId);
    if (q.status !== "draft") throw invalid("Only drafts can be discarded; issued quotes are permanent records.");
    await tx.delete(quotes).where(eq(quotes.id, quoteId));
    await audit(tx, actor.id, { action: "quote.draft_discarded", entityType: "trip", entityId: trip.id, summary: `${trip.reference}: discarded draft quote v${q.version}` });
  });
}

export async function listTripQuotes(db: Db, actor: Actor, tripId: string) {
  await loadScopedTrip(db, actor, tripId);
  requirePermission(actor, "finance.read_costs");
  return db.select().from(quotes).where(eq(quotes.tripId, tripId)).orderBy(desc(quotes.version));
}

/** Guest-facing view needs only the snapshot; internal figures are omitted by the page, not the query. */
export async function getQuote(db: Db, actor: Actor, quoteId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(quoteId)) throw notFound("Quote");
  const [q] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
  if (!q) throw notFound("Quote");
  const trip = await loadScopedTrip(db, actor, q.tripId);
  return { quote: q, trip };
}

/** Latest commercially relevant quote per trip: accepted, else latest issued. */
export async function currentQuotes(db: DbOrTx, tripIds: string[]) {
  if (!tripIds.length) return new Map<string, typeof quotes.$inferSelect>();
  const rows = await db.select().from(quotes).where(and(inArray(quotes.tripId, tripIds), inArray(quotes.status, ["accepted", "issued"]))).orderBy(sql`case when ${quotes.status} = 'accepted' then 0 else 1 end`, desc(quotes.version));
  const map = new Map<string, typeof quotes.$inferSelect>();
  for (const r of rows) if (!map.has(r.tripId)) map.set(r.tripId, r);
  return map;
}
