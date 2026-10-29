import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { LifecyclePanel } from "@/components/trips/lifecycle-panel";
import { BrandMark } from "@/components/trips/status-badge";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Fact, Panel, Section } from "@/components/ui/page-header";
import { TRIP_STATUS_LABEL } from "@/lib/domain/trip-lifecycle";
import { formatDateTime, formatMoney } from "@/lib/format";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { loadOr404 } from "@/server/load-or-404";
import { tripReadiness } from "@/server/services/operations";
import { listLegalCompanies } from "@/server/services/org";
import { getTrip, tripTransitionOptions } from "@/server/services/trips";
import { approveTripAction, transitionTripAction } from "../actions";

export async function generateMetadata({ params }: PageProps<"/trips/[id]">): Promise<Metadata> {
  const actor = await requireActor();
  const t = await getTrip(db, actor, (await params).id).catch(() => null);
  return { title: t ? `${t.trip.reference} ${t.trip.name}` : "Journey" };
}

export default async function JourneyOverviewPage({ params }: PageProps<"/trips/[id]">) {
  const actor = await requireActor();
  const { id } = await params;
  const data = await loadOr404(getTrip(db, actor, id));
  const { trip } = data;
  const [options, companies, readiness] = await Promise.all([tripTransitionOptions(db, actor, trip), listLegalCompanies(db), tripReadiness(db, actor, id)]);
  const company = (cid: string | null) => companies.find((c) => c.id === cid)?.name;
  const finished = ["closed", "cancelled", "lost"].includes(trip.status);
  const participating = data.brandRows.filter((b) => b.role === "participating");
  const supplying = data.brandRows.filter((b) => b.role === "supplying");

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_340px]">
      <div className="space-y-8">
        <Section title="Next actions" description={`${readiness.done} of ${readiness.total} readiness items complete.`} actions={<Link href={`/trips/${id}/operations`} className="flex items-center gap-1 text-[12.5px] text-accent-text hover:underline">Full readiness <ArrowRight size={13} aria-hidden /></Link>}>
          <Panel className="p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={readiness.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Readiness">
                <div className={`h-full rounded-full ${readiness.ready ? "bg-success" : "bg-accent"}`} style={{ width: `${readiness.percent}%` }} />
              </div>
              <span className="text-[13px] font-medium tabular">{readiness.percent}%</span>
              {readiness.ready ? <Badge tone="success">Ready to travel</Badge> : <Badge tone="warning">{readiness.criticalOutstanding.length} critical outstanding</Badge>}
            </div>
            {readiness.criticalOutstanding.length === 0 ? (
              <p className="text-[13px] text-ink-muted">{readiness.ready ? "Every requirement is complete." : "No critical items outstanding; remaining items are routine."}</p>
            ) : (
              <ul className="space-y-2">
                {readiness.criticalOutstanding.slice(0, 6).map((i) => (
                  <li key={i.key} className="flex items-start gap-2 text-[13px]"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden /><span>{i.label}{i.detail && <span className="text-ink-faint"> — {i.detail}</span>}</span></li>
                ))}
                {readiness.criticalOutstanding.length > 6 && <li className="text-[12.5px] text-ink-faint">and {readiness.criticalOutstanding.length - 6} more…</li>}
              </ul>
            )}
          </Panel>
        </Section>

        <Section title="Guest & party">
          <Panel className="p-5">
            <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <Fact label="Lead guest">{data.leadGuest ? <Link className="hover:text-accent-text" href={`/guests/${data.leadGuest.id}`}>{data.leadGuest.firstName} {data.leadGuest.lastName}</Link> : <span className="text-warning">Not set</span>}</Fact>
              <Fact label="Party">{trip.adults} adult{trip.adults === 1 ? "" : "s"}{trip.children ? `, ${trip.children} child${trip.children === 1 ? "" : "ren"}` : ""} · {trip.rooms} room{trip.rooms === 1 ? "" : "s"}</Fact>
              <Fact label="Trip manager">{data.manager?.name ?? <span className="text-warning">Unassigned</span>}</Fact>
              <Fact label="Destination">{trip.primaryDestination ?? "—"}</Fact>
              <Fact label="Occasion">{trip.occasion ?? "—"}</Fact>
              <Fact label="Purpose">{trip.purpose ?? "—"}</Fact>
              <Fact label="Experience style">{trip.experienceStyle ?? "—"}</Fact>
              <Fact label="Pipeline estimate"><span className="tabular">{formatMoney(trip.estimatedValue, trip.currency)}</span></Fact>
            </dl>
            {trip.specialRequirements && <p className="mt-5 border-t border-line pt-4 text-[13px] whitespace-pre-line">{trip.specialRequirements}</p>}
          </Panel>
        </Section>

        <Section title="Brands & responsibilities" description="One master journey; each organisation's role stays explicit.">
          <Panel className="p-5">
            <dl className="grid gap-5 sm:grid-cols-2">
              <Fact label="Primary operating brand"><BrandMark name={data.primaryBrand.name} color={data.primaryBrand.colorAccent} /></Fact>
              <Fact label="Guest-facing brand"><BrandMark name={data.guestFacingBrand.name} color={data.guestFacingBrand.colorAccent} /></Fact>
              <Fact label="Operating company">{company(trip.operatingCompanyId) ?? <span className="text-ink-faint">Not set</span>}</Fact>
              <Fact label="Quoting entity">{company(trip.quotingCompanyId) ?? <span className="text-ink-faint">Not set</span>}</Fact>
              <Fact label="Participating brands">{participating.length ? participating.map((b) => b.name).join(", ") : <span className="text-ink-faint">None</span>}</Fact>
              <Fact label="Supplying brands">{supplying.length ? supplying.map((b) => b.name).join(", ") : <span className="text-ink-faint">None</span>}</Fact>
            </dl>
          </Panel>
        </Section>

        <div className="grid gap-6 md:grid-cols-2">
          <Section title="Internal notes" description="Never shown to guests.">
            <Panel className="min-h-20 p-5 text-[13px] whitespace-pre-line">{trip.internalNotes ?? <span className="text-ink-faint">No internal notes.</span>}</Panel>
          </Section>
          <Section title="Guest-facing notes" description="May appear on proposals.">
            <Panel className="min-h-20 p-5 text-[13px] whitespace-pre-line">{trip.guestNotes ?? <span className="text-ink-faint">No guest-facing notes.</span>}</Panel>
          </Section>
        </div>
      </div>

      <aside className="space-y-8">
        <Section title="Lifecycle">
          <Panel className="p-5">
            <p className="mb-4 text-[13px]">Currently <strong className="font-semibold">{TRIP_STATUS_LABEL[trip.status]}</strong>.</p>
            {trip.archivedAt ? <p className="text-[13px] text-ink-muted">Restore the journey to change its status.</p> : <LifecyclePanel options={options} version={trip.version} canOverride={can(actor, "trip.override")} action={transitionTripAction.bind(null, id)} />}
          </Panel>
        </Section>
        <Section title="Commercial approval">
          <Panel className="p-5 text-[13px]">
            {trip.commercialApprovedAt ? (
              <p className="text-success">Approved {formatDateTime(trip.commercialApprovedAt)}</p>
            ) : (
              <>
                <p className="text-ink-muted">Not yet approved. Approving a quote records approval; it is required before confirmation.</p>
                {can(actor, "trip.approve") && !finished && (
                  <div className="mt-3"><ConfirmButton label="Record approval" variant="primary" title="Record commercial approval?" body="Confirms that the commercial terms of this journey have been reviewed and approved. This is recorded against your name." confirmLabel="Approve" action={approveTripAction.bind(null, id, trip.version)} /></div>
                )}
              </>
            )}
          </Panel>
        </Section>
        <Section title="Status history">
          <ol className="space-y-4 border-l border-line pl-4">
            {data.history.map((h) => (
              <li key={h.id} className="text-[13px]">
                <p>{h.fromStatus ? `${TRIP_STATUS_LABEL[h.fromStatus]} → ` : ""}<strong className="font-semibold">{TRIP_STATUS_LABEL[h.toStatus]}</strong>{h.overridden && <Badge tone="danger" className="ml-2">Override</Badge>}</p>
                {h.reason && <p className="mt-0.5 text-ink-muted">“{h.reason}”</p>}
                {h.overriddenRules && <p className="mt-0.5 text-[12px] text-danger">Rules bypassed: {h.overriddenRules}</p>}
                <p className="text-[11.5px] text-ink-faint">{h.actorName ?? "System"} · {formatDateTime(h.at)}</p>
              </li>
            ))}
          </ol>
        </Section>
      </aside>
    </div>
  );
}
