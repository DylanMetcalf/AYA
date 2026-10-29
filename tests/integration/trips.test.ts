import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { auditEvents, tripAssignments, tripBrands, tripStatusHistory, trips } from "@/server/db/schema";
import { getGuest, createGuest, updateGuest } from "@/server/services/guests";
import { createTrip, duplicateTrip, getTrip, listTrips, recordCommercialApproval, transitionTrip, updateTrip } from "@/server/services/trips";
import { brandIds, db, makeActor, makeActorWithPermissions, tripInput } from "./helpers";

describe("trip creation and multi-brand context", () => {
  it("creates a trip with sequential reference, brand participation, history and audit", async () => {
    const tm = await makeActor("trip_manager");
    const t1 = await createTrip(db, tm, await tripInput());
    const t2 = await createTrip(db, tm, await tripInput({ name: "Second" }));
    expect(t1.reference).toMatch(/^ULT-\d{4}-0001$/);
    expect(t2.reference).toMatch(/-0002$/);
    expect(t1.managerId).toBe(tm.id);
    const b = await brandIds();
    const rows = await db.select().from(tripBrands).where(eq(tripBrands.tripId, t1.id));
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ brandId: b.aya.id, role: "participating" }),
      expect.objectContaining({ brandId: b.schmidt.id, role: "supplying" }),
    ]));
    expect(await db.select().from(tripStatusHistory).where(eq(tripStatusHistory.tripId, t1.id))).toHaveLength(1);
    expect(await db.select().from(auditEvents).where(eq(auditEvents.entityId, t1.id))).toHaveLength(1);
  });

  it("rejects unknown brands and invalid dates at the service boundary", async () => {
    const tm = await makeActor("trip_manager");
    await expect(createTrip(db, tm, await tripInput({ participatingBrandIds: [crypto.randomUUID()] }))).rejects.toThrow(/brands do not exist/);
    await expect(createTrip(db, tm, await tripInput({ startDate: "2027-05-10", endDate: "2027-05-01" }))).rejects.toThrow();
  });
});

describe("permissions and record scoping (Scenario F)", () => {
  it("denies creation to roles without trip.create", async () => {
    for (const role of ["guide", "finance", "fleet"]) {
      const a = await makeActor(role);
      await expect(createTrip(db, a, await tripInput())).rejects.toMatchObject({ code: "forbidden" });
    }
  });

  it("guides only see assigned trips; manipulated ids return not found", async () => {
    const tm = await makeActor("trip_manager");
    const guide = await makeActor("guide");
    const assigned = await createTrip(db, tm, await tripInput({ name: "Assigned" }));
    const other = await createTrip(db, tm, await tripInput({ name: "Other" }));
    await db.insert(tripAssignments).values({ tripId: assigned.id, userId: guide.id, role: "guide" });
    expect((await listTrips(db, guide)).map((t) => t.name)).toEqual(["Assigned"]);
    await expect(getTrip(db, guide, other.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(getTrip(db, guide, "not-a-uuid")).rejects.toMatchObject({ code: "not_found" });
    expect((await getTrip(db, guide, assigned.id)).trip.name).toBe("Assigned");
    // Guides cannot edit even their assigned trip.
    await expect(updateTrip(db, guide, assigned.id, 1, await tripInput())).rejects.toMatchObject({ code: "forbidden" });
  });

  it("users with no roles cannot read trips at all", async () => {
    const nobody = await makeActor();
    await expect(listTrips(db, nobody)).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("editing and concurrency", () => {
  it("rejects a stale write instead of silently overwriting", async () => {
    const tm = await makeActor("trip_manager");
    const t = await createTrip(db, tm, await tripInput());
    await updateTrip(db, tm, t.id, 1, await tripInput({ name: "Edit A" }));
    await expect(updateTrip(db, tm, t.id, 1, await tripInput({ name: "Edit B" }))).rejects.toMatchObject({ code: "conflict" });
    const [row] = await db.select().from(trips).where(eq(trips.id, t.id));
    expect(row!.name).toBe("Edit A");
    expect(row!.version).toBe(2);
  });

  it("only one of two simultaneous edits from the same version wins", async () => {
    const tm = await makeActor("trip_manager");
    const t = await createTrip(db, tm, await tripInput());
    const results = await Promise.allSettled([
      updateTrip(db, tm, t.id, 1, await tripInput({ name: "Racer 1" })),
      updateTrip(db, tm, t.id, 1, await tripInput({ name: "Racer 2" })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
});

describe("lifecycle enforcement", () => {
  async function walk(actor: Awaited<ReturnType<typeof makeActor>>, id: string, path: string[]) {
    let version = (await db.select().from(trips).where(eq(trips.id, id)))[0]!.version;
    for (const to of path) version = (await transitionTrip(db, actor, id, { to, expectedVersion: version })).version;
    return version;
  }

  it("rejects invalid transitions and blocks confirmation without approval", async () => {
    const mgmt = await makeActor("management");
    const t = await createTrip(db, mgmt, await tripInput());
    await expect(transitionTrip(db, mgmt, t.id, { to: "confirmed", expectedVersion: 1 })).rejects.toThrow(/cannot move/);
    const v = await walk(mgmt, t.id, ["discovery", "concept", "draft_itinerary", "costing", "internal_review", "quote_ready"]);
    // quote_issued requires an issued quote (Phase 6); management can override with a reason.
    await expect(transitionTrip(db, mgmt, t.id, { to: "quote_issued", expectedVersion: v })).rejects.toThrow(/No quotation/);
  });

  it("trip managers cannot override or confirm; overrides by authorised users are recorded", async () => {
    const tm = await makeActor("trip_manager");
    const mgmt = await makeActor("management");
    const t = await createTrip(db, tm, await tripInput());
    const v = await walk(tm, t.id, ["discovery", "concept", "draft_itinerary", "costing", "internal_review", "quote_ready"]);
    await expect(transitionTrip(db, tm, t.id, { to: "quote_issued", expectedVersion: v, override: true, reason: "Sent manually" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(transitionTrip(db, mgmt, t.id, { to: "quote_issued", expectedVersion: v, override: true })).rejects.toThrow(/reason/);
    const after = await transitionTrip(db, mgmt, t.id, { to: "quote_issued", expectedVersion: v, override: true, reason: "Quote sent outside the system" });
    expect(after.status).toBe("quote_issued");
    await expect(transitionTrip(db, tm, t.id, { to: "confirmed", expectedVersion: after.version, override: true, reason: "x" })).rejects.toMatchObject({ code: "forbidden" });
    const [h] = await db.select().from(tripStatusHistory).where(eq(tripStatusHistory.toStatus, "quote_issued"));
    expect(h).toMatchObject({ overridden: true, reason: "Quote sent outside the system" });
    expect(h!.overriddenRules).toMatch(/No quotation/);
  });

  it("approval clears the approval blocker; cancellation requires a reason and freezes edits", async () => {
    const mgmt = await makeActor("management");
    const t = await createTrip(db, mgmt, await tripInput());
    await recordCommercialApproval(db, mgmt, t.id, 1);
    await expect(recordCommercialApproval(db, mgmt, t.id, 2)).rejects.toThrow(/already/);
    await expect(transitionTrip(db, mgmt, t.id, { to: "cancelled", expectedVersion: 2 })).rejects.toThrow(/reason/);
    await transitionTrip(db, mgmt, t.id, { to: "cancelled", expectedVersion: 2, reason: "Client postponed indefinitely" });
    await expect(updateTrip(db, mgmt, t.id, 3, await tripInput())).rejects.toThrow(/Finished trips/);
    expect((await db.select().from(trips).where(eq(trips.id, t.id)))[0]!.closingReason).toBe("Client postponed indefinitely");
  });
});

describe("duplication", () => {
  it("copies the design but not dates, status, approval or history", async () => {
    const mgmt = await makeActor("management");
    const t = await createTrip(db, mgmt, await tripInput({ internalNotes: "Prefers early starts" }));
    await recordCommercialApproval(db, mgmt, t.id, 1);
    await transitionTrip(db, mgmt, t.id, { to: "discovery", expectedVersion: 2 });
    const copy = await duplicateTrip(db, mgmt, t.id);
    expect(copy).toMatchObject({ status: "enquiry", startDate: null, endDate: null, commercialApprovedAt: null, internalNotes: "Prefers early starts", version: 1 });
    expect(copy.reference).not.toBe(t.reference);
    expect(await db.select().from(tripBrands).where(eq(tripBrands.tripId, copy.id))).toHaveLength(2);
    expect(await db.select().from(tripStatusHistory).where(eq(tripStatusHistory.tripId, copy.id))).toHaveLength(1);
  });
});

describe("guest sensitive data", () => {
  it("redacts dietary/medical data for roles without access and prevents them overwriting it", async () => {
    const tm = await makeActor("trip_manager");
    const fin = await makeActor("finance");
    const g = await createGuest(db, tm, { firstName: "Amelia", lastName: "Hart", dietary: "Coeliac", medicalNotes: "EpiPen" });
    expect((await getGuest(db, tm, g.id)).guest.dietary).toBe("Coeliac");
    const seen = (await getGuest(db, fin, g.id)).guest;
    expect(seen).toMatchObject({ dietary: null, medicalNotes: null, sensitiveRedacted: true });
    await expect(updateGuest(db, fin, g.id, { firstName: "A", lastName: "H" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("an editor without sensitive access cannot blank out sensitive fields", async () => {
    const tm = await makeActor("trip_manager");
    const concierge = await makeActorWithPermissions("guest.read", "guest.edit");
    const g = await createGuest(db, tm, { firstName: "Amelia", lastName: "Hart", dietary: "Coeliac" });
    await updateGuest(db, concierge, g.id, { firstName: "Amelia", lastName: "Hart-Smith", dietary: "" });
    const after = (await getGuest(db, tm, g.id)).guest;
    expect(after).toMatchObject({ lastName: "Hart-Smith", dietary: "Coeliac" });
  });
});
