import { describe, expect, it } from "vitest";
import { computeBalances, validateMovement, type Movement } from "@/lib/domain/inventory";
import { assessReadiness, type ReadinessInput } from "@/lib/domain/readiness";
import { forecastToTarget } from "@/lib/finance/forecast";

describe("trip readiness (Scenario E)", () => {
  const base: ReadinessInput = {
    hasLeadGuest: true, hasDates: true, hasManager: true, commerciallyApproved: true, clientDepositOutstanding: false,
    components: [
      { id: "1", type: "safari_lodge", title: "Lodge", bookingStatus: "confirmed", dayNumber: 1 },
      { id: "2", type: "dining", title: "Dinner", bookingStatus: "confirmed", dayNumber: 1 },
      { id: "3", type: "helicopter", title: "Helicopter", bookingStatus: "provisional", dayNumber: 2 },
    ],
    vehicleSegmentsWithoutAllocation: [], allocations: [], openTasks: [],
  };
  it("is not ready while a critical transport confirmation is outstanding, despite high completion", () => {
    const r = assessReadiness(base);
    expect(r.percent).toBeGreaterThanOrEqual(85);
    expect(r.ready).toBe(false);
    expect(r.criticalOutstanding.map((x) => x.label)).toEqual(["Day 2: Helicopter"]);
  });
  it("becomes ready once the critical item is confirmed", () => {
    const r = assessReadiness({ ...base, components: base.components.map((c) => ({ ...c, bookingStatus: "confirmed" as const })) });
    expect(r.ready).toBe(true);
    expect(r.percent).toBe(100);
  });
  it("treats unallocated vehicles, unready vehicles and urgent tasks as critical", () => {
    const r = assessReadiness({ ...base, components: [], vehicleSegmentsWithoutAllocation: ["MGB"], allocations: [{ status: "confirmed", vehicleReady: false, label: "TR4" }], openTasks: [{ title: "Call lodge", priority: "urgent" }] });
    expect(r.criticalOutstanding.map((x) => x.key)).toEqual(expect.arrayContaining(["itinerary", "va-MGB", "vr-TR4", "t-Call lodge"]));
  });
});

describe("inventory ledger (Scenario G)", () => {
  const T = "trip-1";
  it("derives on-hand, reserved and out-with-trip from movements", () => {
    const m: Movement[] = [
      { type: "receive", quantity: 10, tripId: null },
      { type: "reserve", quantity: 4, tripId: T },
      { type: "issue", quantity: 3, tripId: T },
      { type: "return", quantity: 2, tripId: T },
      { type: "lost", quantity: 1, tripId: T },
    ];
    const b = computeBalances(m);
    expect(b).toMatchObject({ onHand: 9, reserved: 1, available: 8, withTrips: 0 });
  });
  it("rejects impossible movements", () => {
    const b = computeBalances([{ type: "receive", quantity: 5, tripId: null }, { type: "reserve", quantity: 4, tripId: T }]);
    expect(validateMovement(b, { type: "reserve", quantity: 2, tripId: "trip-2" }, "reusable")).toMatch(/Only 1/);
    expect(validateMovement(b, { type: "write_off", quantity: 2, tripId: null }, "reusable")).toMatch(/Only 1/);
    expect(validateMovement(b, { type: "release", quantity: 5, tripId: T }, "reusable")).toMatch(/Only 4/);
    expect(validateMovement(b, { type: "return", quantity: 1, tripId: T }, "reusable")).toMatch(/Only 0/);
    expect(validateMovement(b, { type: "return", quantity: 1, tripId: T }, "consumable")).toMatch(/cannot be returned/);
    expect(validateMovement(b, { type: "issue", quantity: 5, tripId: T }, "consumable")).toBeNull();
    expect(validateMovement(b, { type: "issue", quantity: 6, tripId: T }, "consumable")).toMatch(/Only 5/);
    expect(validateMovement(b, { type: "receive", quantity: 0, tripId: null }, "consumable")).toMatch(/greater than zero/);
  });
});

describe("forecasting", () => {
  it("computes the gap, bookings and opportunities needed from data plus explicit assumptions", () => {
    const f = forecastToTarget({ target: 1_000_000, achieved: 400_000, historicalBookingValues: [100_000, 150_000, 200_000], conversion: { conservative: 20, expected: 30, optimistic: null }, decided: { accepted: 2, declined: 2 } });
    expect(f.gap).toBe(600_000);
    expect(f.averageBookingValue).toBe(150_000);
    expect(f.bookingsNeeded).toBe(4);
    expect(f.scenarios.map((s) => s.opportunitiesNeeded)).toEqual([20, 14, null]);
    expect(f.observedConversion).toBeNull(); // fewer than 5 decisions: not shown as fact
  });
  it("refuses to estimate from insufficient history", () => {
    const f = forecastToTarget({ target: 500, achieved: 0, historicalBookingValues: [100], conversion: { conservative: 20, expected: 30, optimistic: 40 }, decided: { accepted: 0, declined: 0 } });
    expect(f.insufficientHistory).toBe(true);
    expect(f.bookingsNeeded).toBeNull();
    expect(f.scenarios.every((s) => s.opportunitiesNeeded === null)).toBe(true);
  });
});
