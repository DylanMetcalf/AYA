import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { itineraryComponents, quotes, supplierRates } from "@/server/db/schema";
import { addFxRate } from "@/server/services/fx";
import { addComponent, addDay, applyRate, moveComponent, removeComponent, setBookingStatus } from "@/server/services/itinerary";
import { recordPayment, tripPaymentSummary } from "@/server/services/payments";
import { approveQuote, createQuote, getTripCosting, issueQuote, recordQuoteDecision } from "@/server/services/quotes";
import { addSupplierService, createRate, decideRate, rateImpact, reviseRate, saveSupplier } from "@/server/services/suppliers";
import { createTrip, getTrip, transitionTrip } from "@/server/services/trips";
import { db, makeActor, tripInput } from "./helpers";

const rateInput = (o: Record<string, unknown> = {}) => ({ name: "Luxury suite 2027", currency: "USD" as const, amount: "950.00", basis: "per_person_sharing" as const, type: "contracted" as const, source: "Contract PDF v3", ...o });

async function setup() {
  const mgmt = await makeActor("management");
  const supplier = await saveSupplier(db, mgmt, null, { name: "Demo Lodge", category: "lodge", defaultCurrency: "USD", verification: "verified" });
  const svc = await addSupplierService(db, mgmt, supplier.id, { name: "Luxury suite", componentType: "safari_lodge" });
  const rate = await createRate(db, mgmt, svc.id, rateInput());
  await decideRate(db, mgmt, rate.id, "approve");
  await addFxRate(db, mgmt, { fromCurrency: "USD", toCurrency: "ZAR", rate: "18.25", source: "Manual — test", effectiveDate: "2020-01-01" });
  const trip = await createTrip(db, mgmt, await tripInput());
  const day1 = await addDay(db, mgmt, trip.id, { title: "Arrival" });
  const day2 = await addDay(db, mgmt, trip.id, { title: "Safari" });
  const car = await addComponent(db, mgmt, day1.id, { type: "classic_car", title: "MGB drive", costCurrency: "ZAR", unitCost: "4500", quantity: "2" });
  const lodge = await addComponent(db, mgmt, day2.id, { type: "safari_lodge", title: "Lodge stay", details: { nights: "2" } });
  await applyRate(db, mgmt, lodge.id, rate.id);
  return { mgmt, supplier, svc, rate, trip, day1, day2, car, lodge };
}

const quoteInput = { pricingMode: "margin" as const, pricingPercent: "25", depositPercent: "30" };

describe("supplier rates (Scenario C)", () => {
  it("versions rates, keeps history, and requires approval before use", async () => {
    const { mgmt, rate, lodge } = await setup();
    const v2 = await reviseRate(db, mgmt, rate.id, rateInput({ amount: "1100.00" }));
    expect(v2).toMatchObject({ version: 2, status: "pending_review", lineageId: rate.lineageId });
    await expect(reviseRate(db, mgmt, rate.id, rateInput({ amount: "1200.00" }))).rejects.toThrow(/awaiting review/);
    await expect(applyRate(db, mgmt, lodge.id, v2.id)).rejects.toThrow(/Only approved/);
    const tm = await makeActor("trip_manager");
    await expect(decideRate(db, tm, v2.id, "approve")).rejects.toMatchObject({ code: "forbidden" });
    await decideRate(db, mgmt, v2.id, "approve");
    const all = await db.select().from(supplierRates).where(eq(supplierRates.lineageId, rate.lineageId));
    expect(all.map((r) => [r.version, r.status]).sort()).toEqual([[1, "superseded"], [2, "approved"]]);
    const impact = await rateImpact(db, mgmt, rate.lineageId);
    expect(impact.components).toHaveLength(1);
    expect(impact.components[0]!.version).toBe(1);
  });

  it("the database refuses in-place edits of approved rates", async () => {
    const { rate } = await setup();
    await expect(db.update(supplierRates).set({ amount: "1.00" }).where(eq(supplierRates.id, rate.id))).rejects.toMatchObject({ cause: { message: expect.stringMatching(/read-only/) } });
  });
});

describe("costing and quotes (Scenarios A, C, D)", () => {
  it("costs multi-currency segments from approved rates with an explanation", async () => {
    const { mgmt, trip } = await setup();
    const { costing } = await getTripCosting(db, mgmt, trip.id);
    // Car: 2 × 4 500 = 9 000 ZAR. Lodge: 2 travellers × 2 nights × USD 950 = 3 800 USD × 18.25 = 69 350 ZAR.
    expect(costing.totalCost.toFixed(2)).toBe("78350.00");
    expect(costing.lines.find((l) => l.component.title === "Lodge stay")!.cost!.explanation).toContain("4 × USD 950.00");
  });

  it("refuses to quote with missing costs or exchange rates", async () => {
    const { mgmt, trip, day1 } = await setup();
    await addComponent(db, mgmt, day1.id, { type: "dining", title: "Welcome dinner" });
    await expect(createQuote(db, mgmt, trip.id, quoteInput)).rejects.toThrow(/Welcome dinner.*no cost/);
  });

  it("issued quotes keep their snapshot when supplier rates change; revisions use the new rate", async () => {
    const { mgmt, trip, rate, lodge } = await setup();
    const q1 = await createQuote(db, mgmt, trip.id, quoteInput);
    expect(q1).toMatchObject({ version: 1, status: "draft", totalCost: "78350.00", totalSell: "104466.67" });
    await approveQuote(db, mgmt, q1.id);
    await issueQuote(db, mgmt, q1.id);
    // Supplier increases the rate; approved as v2.
    const v2 = await reviseRate(db, mgmt, rate.id, rateInput({ amount: "1100.00" }));
    await decideRate(db, mgmt, v2.id, "approve");
    const [stored] = await db.select().from(quotes).where(eq(quotes.id, q1.id));
    expect(stored!.totalSell).toBe("104466.67");
    expect(stored!.snapshot.lines.find((l) => l.title === "Lodge stay")).toMatchObject({ originalAmount: "3800.00", rateVersion: 1 });
    // The database itself rejects tampering with an issued quote.
    await expect(db.update(quotes).set({ totalSell: "1.00" }).where(eq(quotes.id, q1.id))).rejects.toMatchObject({ cause: { message: expect.stringMatching(/locked/) } });
    await expect(db.delete(quotes).where(eq(quotes.id, q1.id))).rejects.toMatchObject({ cause: { message: expect.stringMatching(/cannot be deleted/) } });
    // Impact report finds the issued quote; a revised quote picks up the new rate only when re-applied.
    expect((await rateImpact(db, mgmt, rate.lineageId)).quotes.map((q) => q.version)).toEqual([1]);
    await applyRate(db, mgmt, lodge.id, v2.id);
    const q2 = await createQuote(db, mgmt, trip.id, quoteInput);
    expect(q2.version).toBe(2);
    expect(q2.totalCost).toBe("89300.00"); // 9 000 + (4 × USD 1 100 = 4 400) × 18.25 = 9 000 + 80 300
    await approveQuote(db, mgmt, q2.id);
    await issueQuote(db, mgmt, q2.id);
    const statuses = await db.select({ v: quotes.version, s: quotes.status }).from(quotes).where(eq(quotes.tripId, trip.id));
    expect(statuses.sort((a, b) => a.v - b.v)).toEqual([{ v: 1, s: "superseded" }, { v: 2, s: "issued" }]);
  });

  it("lifecycle gates follow real quote state; client and supplier balances are tracked", async () => {
    const { mgmt, trip, supplier, lodge } = await setup();
    let v = 1;
    for (const to of ["discovery", "concept", "draft_itinerary", "costing", "internal_review", "quote_ready"]) v = (await transitionTrip(db, mgmt, trip.id, { to, expectedVersion: v })).version;
    await expect(transitionTrip(db, mgmt, trip.id, { to: "quote_issued", expectedVersion: v })).rejects.toThrow(/No quotation/);
    const q = await createQuote(db, mgmt, trip.id, quoteInput);
    await approveQuote(db, mgmt, q.id); // also records commercial approval (bumps trip version)
    await issueQuote(db, mgmt, q.id);
    v = (await getTrip(db, mgmt, trip.id)).trip.version;
    v = (await transitionTrip(db, mgmt, trip.id, { to: "quote_issued", expectedVersion: v })).version;
    await expect(transitionTrip(db, mgmt, trip.id, { to: "confirmed", expectedVersion: v })).rejects.toThrow(/accepted/);
    await recordQuoteDecision(db, mgmt, q.id, "accepted");
    const confirmed = await transitionTrip(db, mgmt, trip.id, { to: "confirmed", expectedVersion: v });
    expect(confirmed.status).toBe("confirmed");

    // Payments: idempotent, currency-checked.
    const key = crypto.randomUUID();
    await expect(recordPayment(db, mgmt, trip.id, { direction: "client_receipt", amount: "1000", currency: "USD", paidOn: "2027-01-10", idempotencyKey: crypto.randomUUID() })).rejects.toThrow(/quote currency/);
    const first = await recordPayment(db, mgmt, trip.id, { direction: "client_receipt", amount: "31340.00", currency: "ZAR", paidOn: "2027-01-10", idempotencyKey: key });
    const again = await recordPayment(db, mgmt, trip.id, { direction: "client_receipt", amount: "31340.00", currency: "ZAR", paidOn: "2027-01-10", idempotencyKey: key });
    expect(again).toMatchObject({ duplicate: true, payment: { id: first.payment.id } });
    await setBookingStatus(db, mgmt, lodge.id, { status: "confirmed", confirmationRef: "LODGE-123" });
    await recordPayment(db, mgmt, trip.id, { direction: "supplier_payment", supplierId: supplier.id, amount: "1000.00", currency: "USD", paidOn: "2027-01-11", idempotencyKey: crypto.randomUUID() });
    const s = await tripPaymentSummary(db, mgmt, trip.id);
    expect(s.client).toMatchObject({ due: "104466.67", received: "31340.00", outstanding: "73126.67", deposit: "31340.00", depositOutstanding: "0.00" });
    expect(s.supplierBalances).toEqual([expect.objectContaining({ supplierName: "Demo Lodge", currency: "USD", committed: "3800.00", paid: "1000.00", outstanding: "2800.00" })]);
    const fin = await makeActor("finance");
    await expect(recordPayment(db, await makeActor("trip_manager"), trip.id, { direction: "client_receipt", amount: "1", currency: "ZAR", paidOn: "2027-01-10", idempotencyKey: crypto.randomUUID() })).rejects.toMatchObject({ code: "forbidden" });
    expect((await tripPaymentSummary(db, fin, trip.id)).payments).toHaveLength(2);
  });

  it("only one quote per trip can be accepted (database-enforced)", async () => {
    const { mgmt, trip } = await setup();
    const q = await createQuote(db, mgmt, trip.id, quoteInput);
    await approveQuote(db, mgmt, q.id);
    await issueQuote(db, mgmt, q.id);
    await recordQuoteDecision(db, mgmt, q.id, "accepted");
    const q2 = await createQuote(db, mgmt, trip.id, quoteInput);
    await approveQuote(db, mgmt, q2.id);
    await expect(issueQuote(db, mgmt, q2.id)).rejects.toThrow(/already has an accepted quote/);
  });
});

describe("itinerary editing", () => {
  it("reorders and moves segments without losing supplier, rate or booking links", async () => {
    const { mgmt, day1, day2, car, lodge } = await setup();
    const dinner = await addComponent(db, mgmt, day1.id, { type: "dining", title: "Dinner", costCurrency: "ZAR", unitCost: "900", quantity: "2" });
    await moveComponent(db, mgmt, dinner.id, { direction: "up" });
    let rows = await db.select().from(itineraryComponents).where(eq(itineraryComponents.dayId, day1.id)).orderBy(itineraryComponents.position);
    expect(rows.map((r) => r.title)).toEqual(["Dinner", "MGB drive"]);
    await setBookingStatus(db, mgmt, lodge.id, { status: "provisional" });
    await moveComponent(db, mgmt, lodge.id, { toDayId: day1.id });
    rows = await db.select().from(itineraryComponents).where(eq(itineraryComponents.dayId, day1.id)).orderBy(itineraryComponents.position);
    expect(rows.map((r) => r.title)).toEqual(["Dinner", "MGB drive", "Lodge stay"]);
    expect(rows[2]).toMatchObject({ bookingStatus: "provisional", costSource: "rate" });
    expect(rows[2]!.supplierRateId).not.toBeNull();
    expect(await db.select().from(itineraryComponents).where(eq(itineraryComponents.dayId, day2.id))).toHaveLength(0);
    await expect(removeComponent(db, mgmt, lodge.id)).rejects.toThrow(/active supplier arrangement/);
    await expect(setBookingStatus(db, mgmt, car.id, { status: "confirmed" })).rejects.toThrow(/confirmation reference/);
  });

  it("strips costs for roles without finance visibility and prevents them editing costs", async () => {
    const { car } = await setup();
    const ops = await makeActor("operations");
    const { updateComponent, getStudio } = await import("@/server/services/itinerary");
    const studio = await getStudio(db, ops, car.tripId);
    expect(studio.components.every((c) => c.unitCost === null)).toBe(true);
    await updateComponent(db, ops, car.id, { type: "classic_car", title: "MGB drive (renamed)", unitCost: "1", costCurrency: "ZAR" });
    const [row] = await db.select().from(itineraryComponents).where(eq(itineraryComponents.id, car.id));
    expect(row).toMatchObject({ title: "MGB drive (renamed)", unitCost: "4500.00" });
    await expect(applyRate(db, ops, car.id, crypto.randomUUID())).rejects.toMatchObject({ code: "forbidden" });
    expect((await db.execute(sql`select 1`)).length).toBe(1);
  });
});
