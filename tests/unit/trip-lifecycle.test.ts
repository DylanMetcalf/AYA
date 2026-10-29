import { describe, expect, it } from "vitest";
import { TRIP_STATUSES, allowedNextStatuses, evaluateTransition, tripPhase } from "@/lib/domain/trip-lifecycle";

const ctx = { commerciallyApproved: false, hasIssuedQuote: false, hasAcceptedQuote: false };

describe("trip lifecycle", () => {
  it("every status has a defined transition list referencing valid statuses", () => {
    for (const s of TRIP_STATUSES) for (const t of allowedNextStatuses(s)) expect(TRIP_STATUSES).toContain(t);
  });

  it("terminal states cannot move, except reopening a lost opportunity", () => {
    expect(allowedNextStatuses("closed")).toEqual([]);
    expect(allowedNextStatuses("cancelled")).toEqual([]);
    expect(allowedNextStatuses("lost")).toEqual(["discovery"]);
  });

  it("rejects arbitrary jumps", () => {
    expect(evaluateTransition("enquiry", "confirmed", ctx).valid).toBe(false);
    expect(evaluateTransition("in_progress", "cancelled", ctx).valid).toBe(false);
    expect(evaluateTransition("confirmed", "costing", ctx).valid).toBe(false);
  });

  it("blocks confirmation without approval and an accepted quote, and requires a reason", () => {
    const ev = evaluateTransition("awaiting_decision", "confirmed", ctx);
    expect(ev.valid).toBe(true);
    expect(ev.blockers).toHaveLength(2);
    expect(ev.reasonRequired).toBe(true);
    expect(ev.permission).toBe("trip.confirm");
  });

  it("allows confirmation without blockers once approved and accepted", () => {
    const ev = evaluateTransition("awaiting_decision", "confirmed", { commerciallyApproved: true, hasIssuedQuote: true, hasAcceptedQuote: true });
    expect(ev.blockers).toEqual([]);
    expect(ev.reasonRequired).toBe(false);
  });

  it("requires an issued quote to enter quote_issued", () => {
    expect(evaluateTransition("quote_ready", "quote_issued", ctx).blockers).toHaveLength(1);
  });

  it("cancellation and loss always require a reason and the right permission", () => {
    expect(evaluateTransition("costing", "cancelled", ctx)).toMatchObject({ reasonRequired: true, permission: "trip.cancel", blockers: [] });
    expect(evaluateTransition("costing", "lost", ctx)).toMatchObject({ reasonRequired: true, permission: "trip.edit" });
  });

  it("classifies phases", () => {
    expect(tripPhase("concept")).toBe("sales");
    expect(tripPhase("pre_trip")).toBe("operations");
    expect(tripPhase("lost")).toBe("finished");
  });
});
