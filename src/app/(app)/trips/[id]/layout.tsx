import { Copy, Pencil } from "lucide-react";
import { BrandMark, TripStatusBadge } from "@/components/trips/status-badge";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { PageHeader } from "@/components/ui/page-header";
import { RouteTabs } from "@/components/ui/route-tabs";
import { formatDateRange, nights } from "@/lib/format";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { loadOr404 } from "@/server/load-or-404";
import { getTrip } from "@/server/services/trips";
import { archiveTripAction, duplicateTripAction } from "../actions";

export default async function JourneyLayout({ children, params }: LayoutProps<"/trips/[id]">) {
  const actor = await requireActor();
  const { id } = await params;
  const { trip, primaryBrand, guestFacingBrand, brandRows } = await loadOr404(getTrip(db, actor, id));
  const n = nights(trip.startDate, trip.endDate);
  const finished = ["closed", "cancelled", "lost"].includes(trip.status);
  const base = `/trips/${id}`;
  const tabs = [
    { label: "Overview", href: base, exact: true },
    { label: "Trip Studio", href: `${base}/studio` },
    ...(can(actor, "finance.read_costs") ? [{ label: "Costing & Quotes", href: `${base}/commercial` }] : []),
    { label: "Operations", href: `${base}/operations` },
    { label: "Run sheet", href: `${base}/run-sheet` },
  ];
  const participants = brandRows.filter((b) => b.brandId !== primaryBrand.id);
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Journeys", href: "/trips" }, { label: trip.reference }]}
        title={trip.name}
        meta={
          <>
            <TripStatusBadge status={trip.status} />
            <span className="tabular">{formatDateRange(trip.startDate, trip.endDate)}{n !== null ? ` · ${n} night${n === 1 ? "" : "s"}` : ""}</span>
            <span>· {trip.adults + trip.children} traveller{trip.adults + trip.children === 1 ? "" : "s"}</span>
            <BrandMark name={primaryBrand.name} color={primaryBrand.colorAccent} />
            {guestFacingBrand.id !== primaryBrand.id && <span className="text-[12px] text-ink-faint">guest-facing {guestFacingBrand.name}</span>}
            {participants.length > 0 && <span className="text-[12px] text-ink-faint">with {[...new Set(participants.map((p) => p.name))].join(", ")}</span>}
            {trip.isDemo && <Badge tone="warning">Demonstration data</Badge>}
            {trip.archivedAt && <Badge>Archived</Badge>}
          </>
        }
        actions={
          <>
            {can(actor, "trip.edit") && !finished && <ButtonLink href={`${base}/edit`} variant="secondary" size="sm"><Pencil size={14} aria-hidden /> Edit details</ButtonLink>}
            {can(actor, "trip.create") && (
              <ConfirmButton label={<><Copy size={14} aria-hidden /> Duplicate</>} title="Duplicate this journey?" body="Creates a new enquiry with the same brief, brands, party size and itinerary outline. Dates, status, approvals, quotes, payments, bookings and vehicle allocations are not copied." confirmLabel="Duplicate" action={duplicateTripAction.bind(null, id)} />
            )}
            {can(actor, "trip.edit") && (
              <ConfirmButton
                label={trip.archivedAt ? "Restore" : "Archive"}
                variant="ghost"
                title={trip.archivedAt ? "Restore this journey?" : "Archive this journey?"}
                body={trip.archivedAt ? "The journey will reappear in lists and the overview." : "Archived journeys are hidden from lists and the overview but keep their full history. You can restore them later."}
                confirmLabel={trip.archivedAt ? "Restore" : "Archive"}
                action={archiveTripAction.bind(null, id, !trip.archivedAt)}
              />
            )}
          </>
        }
      />
      <RouteTabs tabs={tabs} />
      {children}
    </>
  );
}
