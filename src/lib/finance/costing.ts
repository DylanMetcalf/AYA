import type { RateBasis } from "@/lib/domain/components";
import { RATE_BASIS_LABEL } from "@/lib/domain/components";
import { D, type Dec, dec, round2 } from "./money";

export interface PartyContext {
  adults: number;
  children: number;
  rooms: number;
  /** Nights the component spans (accommodation) — defaults to 1. */
  nights?: number;
  /** Days the component spans (vehicles, guides) — defaults to 1. */
  days?: number;
}

/** Default quantity for a rate basis. Users can override it; the explanation records what was used. */
export function suggestQuantity(basis: RateBasis, p: PartyContext): number {
  const people = p.adults + p.children;
  const nights = Math.max(1, p.nights ?? 1);
  const days = Math.max(1, p.days ?? 1);
  switch (basis) {
    case "per_person": return people;
    case "per_person_sharing": return people * nights;
    case "per_room_per_night": return p.rooms * nights;
    case "per_room_per_stay": return p.rooms;
    case "per_vehicle_per_day":
    case "per_guide_per_day": return days;
    default: return 1;
  }
}

export interface ComponentCostInput {
  unitCost: string | null;
  quantity: string | null;
  minimumCharge?: string | null;
  basis?: RateBasis | null;
  currency?: string | null;
}

export interface ComponentCost {
  amount: Dec;
  /** Human-readable calculation, e.g. "4 × ZAR 3 250.00 (per person sharing, per night) = ZAR 13 000.00". */
  explanation: string;
  minimumApplied: boolean;
}

export function componentCost(c: ComponentCostInput): ComponentCost | null {
  if (c.unitCost == null || c.unitCost === "") return null;
  const unit = dec(c.unitCost);
  const qty = dec(c.quantity ?? "1");
  if (unit.lt(0) || qty.lt(0)) throw new Error("Cost and quantity cannot be negative");
  const raw = unit.times(qty);
  const min = c.minimumCharge ? dec(c.minimumCharge) : null;
  const minimumApplied = !!min && raw.lt(min);
  const amount = round2(minimumApplied ? min! : raw);
  const cur = c.currency ?? "";
  const basis = c.basis ? ` (${RATE_BASIS_LABEL[c.basis].toLowerCase()})` : "";
  const explanation = minimumApplied
    ? `${qty.toString()} × ${cur} ${unit.toFixed(2)}${basis} = ${cur} ${raw.toFixed(2)}, below minimum charge → ${cur} ${amount.toFixed(2)}`
    : `${qty.toString()} × ${cur} ${unit.toFixed(2)}${basis} = ${cur} ${amount.toFixed(2)}`;
  return { amount, explanation, minimumApplied };
}

export const zero = () => new D(0);
