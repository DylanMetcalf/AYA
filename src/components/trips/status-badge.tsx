import { Badge, type Tone } from "@/components/ui/badge";
import { TRIP_STATUS_LABEL, type TripStatus } from "@/lib/domain/trip-lifecycle";

const TONE: Partial<Record<TripStatus, Tone>> = {
  quote_issued: "accent", awaiting_decision: "accent", provisional_hold: "warning",
  confirmed: "accent", pre_trip: "accent", in_progress: "success", completed: "info", reconciliation: "info",
  closed: "neutral", cancelled: "danger", lost: "neutral",
};

export function TripStatusBadge({ status }: { status: TripStatus }) {
  return <Badge tone={TONE[status] ?? "neutral"}>{TRIP_STATUS_LABEL[status]}</Badge>;
}

/** Brand colour comes from brand configuration (brands.color_accent), never hardcoded. */
export function BrandMark({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {name}
    </span>
  );
}
