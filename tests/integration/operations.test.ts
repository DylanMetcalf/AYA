import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { auditEvents, vehicles } from "@/server/db/schema";
import { allocateVehicle, getVehicle, recordInspection, resolveDefect, saveVehicle, setVehicleStatus, updateAllocation } from "@/server/services/fleet";
import { getInventoryItem, recordMovement, saveInventoryItem } from "@/server/services/inventory";
import { createTask, listTasks, setTaskStatus } from "@/server/services/tasks";
import { createTrip } from "@/server/services/trips";
import { tripAssignments } from "@/server/db/schema";
import { db, makeActor, tripInput } from "./helpers";

const vehicleInput = { registration: "mgb 1965", make: "MG", model: "MGB", category: "classic" as const, turnaroundDays: 1 };
const allChecks = [{ item: "Brakes", result: "pass" as const }];

describe("vehicle allocation (Scenario B)", () => {
  it("rejects overlapping allocations including the turnaround buffer", async () => {
    const mgmt = await makeActor("management");
    const v = await saveVehicle(db, mgmt, null, vehicleInput);
    expect(v.registration).toBe("MGB 1965");
    const t1 = await createTrip(db, mgmt, await tripInput({ name: "One" }));
    const t2 = await createTrip(db, mgmt, await tripInput({ name: "Two" }));
    await allocateVehicle(db, mgmt, { vehicleId: v.id, tripId: t1.id, startDate: "2027-05-10", endDate: "2027-05-12", status: "confirmed" });
    await expect(allocateVehicle(db, mgmt, { vehicleId: v.id, tripId: t2.id, startDate: "2027-05-12", endDate: "2027-05-14", status: "provisional" })).rejects.toThrow(/already allocated for ULT/);
    // 13 May is the turnaround day after a 12 May return.
    await expect(allocateVehicle(db, mgmt, { vehicleId: v.id, tripId: t2.id, startDate: "2027-05-13", endDate: "2027-05-14", status: "confirmed" })).rejects.toMatchObject({ code: "conflict" });
    const ok = await allocateVehicle(db, mgmt, { vehicleId: v.id, tripId: t2.id, startDate: "2027-05-14", endDate: "2027-05-16", status: "confirmed" });
    expect(ok.bufferDays).toBe(1);
    await expect(saveVehicle(db, mgmt, null, { ...vehicleInput, registration: "MGB 1965" })).rejects.toThrow(/already exists/);
  });

  it("concurrent requests for the same vehicle cannot both succeed (database exclusion constraint)", async () => {
    const mgmt = await makeActor("management");
    const v = await saveVehicle(db, mgmt, null, { ...vehicleInput, registration: "TR4 001" });
    const trips = await Promise.all([1, 2, 3, 4].map((i) => tripInput({ name: `Race ${i}` }).then((x) => createTrip(db, mgmt, x))));
    const results = await Promise.allSettled(trips.map((t) => allocateVehicle(db, mgmt, { vehicleId: v.id, tripId: t.id, startDate: "2027-06-01", endDate: "2027-06-03", status: "confirmed" })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((x) => x.status === "rejected")) expect((r as PromiseRejectedResult).reason).toMatchObject({ code: "conflict" });
  });

  it("cancelled allocations free the dates; handover and return are validated", async () => {
    const mgmt = await makeActor("management");
    const v = await saveVehicle(db, mgmt, null, { ...vehicleInput, registration: "TR3 002" });
    const t = await createTrip(db, mgmt, await tripInput());
    const a = await allocateVehicle(db, mgmt, { vehicleId: v.id, tripId: t.id, startDate: "2027-07-01", endDate: "2027-07-02", status: "provisional" });
    await expect(updateAllocation(db, mgmt, a.id, { handover: { mileageOut: 1000, fuelOut: "Full" } })).rejects.toThrow(/Confirm the allocation/);
    await updateAllocation(db, mgmt, a.id, { status: "confirmed" });
    await expect(updateAllocation(db, mgmt, a.id, { return: { mileageIn: 1100, fuelIn: "1/2" } })).rejects.toThrow(/handover before/);
    await updateAllocation(db, mgmt, a.id, { handover: { mileageOut: 1000, fuelOut: "Full" } });
    await expect(updateAllocation(db, mgmt, a.id, { return: { mileageIn: 900, fuelIn: "1/2" } })).rejects.toThrow(/below handover/);
    await updateAllocation(db, mgmt, a.id, { return: { mileageIn: 1180, fuelIn: "1/2" } });
    expect((await db.select().from(vehicles).where(eq(vehicles.id, v.id)))[0]!.currentMileage).toBe(1180);
    await updateAllocation(db, mgmt, a.id, { status: "cancelled" });
    await expect(updateAllocation(db, mgmt, a.id, { status: "confirmed" })).rejects.toThrow(/cannot be reinstated/);
    await allocateVehicle(db, mgmt, { vehicleId: v.id, tripId: t.id, startDate: "2027-07-01", endDate: "2027-07-02", status: "confirmed" });
  });
});

describe("vehicle safety", () => {
  it("a critical defect takes the vehicle out of service; release needs resolution or an audited override", async () => {
    const fleet = await makeActor("fleet");
    const mgmt = await makeActor("management");
    const v = await saveVehicle(db, fleet, null, { ...vehicleInput, registration: "MGA 003" });
    await expect(recordInspection(db, fleet, v.id, { kind: "pre_trip", checks: [{ item: "Brakes", result: "fail" }], signedOff: true })).rejects.toThrow(/Record a defect/);
    await recordInspection(db, fleet, v.id, { kind: "pre_trip", checks: [{ item: "Brakes", result: "fail" }], signedOff: false, defects: [{ description: "Front brake pads worn below limit", severity: "critical" }] });
    let detail = await getVehicle(db, fleet, v.id);
    expect(detail.vehicle.status).toBe("unavailable");
    expect(detail.readiness.ready).toBe(false);
    const t = await createTrip(db, mgmt, await tripInput());
    await expect(allocateVehicle(db, fleet, { vehicleId: v.id, tripId: t.id, startDate: "2027-08-01", endDate: "2027-08-02", status: "confirmed" })).rejects.toThrow(/unavailable/);
    await expect(setVehicleStatus(db, fleet, v.id, "available")).rejects.toThrow(/critical defect/);
    await expect(setVehicleStatus(db, fleet, v.id, "available", { reason: "Needed urgently for a guest" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(setVehicleStatus(db, mgmt, v.id, "available", { reason: "short" })).rejects.toThrow(/full reason/);
    await setVehicleStatus(db, mgmt, v.id, "available", { reason: "Workshop confirmed safe to drive to service centre only" });
    const [ev] = await db.select().from(auditEvents).where(eq(auditEvents.action, "vehicle.safety_override"));
    expect(ev).toMatchObject({ category: "security" });
    expect(ev!.summary).toMatch(/SAFETY OVERRIDE/);
    // Override does not make it "ready", and it still cannot be confirmed for a journey.
    await expect(allocateVehicle(db, mgmt, { vehicleId: v.id, tripId: t.id, startDate: "2027-08-01", endDate: "2027-08-02", status: "confirmed" })).rejects.toThrow(/critical defect/);
    detail = await getVehicle(db, fleet, v.id);
    await resolveDefect(db, fleet, detail.defects[0]!.d.id, "Pads and discs replaced by workshop, invoice 4471");
    await recordInspection(db, fleet, v.id, { kind: "pre_trip", checks: allChecks, signedOff: true });
    expect((await getVehicle(db, fleet, v.id)).readiness.ready).toBe(true);
  });
});

describe("inventory (Scenario G)", () => {
  it("tracks reservation, issue, return and loss with correct balances", async () => {
    const ops = await makeActor("operations");
    const trip = await createTrip(db, await makeActor("management"), await tripInput());
    const item = await saveInventoryItem(db, ops, null, { sku: "bino-01", name: "Binoculars", category: "Safari equipment", kind: "reusable", unit: "each", reorderThreshold: 2 });
    const mv = (type: string, quantity: number, extra: Record<string, unknown> = {}) => recordMovement(db, ops, item.id, { type: type as never, quantity, tripId: trip.id, idempotencyKey: crypto.randomUUID(), ...extra });
    await recordMovement(db, ops, item.id, { type: "receive", quantity: 6, idempotencyKey: crypto.randomUUID() });
    await mv("reserve", 4);
    await expect(mv("reserve", 3)).rejects.toThrow(/Only 2/);
    await mv("issue", 4);
    await mv("return", 2);
    await expect(mv("lost", 1)).rejects.toThrow(/Explain/);
    await mv("lost", 1, { note: "Left at lodge, reported" });
    await expect(mv("return", 2)).rejects.toThrow(/Only 1/);
    const d = await getInventoryItem(db, ops, item.id);
    expect(d.balances).toMatchObject({ onHand: 4, reserved: 0, available: 4, withTrips: 1 });
    expect(d.movements).toHaveLength(5); // receive, reserve, issue, return, lost — rejected attempts leave no trace in the ledger
  });

  it("duplicate submissions and concurrent reservations cannot over-allocate", async () => {
    const ops = await makeActor("operations");
    const mgmt = await makeActor("management");
    const item = await saveInventoryItem(db, ops, null, { sku: "gift-01", name: "Welcome hamper", category: "Gifts", kind: "consumable", unit: "each", reorderThreshold: 0 });
    const key = crypto.randomUUID();
    await recordMovement(db, ops, item.id, { type: "receive", quantity: 5, idempotencyKey: key });
    const dup = await recordMovement(db, ops, item.id, { type: "receive", quantity: 5, idempotencyKey: key });
    expect(dup.duplicate).toBe(true);
    const trips = await Promise.all([1, 2, 3].map((i) => tripInput({ name: `T${i}` }).then((x) => createTrip(db, mgmt, x))));
    const res = await Promise.allSettled(trips.map((t) => recordMovement(db, ops, item.id, { type: "reserve", quantity: 2, tripId: t.id, idempotencyKey: crypto.randomUUID() })));
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect((await getInventoryItem(db, ops, item.id)).balances).toMatchObject({ onHand: 5, reserved: 4, available: 1 });
    await expect(recordMovement(db, await makeActor("guide"), item.id, { type: "receive", quantity: 1, idempotencyKey: crypto.randomUUID() })).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("tasks and responsibilities", () => {
  it("assignees can progress their own tasks; scoping hides other trips' tasks from guides", async () => {
    const tm = await makeActor("trip_manager");
    const guide = await makeActor("guide");
    const t1 = await createTrip(db, tm, await tripInput({ name: "Guided" }));
    const t2 = await createTrip(db, tm, await tripInput({ name: "Other" }));
    await db.insert(tripAssignments).values({ tripId: t1.id, userId: guide.id, role: "guide" });
    const mine = await createTask(db, tm, { title: "Brief guests on game drive", tripId: t1.id, assigneeId: guide.id, priority: "high", category: "experiences", dueDate: "2027-05-10" });
    await createTask(db, tm, { title: "Pay helicopter deposit", tripId: t2.id, priority: "urgent", category: "financial" });
    expect((await listTasks(db, guide)).map((r) => r.t.title)).toEqual(["Brief guests on game drive"]);
    await expect(createTask(db, guide, { title: "x", priority: "low", category: "general" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(setTaskStatus(db, guide, mine.id, "blocked")).rejects.toThrow(/blocking/);
    await setTaskStatus(db, guide, mine.id, "done");
    expect((await listTasks(db, guide, { status: "done" }))[0]!.t.completedAt).not.toBeNull();
    const other = (await listTasks(db, tm)).find((r) => r.t.title.startsWith("Pay"))!;
    await expect(setTaskStatus(db, guide, other.t.id, "done")).rejects.toMatchObject({ code: "not_found" });
  });
});
