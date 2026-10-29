export type MovementType = "receive" | "adjust_in" | "adjust_out" | "reserve" | "release" | "issue" | "return" | "write_off" | "lost";
export interface Movement { type: MovementType; quantity: number; tripId: string | null }

export interface Balances {
  onHand: number;
  reserved: number;
  available: number;
  /** Reusable items currently out with trips. */
  withTrips: number;
  byTrip: Map<string, { reserved: number; out: number; issued: number }>;
}

/** Derives balances from the ledger. See schema/inventory.ts for the movement semantics. */
export function computeBalances(movements: Movement[]): Balances {
  let onHand = 0;
  const byTrip = new Map<string, { reserved: number; out: number; issued: number }>();
  const t = (id: string | null) => {
    const k = id ?? "_";
    const e = byTrip.get(k) ?? { reserved: 0, out: 0, issued: 0 };
    byTrip.set(k, e);
    return e;
  };
  for (const m of movements) {
    switch (m.type) {
      case "receive": case "adjust_in": onHand += m.quantity; break;
      case "adjust_out": case "write_off": onHand -= m.quantity; break;
      case "reserve": t(m.tripId).reserved += m.quantity; break;
      case "release": t(m.tripId).reserved -= m.quantity; break;
      case "issue": { onHand -= m.quantity; const e = t(m.tripId); e.reserved = Math.max(0, e.reserved - m.quantity); e.out += m.quantity; e.issued += m.quantity; break; }
      case "return": onHand += m.quantity; t(m.tripId).out -= m.quantity; break;
      case "lost": t(m.tripId).out -= m.quantity; break;
    }
  }
  const reserved = [...byTrip.values()].reduce((a, e) => a + e.reserved, 0);
  const withTrips = [...byTrip.values()].reduce((a, e) => a + e.out, 0);
  return { onHand, reserved, available: onHand - reserved, withTrips, byTrip };
}

/** Returns an error message if the movement would leave the ledger in an impossible state. */
export function validateMovement(b: Balances, m: Movement, kind: "consumable" | "reusable"): string | null {
  if (!Number.isInteger(m.quantity) || m.quantity <= 0) return "Quantity must be a whole number greater than zero.";
  const trip = m.tripId ? b.byTrip.get(m.tripId) ?? { reserved: 0, out: 0, issued: 0 } : null;
  switch (m.type) {
    case "adjust_out": case "write_off":
      return m.quantity > b.available ? `Only ${b.available} available (unreserved) in stock.` : null;
    case "reserve":
      return m.quantity > b.available ? `Only ${b.available} available to reserve.` : null;
    case "release":
      return m.quantity > (trip?.reserved ?? 0) ? `Only ${trip?.reserved ?? 0} reserved for this journey.` : null;
    case "issue":
      // Issue from the trip's reservation first, then from unreserved stock.
      return m.quantity > (trip?.reserved ?? 0) + b.available ? `Only ${(trip?.reserved ?? 0) + b.available} can be issued to this journey.` : null;
    case "return":
      if (kind === "consumable") return "Consumables are used on issue and cannot be returned. Record an adjustment instead.";
      return m.quantity > (trip?.out ?? 0) ? `Only ${trip?.out ?? 0} are out with this journey.` : null;
    case "lost":
      if (kind === "consumable") return "Consumables are used on issue; nothing to mark lost.";
      return m.quantity > (trip?.out ?? 0) ? `Only ${trip?.out ?? 0} are out with this journey.` : null;
    default:
      return null;
  }
}

/** Issued consumables leave the "with trip" count — they're consumed. */
export function normaliseConsumableBalances(b: Balances, kind: "consumable" | "reusable"): Balances {
  if (kind === "reusable") return b;
  for (const e of b.byTrip.values()) e.out = 0;
  return { ...b, withTrips: 0 };
}
