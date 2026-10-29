import { and, asc, desc, eq, ilike, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { RATE_BASES } from "@/lib/domain/components";
import { amount, currencyCode, isUuid, optAmount, optDate, optInt, optText, optUuid, reqText } from "@/lib/validation/common";
import { type Actor, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit";
import type { Db, DbOrTx } from "@/server/db/client";
import { itineraryComponents, quotes, supplierContacts, supplierRates, supplierServices, suppliers, trips, users } from "@/server/db/schema";
import { conflict, invalid, notFound } from "@/server/errors";

const CATEGORIES = ["lodge", "camp", "accommodation", "restaurant", "private_chef", "guide", "host", "helicopter", "aviation", "vehicle_partner", "transfer", "activity", "conservation", "amenity", "event", "other"] as const;
export const SUPPLIER_CATEGORY_LABEL: Record<(typeof CATEGORIES)[number], string> = {
  lodge: "Lodge", camp: "Camp", accommodation: "Accommodation", restaurant: "Restaurant", private_chef: "Private chef", guide: "Guide",
  host: "Host", helicopter: "Helicopter", aviation: "Aviation", vehicle_partner: "Vehicle partner", transfer: "Transfers", activity: "Activities",
  conservation: "Conservation", amenity: "Amenities", event: "Events", other: "Other",
};

export const supplierSchema = z.object({
  name: reqText(200, "Supplier name is required"),
  category: z.enum(CATEGORIES),
  legalCompanyId: optUuid,
  email: z.preprocess((v) => (v === "" ? null : v), z.email("Enter a valid email").nullish()),
  phone: optText(50),
  website: optText(300),
  location: optText(200),
  region: optText(120),
  description: optText(5000),
  paymentTerms: optText(2000),
  cancellationTerms: optText(2000),
  defaultCurrency: currencyCode,
  verification: z.enum(["unverified", "verified", "needs_review"]),
  internalNotes: optText(5000),
});

const FINISHED = ["closed", "cancelled", "lost"] as const;

export async function listSuppliers(db: Db, actor: Actor, f: { q?: string; category?: string } = {}) {
  requirePermission(actor, "supplier.read");
  const conds = [eq(suppliers.isActive, true)];
  if (f.q?.trim()) conds.push(or(ilike(suppliers.name, `%${f.q.trim()}%`), ilike(suppliers.region, `%${f.q.trim()}%`))!);
  if (f.category && (CATEGORIES as readonly string[]).includes(f.category)) conds.push(eq(suppliers.category, f.category as (typeof CATEGORIES)[number]));
  return db
    .select({
      id: suppliers.id, name: suppliers.name, category: suppliers.category, region: suppliers.region, location: suppliers.location,
      verification: suppliers.verification, defaultCurrency: suppliers.defaultCurrency, isDemo: suppliers.isDemo,
      services: sql<number>`(select count(*)::int from supplier_services s where s.supplier_id = "suppliers"."id")`,
      approvedRates: sql<number>`(select count(*)::int from supplier_rates r join supplier_services s on s.id = r.service_id where s.supplier_id = "suppliers"."id" and r.status = 'approved')`,
      pendingRates: sql<number>`(select count(*)::int from supplier_rates r join supplier_services s on s.id = r.service_id where s.supplier_id = "suppliers"."id" and r.status = 'pending_review')`,
      expiringRates: sql<number>`(select count(*)::int from supplier_rates r join supplier_services s on s.id = r.service_id where s.supplier_id = "suppliers"."id" and r.status = 'approved' and r.valid_to is not null and r.valid_to < current_date + 60)`,
    })
    .from(suppliers)
    .where(and(...conds))
    .orderBy(asc(suppliers.name));
}

export async function getSupplier(db: Db, actor: Actor, id: string) {
  requirePermission(actor, "supplier.read");
  if (!isUuid(id)) throw notFound("Supplier");
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  if (!supplier) throw notFound("Supplier");
  const [contacts, services] = await Promise.all([
    db.select().from(supplierContacts).where(eq(supplierContacts.supplierId, id)).orderBy(desc(supplierContacts.isPrimary), asc(supplierContacts.name)),
    db.select().from(supplierServices).where(eq(supplierServices.supplierId, id)).orderBy(asc(supplierServices.name)),
  ]);
  const rates = services.length
    ? await db
        .select({ rate: supplierRates, createdBy: users.name })
        .from(supplierRates)
        .leftJoin(users, eq(users.id, supplierRates.createdById))
        .where(inArray(supplierRates.serviceId, services.map((s) => s.id)))
        .orderBy(asc(supplierRates.name), desc(supplierRates.version))
    : [];
  return { supplier, contacts, services, rates: rates.map((r) => ({ ...r.rate, createdByName: r.createdBy })) };
}

export async function saveSupplier(db: Db, actor: Actor, id: string | null, raw: z.input<typeof supplierSchema>) {
  requirePermission(actor, "supplier.edit");
  const v = supplierSchema.parse(raw);
  return db.transaction(async (tx) => {
    if (!id) {
      const [s] = await tx.insert(suppliers).values(v).returning();
      await audit(tx, actor.id, { action: "supplier.created", entityType: "supplier", entityId: s!.id, summary: `Added supplier ${v.name}` });
      return s!;
    }
    const [s] = await tx.update(suppliers).set({ ...v, updatedAt: new Date() }).where(eq(suppliers.id, id)).returning();
    if (!s) throw notFound("Supplier");
    await audit(tx, actor.id, { action: "supplier.updated", entityType: "supplier", entityId: id, summary: `Updated supplier ${v.name}` });
    return s;
  });
}

const contactSchema = z.object({ name: reqText(120), role: optText(120), email: z.preprocess((v) => (v === "" ? null : v), z.email().nullish()), phone: optText(50), isPrimary: z.boolean().default(false) });

export async function addSupplierContact(db: Db, actor: Actor, supplierId: string, raw: z.input<typeof contactSchema>) {
  requirePermission(actor, "supplier.edit");
  const v = contactSchema.parse(raw);
  return db.transaction(async (tx) => {
    if (v.isPrimary) await tx.update(supplierContacts).set({ isPrimary: false }).where(eq(supplierContacts.supplierId, supplierId));
    const [c] = await tx.insert(supplierContacts).values({ ...v, supplierId }).returning();
    await audit(tx, actor.id, { action: "supplier.contact_added", entityType: "supplier", entityId: supplierId, summary: `Added contact ${v.name}` });
    return c!;
  });
}

export async function removeSupplierContact(db: Db, actor: Actor, contactId: string) {
  requirePermission(actor, "supplier.edit");
  await db.transaction(async (tx) => {
    const [c] = await tx.delete(supplierContacts).where(eq(supplierContacts.id, contactId)).returning();
    if (!c) throw notFound("Contact");
    await audit(tx, actor.id, { action: "supplier.contact_removed", entityType: "supplier", entityId: c.supplierId, summary: `Removed contact ${c.name}` });
  });
}

const serviceSchema = z.object({ name: reqText(200), componentType: reqText(40), description: optText(2000) });

export async function addSupplierService(db: Db, actor: Actor, supplierId: string, raw: z.input<typeof serviceSchema>) {
  requirePermission(actor, "supplier.edit");
  const v = serviceSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [sup] = await tx.select({ id: suppliers.id }).from(suppliers).where(eq(suppliers.id, supplierId));
    if (!sup) throw notFound("Supplier");
    const [s] = await tx.insert(supplierServices).values({ ...v, supplierId }).returning();
    await audit(tx, actor.id, { action: "supplier.service_added", entityType: "supplier", entityId: supplierId, summary: `Added service ${v.name}` });
    return s!;
  });
}

export const rateSchema = z
  .object({
    name: reqText(200, "Name the rate, e.g. “High season 2027 — Luxury suite”"),
    currency: currencyCode,
    amount,
    basis: z.enum(RATE_BASES),
    minimumCharge: optAmount,
    minimumNights: optInt(1, 365),
    validFrom: optDate,
    validTo: optDate,
    season: optText(80),
    occupancyNote: optText(200),
    inclusions: optText(5000),
    exclusions: optText(5000),
    type: z.enum(["public", "supplier_provided", "trade", "contracted", "indicative", "manual_estimate"]),
    source: reqText(300, "Record where this rate came from"),
    obtainedOn: optDate,
    verifiedOn: optDate,
    internalNotes: optText(5000),
  })
  .refine((v) => !v.validFrom || !v.validTo || v.validTo >= v.validFrom, { path: ["validTo"], message: "Valid-to must be on or after valid-from" });

/** Creates version 1 of a new rate line, awaiting review. */
export async function createRate(db: Db, actor: Actor, serviceId: string, raw: z.input<typeof rateSchema>) {
  requirePermission(actor, "supplier.edit");
  const v = rateSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [svc] = await tx.select().from(supplierServices).where(eq(supplierServices.id, serviceId));
    if (!svc) throw notFound("Service");
    const [r] = await tx.insert(supplierRates).values({ ...v, serviceId, lineageId: crypto.randomUUID(), version: 1, status: "pending_review", createdById: actor.id }).returning();
    await audit(tx, actor.id, { action: "rate.created", entityType: "supplier", entityId: svc.supplierId, summary: `New rate “${v.name}” ${v.currency} ${v.amount} submitted for review`, changes: { rateId: r!.id } });
    return r!;
  });
}

/** Records a changed rate as a new version of the same line. The approved version stays in force until the new one is approved. */
export async function reviseRate(db: Db, actor: Actor, rateId: string, raw: z.input<typeof rateSchema>) {
  requirePermission(actor, "supplier.edit");
  const v = rateSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [base] = await tx.select().from(supplierRates).where(eq(supplierRates.id, rateId)).for("update");
    if (!base) throw notFound("Rate");
    const [pending] = await tx.select({ id: supplierRates.id }).from(supplierRates).where(and(eq(supplierRates.lineageId, base.lineageId), inArray(supplierRates.status, ["draft", "pending_review"])));
    if (pending) throw conflict("This rate already has a version awaiting review. Approve or reject it first.");
    const [{ max }] = (await tx.select({ max: sql<number>`max(${supplierRates.version})::int` }).from(supplierRates).where(eq(supplierRates.lineageId, base.lineageId))) as [{ max: number }];
    const [r] = await tx.insert(supplierRates).values({ ...v, serviceId: base.serviceId, lineageId: base.lineageId, version: max + 1, status: "pending_review", createdById: actor.id }).returning();
    const [svc] = await tx.select().from(supplierServices).where(eq(supplierServices.id, base.serviceId));
    await audit(tx, actor.id, {
      action: "rate.revised",
      entityType: "supplier",
      entityId: svc!.supplierId,
      summary: `Rate “${v.name}” v${max + 1}: ${base.currency} ${base.amount} → ${v.currency} ${v.amount} (pending review)`,
      changes: { from: { amount: base.amount, currency: base.currency }, to: { amount: v.amount, currency: v.currency }, rateId: r!.id },
    });
    return r!;
  });
}

export async function decideRate(db: Db, actor: Actor, rateId: string, decision: "approve" | "reject", note?: string) {
  requirePermission(actor, "rate.approve");
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(supplierRates).where(eq(supplierRates.id, rateId)).for("update");
    if (!r) throw notFound("Rate");
    if (r.status !== "pending_review" && r.status !== "draft") throw invalid(`This rate version is already ${r.status}.`);
    if (decision === "approve") {
      // Supersede the previously approved version first (unique index allows one approved per line).
      await tx.update(supplierRates).set({ status: "superseded", updatedAt: new Date() }).where(and(eq(supplierRates.lineageId, r.lineageId), eq(supplierRates.status, "approved")));
      await tx.update(supplierRates).set({ status: "approved", approvedById: actor.id, approvedAt: new Date(), updatedAt: new Date() }).where(eq(supplierRates.id, rateId));
    } else {
      await tx.update(supplierRates).set({ status: "rejected", internalNotes: note ? `${r.internalNotes ?? ""}\nRejected: ${note}`.trim() : r.internalNotes, updatedAt: new Date() }).where(eq(supplierRates.id, rateId));
    }
    const [svc] = await tx.select().from(supplierServices).where(eq(supplierServices.id, r.serviceId));
    await audit(tx, actor.id, { action: `rate.${decision === "approve" ? "approved" : "rejected"}`, entityType: "supplier", entityId: svc!.supplierId, summary: `${decision === "approve" ? "Approved" : "Rejected"} rate “${r.name}” v${r.version} (${r.currency} ${r.amount})`, changes: { rateId, note } });
  });
}

export async function listRatesForReview(db: Db, actor: Actor) {
  requirePermission(actor, "supplier.read");
  const rows = await db
    .select({ rate: supplierRates, serviceName: supplierServices.name, supplierId: suppliers.id, supplierName: suppliers.name, createdBy: users.name })
    .from(supplierRates)
    .innerJoin(supplierServices, eq(supplierServices.id, supplierRates.serviceId))
    .innerJoin(suppliers, eq(suppliers.id, supplierServices.supplierId))
    .leftJoin(users, eq(users.id, supplierRates.createdById))
    .where(inArray(supplierRates.status, ["pending_review", "draft"]))
    .orderBy(asc(supplierRates.createdAt));
  // Pair each pending version with the currently approved version of the same line.
  const lineages = rows.map((r) => r.rate.lineageId);
  const current = lineages.length ? await db.select().from(supplierRates).where(and(inArray(supplierRates.lineageId, lineages), eq(supplierRates.status, "approved"))) : [];
  return rows.map((r) => ({ ...r, current: current.find((c) => c.lineageId === r.rate.lineageId) ?? null }));
}

/** Where a rate line is used: open trips' components and issued/accepted quotes that priced it. */
export async function rateImpact(db: DbOrTx, actor: Actor, lineageId: string) {
  requirePermission(actor, "supplier.read");
  const versions = await db.select({ id: supplierRates.id, version: supplierRates.version }).from(supplierRates).where(eq(supplierRates.lineageId, lineageId));
  if (!versions.length) return { components: [], quotes: [] };
  const ids = versions.map((v) => v.id);
  const components = await db
    .select({ componentId: itineraryComponents.id, title: itineraryComponents.title, tripId: trips.id, reference: trips.reference, tripName: trips.name, status: trips.status, rateId: itineraryComponents.supplierRateId })
    .from(itineraryComponents)
    .innerJoin(trips, eq(trips.id, itineraryComponents.tripId))
    .where(and(inArray(itineraryComponents.supplierRateId, ids), notInArray(trips.status, [...FINISHED]), isNull(trips.archivedAt)));
  const quoteRows = await db
    .select({ id: quotes.id, tripId: quotes.tripId, version: quotes.version, status: quotes.status, reference: trips.reference })
    .from(quotes)
    .innerJoin(trips, eq(trips.id, quotes.tripId))
    .where(and(inArray(quotes.status, ["issued", "accepted", "approved"]), sql`exists (select 1 from jsonb_array_elements(${quotes.snapshot}->'lines') l where l->>'supplierRateId' in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}))`));
  return { components: components.map((c) => ({ ...c, version: versions.find((v) => v.id === c.rateId)?.version ?? null })), quotes: quoteRows };
}

/** Approved, currently valid rates offered when costing an itinerary component. */
export async function listApprovedRates(db: DbOrTx) {
  return db
    .select({ id: supplierRates.id, name: supplierRates.name, currency: supplierRates.currency, amount: supplierRates.amount, basis: supplierRates.basis, minimumCharge: supplierRates.minimumCharge, validFrom: supplierRates.validFrom, validTo: supplierRates.validTo, version: supplierRates.version, type: supplierRates.type, serviceName: supplierServices.name, componentType: supplierServices.componentType, supplierId: suppliers.id, supplierName: suppliers.name })
    .from(supplierRates)
    .innerJoin(supplierServices, eq(supplierServices.id, supplierRates.serviceId))
    .innerJoin(suppliers, eq(suppliers.id, supplierServices.supplierId))
    .where(eq(supplierRates.status, "approved"))
    .orderBy(asc(suppliers.name), asc(supplierRates.name));
}

export async function supplierOptions(db: DbOrTx) {
  return db.select({ id: suppliers.id, name: suppliers.name, category: suppliers.category }).from(suppliers).where(eq(suppliers.isActive, true)).orderBy(asc(suppliers.name));
}
