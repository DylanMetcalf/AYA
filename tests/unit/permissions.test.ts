import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, SYSTEM_ROLES } from "@/lib/auth/permissions";
import { TRIP_VIEWS } from "@/lib/domain/trip-views";
import { TRIP_STATUSES } from "@/lib/domain/trip-lifecycle";

describe("permission catalogue", () => {
  it("system roles reference only catalogued permissions", () => {
    for (const r of SYSTEM_ROLES) for (const p of r.permissions) expect(ALL_PERMISSIONS).toContain(p);
  });
  it("guides cannot see all trips, costs or admin", () => {
    const guide = SYSTEM_ROLES.find((r) => r.key === "guide")!;
    expect(guide.permissions).not.toContain("trip.read_all");
    expect(guide.permissions).not.toContain("finance.read_costs");
    expect(guide.permissions.some((p) => p.startsWith("admin."))).toBe(false);
  });
  it("management has no admin permissions", () => {
    expect(SYSTEM_ROLES.find((r) => r.key === "management")!.permissions.some((p) => p.startsWith("admin."))).toBe(false);
  });
});

describe("trip views", () => {
  it("every non-active view's statuses are valid and views do not overlap except 'active'", () => {
    const seen = new Set<string>();
    for (const [key, v] of Object.entries(TRIP_VIEWS)) {
      for (const s of v.statuses) expect(TRIP_STATUSES).toContain(s);
      if (key === "active") continue;
      for (const s of v.statuses) {
        expect(seen.has(s)).toBe(false);
        seen.add(s);
      }
    }
    expect(seen.size).toBe(TRIP_STATUSES.length);
  });
});
