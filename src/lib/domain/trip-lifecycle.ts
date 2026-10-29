import type { Permission } from "@/lib/auth/permissions";

export const TRIP_STATUSES = [
  "enquiry",
  "discovery",
  "concept",
  "draft_itinerary",
  "costing",
  "internal_review",
  "quote_ready",
  "quote_issued",
  "awaiting_decision",
  "provisional_hold",
  "confirmed",
  "pre_trip",
  "in_progress",
  "completed",
  "reconciliation",
  "closed",
  "cancelled",
  "lost",
] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  enquiry: "New enquiry",
  discovery: "Discovery",
  concept: "Concept development",
  draft_itinerary: "Draft itinerary",
  costing: "Costing",
  internal_review: "Internal review",
  quote_ready: "Quotation ready",
  quote_issued: "Quotation issued",
  awaiting_decision: "Awaiting client decision",
  provisional_hold: "Provisionally held",
  confirmed: "Confirmed",
  pre_trip: "Pre-trip preparation",
  in_progress: "In progress",
  completed: "Completed",
  reconciliation: "Reconciliation",
  closed: "Closed",
  cancelled: "Cancelled",
  lost: "Lost opportunity",
};

export type TripPhase = "sales" | "operations" | "finished";
export const tripPhase = (s: TripStatus): TripPhase =>
  (["closed", "cancelled", "lost"] as TripStatus[]).includes(s)
    ? "finished"
    : TRIP_STATUSES.indexOf(s) >= TRIP_STATUSES.indexOf("confirmed")
      ? "operations"
      : "sales";

/** Statuses in which the commercial agreement exists (booking value counts as confirmed). */
export const CONFIRMED_STATUSES: TripStatus[] = [
  "confirmed",
  "pre_trip",
  "in_progress",
  "completed",
  "reconciliation",
  "closed",
];

const PRE_SALE_EXITS: TripStatus[] = ["lost", "cancelled"];

/** Default transition graph (OPEN_DECISIONS D14). */
const TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  enquiry: ["discovery", "concept", ...PRE_SALE_EXITS],
  discovery: ["concept", "enquiry", ...PRE_SALE_EXITS],
  concept: ["draft_itinerary", "discovery", ...PRE_SALE_EXITS],
  draft_itinerary: ["costing", "concept", ...PRE_SALE_EXITS],
  costing: ["internal_review", "draft_itinerary", ...PRE_SALE_EXITS],
  internal_review: ["quote_ready", "costing", "draft_itinerary", ...PRE_SALE_EXITS],
  quote_ready: ["quote_issued", "internal_review", "costing", ...PRE_SALE_EXITS],
  quote_issued: ["awaiting_decision", "provisional_hold", "confirmed", "costing", ...PRE_SALE_EXITS],
  awaiting_decision: ["provisional_hold", "confirmed", "costing", ...PRE_SALE_EXITS],
  provisional_hold: ["confirmed", "awaiting_decision", "costing", ...PRE_SALE_EXITS],
  confirmed: ["pre_trip", "cancelled"],
  pre_trip: ["in_progress", "cancelled"],
  in_progress: ["completed"],
  completed: ["reconciliation"],
  reconciliation: ["closed"],
  closed: [],
  cancelled: [],
  lost: ["discovery"],
};

export function allowedNextStatuses(from: TripStatus): TripStatus[] {
  return TRANSITIONS[from];
}

/** Facts about the trip the gates depend on; loaded by the trip service. */
export interface TransitionContext {
  commerciallyApproved: boolean;
  hasIssuedQuote: boolean;
  hasAcceptedQuote: boolean;
}

export interface TransitionEvaluation {
  valid: boolean;
  /** Rule violations that an authorised user may override with a recorded reason. */
  blockers: string[];
  reasonRequired: boolean;
  permission: Permission;
}

export function evaluateTransition(from: TripStatus, to: TripStatus, ctx: TransitionContext): TransitionEvaluation {
  const valid = TRANSITIONS[from].includes(to);
  const blockers: string[] = [];
  if (to === "quote_issued" && !ctx.hasIssuedQuote) blockers.push("No quotation has been issued for this trip.");
  if (to === "confirmed") {
    if (!ctx.commerciallyApproved) blockers.push("Commercial approval has not been recorded.");
    if (!ctx.hasAcceptedQuote) blockers.push("No quotation has been accepted by the client.");
  }
  const permission: Permission =
    to === "cancelled" ? "trip.cancel" : to === "confirmed" ? "trip.confirm" : "trip.edit";
  return {
    valid,
    blockers,
    reasonRequired: to === "cancelled" || to === "lost" || blockers.length > 0,
    permission,
  };
}
