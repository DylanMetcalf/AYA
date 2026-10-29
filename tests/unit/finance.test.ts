import { describe, expect, it } from "vitest";
import { componentCost, suggestQuantity } from "@/lib/finance/costing";
import { resolveRate } from "@/lib/finance/fx";
import { D, dec, fmt2 } from "@/lib/finance/money";
import { marginPercent, markupPercent, sellFromMargin, sellFromMarkup } from "@/lib/finance/pricing";
import { balance, buildSnapshot, costTrip, priceFromCost, type CostingComponent } from "@/lib/finance/quote";

describe("margin vs markup", () => {
  it("R10 000 at 20% markup sells for R12 000; at 20% margin for R12 500", () => {
    expect(fmt2(sellFromMarkup(dec("10000"), dec("20")))).toBe("12000.00");
    expect(fmt2(sellFromMargin(dec("10000"), dec("20")))).toBe("12500.00");
  });
  it("reports margin and markup back from sell and cost", () => {
    expect(marginPercent(dec("12500"), dec("10000"))!.toFixed(2)).toBe("20.00");
    expect(markupPercent(dec("12500"), dec("10000"))!.toFixed(2)).toBe("25.00");
    expect(marginPercent(dec("12000"), dec("10000"))!.toFixed(2)).toBe("16.67");
  });
  it("handles zero and negative denominators safely", () => {
    expect(marginPercent(dec("0"), dec("100"))).toBeNull();
    expect(markupPercent(dec("100"), dec("0"))).toBeNull();
    expect(() => sellFromMargin(dec("100"), dec("100"))).toThrow();
    expect(() => sellFromMarkup(dec("100"), dec("-5"))).toThrow();
  });
});

describe("money precision and rounding", () => {
  it("avoids float error", () => {
    expect(fmt2(dec("0.1").plus(dec("0.2")))).toBe("0.30");
    expect(fmt2(dec("1.005"))).toBe("1.01"); // half-up, not banker's or float-truncated
    expect(fmt2(dec("2.675"))).toBe("2.68");
  });
  it("refuses non-integer JS numbers", () => {
    expect(() => dec(0.1)).toThrow();
  });
});

describe("rate-basis costing", () => {
  const party = { adults: 2, children: 1, rooms: 2, nights: 3, days: 4 };
  it("suggests quantities by basis", () => {
    expect(suggestQuantity("per_person", party)).toBe(3);
    expect(suggestQuantity("per_person_sharing", party)).toBe(9);
    expect(suggestQuantity("per_room_per_night", party)).toBe(6);
    expect(suggestQuantity("per_room_per_stay", party)).toBe(2);
    expect(suggestQuantity("per_vehicle_per_day", party)).toBe(4);
    expect(suggestQuantity("fixed", party)).toBe(1);
  });
  it("explains the calculation and applies minimum charges", () => {
    const c = componentCost({ unitCost: "3250.00", quantity: "4", basis: "per_person_sharing", currency: "ZAR" })!;
    expect(fmt2(c.amount)).toBe("13000.00");
    expect(c.explanation).toContain("4 × ZAR 3250.00");
    const m = componentCost({ unitCost: "500", quantity: "2", minimumCharge: "1500", currency: "ZAR" })!;
    expect(fmt2(m.amount)).toBe("1500.00");
    expect(m.minimumApplied).toBe(true);
    expect(componentCost({ unitCost: null, quantity: "1" })).toBeNull();
    expect(() => componentCost({ unitCost: "-1", quantity: "1" })).toThrow();
  });
});

describe("exchange rates", () => {
  const rates = [
    { fromCurrency: "USD", toCurrency: "ZAR", rate: "18.00000000", source: "Manual", effectiveDate: "2027-01-01" },
    { fromCurrency: "USD", toCurrency: "ZAR", rate: "18.50000000", source: "Manual", effectiveDate: "2027-03-01" },
  ];
  it("uses the latest rate effective on the date, with buffer", () => {
    const r = resolveRate(rates, "USD", "ZAR", "2027-02-15", dec("2"))!;
    expect(r.rate.toFixed(2)).toBe("18.00");
    expect(r.bufferedRate.toFixed(2)).toBe("18.36");
    expect(resolveRate(rates, "USD", "ZAR", "2027-04-01")!.rate.toFixed(2)).toBe("18.50");
  });
  it("inverts the opposite pair and returns null when nothing exists", () => {
    const r = resolveRate(rates, "ZAR", "USD", "2027-04-01")!;
    expect(r.inverted).toBe(true);
    expect(r.rate.toFixed(6)).toBe("0.054054");
    expect(resolveRate(rates, "EUR", "ZAR", "2027-04-01")).toBeNull();
    expect(resolveRate(rates, "USD", "ZAR", "2026-01-01")).toBeNull();
  });
});

const comp = (o: Partial<CostingComponent>): CostingComponent => ({
  id: crypto.randomUUID(), dayNumber: 1, dayTitle: null, dayLocation: null, position: 0, type: "activity", title: "x", startTime: null, endTime: null,
  startLocation: null, endLocation: null, guestDescription: null, includedInQuote: true, costCurrency: "ZAR", unitCost: null, quantity: "1",
  minimumCharge: null, costBasis: "fixed", supplierName: null, supplierRateId: null, rateVersion: null, operatingBrandName: "ULTIMA", ...o,
});

describe("trip costing and quote totals (Scenario D)", () => {
  const rates = [{ fromCurrency: "USD", toCurrency: "ZAR", rate: "18.25", source: "Manual — Finance", effectiveDate: "2027-01-01" }];
  const components = [
    comp({ type: "classic_car", unitCost: "4500", quantity: "3", costBasis: "per_vehicle_per_day" }),
    comp({ type: "safari_lodge", unitCost: "950", quantity: "4", costCurrency: "USD", operatingBrandName: "AYA", dayNumber: 4 }),
    comp({ type: "helicopter", unitCost: "28000", quantity: "1" }),
    comp({ type: "amenity", unitCost: "800", quantity: "2", includedInQuote: false }),
  ];
  it("converts multi-currency costs and totals in the quote currency", () => {
    const c = costTrip(components, { currency: "ZAR", rates, onDate: "2027-05-01" });
    expect(c.issues).toHaveLength(0);
    // 13 500 + (3 800 USD × 18.25 = 69 350) + 28 000 = 110 850
    expect(fmt2(c.totalCost)).toBe("110850.00");
    expect(fmt2(c.byOperatingBrand["AYA"]!)).toBe("69350.00");
    expect(fmt2(c.byCategory["transport"]!)).toBe("41500.00");
  });
  it("reports missing costs and missing rates instead of guessing", () => {
    const c = costTrip([comp({ unitCost: null }), comp({ unitCost: "10", costCurrency: "EUR" })], { currency: "ZAR", rates, onDate: "2027-05-01" });
    expect(c.issues.map((i) => i.issue)).toEqual(["no_cost", "no_rate"]);
  });
  it("prices by target margin with discount and commission", () => {
    const p = priceFromCost(dec("110850"), { mode: "margin", percent: "25", discountPercent: "5", commissionPercent: "10" });
    expect(fmt2(p.sellBeforeDiscount)).toBe("147800.00");
    expect(fmt2(p.discount)).toBe("7390.00");
    expect(fmt2(p.sell)).toBe("140410.00");
    expect(fmt2(p.commission)).toBe("14041.00");
    expect(fmt2(p.grossProfit)).toBe("15519.00");
    expect(p.marginPercent!.toFixed(2)).toBe("11.05");
  });
  it("builds a self-contained snapshot and refuses when costing is incomplete", () => {
    const costing = costTrip(components, { currency: "ZAR", rates, onDate: "2027-05-01" });
    const pricing = priceFromCost(costing.totalCost, { mode: "markup", percent: "20" });
    const snap = buildSnapshot({
      costing, pricing, pricingInput: { mode: "markup", percent: "20", fxBufferPercent: "0" },
      trip: { reference: "ULT-1", name: "T", startDate: "2027-05-10", endDate: "2027-05-14", adults: 2, children: 0, rooms: 1, leadGuestName: null },
      brand: { name: "ULTIMA", tagline: null, colorPrimary: "#000000", colorAccent: "#000000", contactEmail: null, contactPhone: null, website: null, documentFooter: null, quotingEntity: null },
      terms: { depositPercent: "30", depositDueDate: null, balanceDueDate: null, validUntil: null, inclusions: null, exclusions: null, terms: null },
    });
    expect(snap.totals.sell).toBe("133020.00");
    expect(snap.totals.perPerson).toBe("66510.00");
    expect(snap.fx).toEqual([expect.objectContaining({ from: "USD", to: "ZAR", rate: "18.25000000" })]);
    expect(snap.excluded).toHaveLength(1);
    expect(snap.itinerary.find((d) => d.dayNumber === 4)!.date).toBe("2027-05-13");
    const broken = costTrip([comp({ unitCost: null })], { currency: "ZAR", rates, onDate: "2027-05-01" });
    expect(() => buildSnapshot({ ...{ costing: broken, pricing, pricingInput: { mode: "markup", percent: "20", fxBufferPercent: "0" } }, trip: snap.trip, brand: snap.brand, terms: snap.terms })).toThrow();
  });
  it("computes balances without negative outstanding", () => {
    expect(fmt2(balance(dec("1000"), dec("300")).outstanding)).toBe("700.00");
    const o = balance(dec("1000"), dec("1200"));
    expect(fmt2(o.outstanding)).toBe("0.00");
    expect(fmt2(o.overpaid)).toBe("200.00");
    expect(new D(1).toString()).toBe("1");
  });
});
