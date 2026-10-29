import type { TripStatus } from "./trip-lifecycle";

/** Named trip list views. Command Centre counts link to the same definitions, so a number always matches its list. */
export const TRIP_VIEWS = {
  active: { label: "Active", statuses: ["enquiry", "discovery", "concept", "draft_itinerary", "costing", "internal_review", "quote_ready", "quote_issued", "awaiting_decision", "provisional_hold", "confirmed", "pre_trip", "in_progress", "completed", "reconciliation"] },
  enquiries: { label: "Enquiries & design", statuses: ["enquiry", "discovery", "concept"] },
  awaiting_quote: { label: "Awaiting quotation", statuses: ["draft_itinerary", "costing", "internal_review", "quote_ready"] },
  awaiting_decision: { label: "Awaiting client", statuses: ["quote_issued", "awaiting_decision", "provisional_hold"] },
  operations: { label: "Confirmed & operating", statuses: ["confirmed", "pre_trip", "in_progress"] },
  wrap_up: { label: "Wrap-up", statuses: ["completed", "reconciliation"] },
  finished: { label: "Closed, cancelled & lost", statuses: ["closed", "cancelled", "lost"] },
} satisfies Record<string, { label: string; statuses: TripStatus[] }>;

export type TripViewKey = keyof typeof TRIP_VIEWS;
export const isTripView = (v: unknown): v is TripViewKey => typeof v === "string" && v in TRIP_VIEWS;
