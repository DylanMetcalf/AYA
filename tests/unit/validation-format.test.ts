import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, nights } from "@/lib/format";
import { tripFieldsSchema } from "@/lib/validation/trip";

const base = { name: "Trip", primaryBrandId: crypto.randomUUID(), guestFacingBrandId: crypto.randomUUID(), adults: "2", children: "0", rooms: "1", currency: "ZAR" };

describe("trip validation", () => {
  it("normalises empty optional strings to null", () => {
    const v = tripFieldsSchema.parse({ ...base, startDate: "", purpose: "  ", estimatedValue: "" });
    expect(v.startDate).toBeNull();
    expect(v.purpose).toBeNull();
    expect(v.estimatedValue).toBeNull();
  });
  it("rejects a return before departure", () => {
    expect(() => tripFieldsSchema.parse({ ...base, startDate: "2027-05-10", endDate: "2027-05-09" })).toThrow(/Return date/);
  });
  it("rejects zero travellers and malformed amounts", () => {
    expect(() => tripFieldsSchema.parse({ ...base, adults: "0" })).toThrow(/traveller/);
    expect(() => tripFieldsSchema.parse({ ...base, estimatedValue: "12,5" })).toThrow();
    expect(tripFieldsSchema.parse({ ...base, estimatedValue: "125000.50" }).estimatedValue).toBe("125000.50");
  });
});

describe("formatting", () => {
  it("formats money from decimal strings without float maths", () => {
    expect(formatMoney("1234567.5", "ZAR")).toBe("ZAR 1 234 567.50");
    expect(formatMoney("-20.00", "USD")).toBe("−USD 20.00");
    expect(formatMoney(null, "ZAR")).toBe("—");
  });
  it("formats dates without timezone drift and counts nights", () => {
    expect(formatDate("2027-01-01")).toMatch(/1 Jan 2027/);
    expect(nights("2027-05-10", "2027-05-15")).toBe(5);
  });
});
