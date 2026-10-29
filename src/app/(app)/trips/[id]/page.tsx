import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Copy, Pencil } from "lucide-react";
import { LifecyclePanel } from "@/components/trips/lifecycle-panel";
import { BrandMark, TripStatusBadge } from "@/components/trips/status-badge";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Panel, Section } from "@/components/ui/page-header";
import { TRIP_STATUS_LABEL } from "@/lib/domain/trip-lifecycle";
import { formatDateRange, formatDateTime, formatMoney, nights } from "@/lib/format";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { loadOr404 } from "@/server/load-or-404";
import { listLegalCompanies } from "@/server/services/org";
import { getTrip, tripTransitionOptions } from "@/server/services/trips";
import { approveTripAction, archiveTripAction, duplicateTripAction, transitionTripAction } from "../actions";

export async function generateMetadata({ params }: PageProps<"/trips/[id]">): Promise<Metadata> {
  const actor = await requireActor();
  const t = await getTrip(db, actor, (await params).id).catch(() => null);
  return { title: t ? `${t.trip.reference} ${t.trip.name}` : "Trip" };
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{children}</dd>
    </div>
  );
}

const MODULES: { label: string; phase: number }[] = [
  { label: "Itinerary", phase: 4 },
  { label: "Suppliers & confirmations", phase: 5 },
  { label: "Costing & quotations", phase: 6 },
  { label: "Payments", phase: 6 },
  { label: "Operations & readiness", phase: 7 },
  { label: "Vehicles", phase: 8 },
  { label: "Inventory", phase: 9 },
];

export default async function TripWorkspacePage({ params, searchParams }: PageProps<"/trips/[id]">) {
  const actor = await requireActor();
  const { id } = await params;
  const { saved } = await searchParams;
  const data = await loadOr404(getTrip(db, actor, id));
  const { trip } = data;
  const [options, companies] = await Promise.all([tripTransitionOptions(db, actor, trip), listLegalCompanies(db)]);
  const company = (cid: string | null) => companies.find((c) => c.id === cid);
  const n = nights(trip.startDate, trip.endDate);
  const finished = ["closed", "cancelled", "lost"].includes(trip.status);
  const participating = data.brandRows.filter((b) => b.role === "participating");
  const supplying = data.brandRows.filter((b) => b.role === "supplying");

  return (
    <>
      <header className="mb-8 border-b border-stone-200 pb-6">
        <nav aria-label="Breadcrumb" className="mb-3 text-[12px] text-ink-faint">
          <Link href="/trips" className="hover:text-ink">Trips</Link> <span aria-hidden>/</span> <span className="tabular">{trip.reference}</span>
        </nav>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <TripStatusBadge status={trip.status} />
              {trip.isDemo && <Badge tone="warning">Demonstration data</Badge>}
              {trip.archivedAt && <Badge>Archived</Badge>}
            </div>
            <h1 className="font-display text-3xl leading-tight text-ink md:text-[2.15rem]">{trip.name}</h1>
            <p className="mt-2 text-sm text-ink-muted">
              {formatDateRange(trip.startDate, trip.endDate)}
              {n !== null && ` · ${n} night${n === 1 ? "" : "s"}`}
              {trip.primaryDestination && ` · ${trip.primaryDestination}`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {can(actor, "trip.edit") && !finished && <ButtonLink href={`/trips/${id}/edit`} variant="secondary" size="sm"><Pencil size={14} aria-hidden /> Edit</ButtonLink>}
            {can(actor, "trip.create") && (
              <ConfirmButton
                label={<><Copy size={14} aria-hidden /> Duplicate</>}
                title="Duplicate this trip?"
                body="Creates a new enquiry with the same brief, brands and party size. Dates, status, approvals, quotations, payments and supplier bookings are not copied."
                confirmLabel="Duplicate"
                action={duplicateTripAction.bind(null, id)}
              />
            )}
            {can(actor, "trip.edit") && (
              <ConfirmButton
                label={trip.archivedAt ? "Restore" : "Archive"}
                variant="ghost"
                title={trip.archivedAt ? "Restore this trip?" : "Archive this trip?"}
                body={trip.archivedAt ? "The trip will reappear in lists and the Command Centre." : "Archived trips are hidden from lists and the Command Centre but keep their full history. You can restore them later."}
                confirmLabel={trip.archivedAt ? "Restore" : "Archive"}
                action={archiveTripAction.bind(null, id, !trip.archivedAt)}
              />
            )}
          </div>
        </div>
      </header>

      {saved && <Alert tone="success" className="mb-6">Trip saved.</Alert>}

      <div className="grid gap-10 xl:grid-cols-[1fr_340px]">
        <div className="space-y-10">
          <Panel className="p-6">
            <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <Fact label="Lead guest">{data.leadGuest ? <Link className="hover:underline" href={`/guests/${data.leadGuest.id}`}>{data.leadGuest.firstName} {data.leadGuest.lastName}</Link> : <span className="text-ink-faint">Not set</span>}</Fact>
              <Fact label="Party">{trip.adults} adult{trip.adults === 1 ? "" : "s"}{trip.children ? `, ${trip.children} child${trip.children === 1 ? "" : "ren"}` : ""} · {trip.rooms} room{trip.rooms === 1 ? "" : "s"}</Fact>
              <Fact label="Trip manager">{data.manager?.name ?? <span className="text-warning">Unassigned</span>}</Fact>
              <Fact label="Pipeline estimate"><span className="tabular">{formatMoney(trip.estimatedValue, trip.currency)}</span></Fact>
            </dl>
          </Panel>

          <Section title="Brand & commercial context" description="Responsibilities stay distinct even though the guest experiences one journey.">
            <Panel className="p-6">
              <dl className="grid gap-6 sm:grid-cols-2">
                <Fact label="Primary operating brand"><BrandMark name={data.primaryBrand.name} color={data.primaryBrand.colorAccent} /></Fact>
                <Fact label="Guest-facing brand"><BrandMark name={data.guestFacingBrand.name} color={data.guestFacingBrand.colorAccent} /></Fact>
                <Fact label="Operating company">{company(trip.operatingCompanyId)?.name ?? <span className="text-ink-faint">Not set</span>}</Fact>
                <Fact label="Quoting entity">{company(trip.quotingCompanyId)?.name ?? <span className="text-ink-faint">Not set</span>}</Fact>
                <Fact label="Participating brands">{participating.length ? participating.map((b) => b.name).join(", ") : <span className="text-ink-faint">None</span>}</Fact>
                <Fact label="Supplying brands">{supplying.length ? supplying.map((b) => b.name).join(", ") : <span className="text-ink-faint">None</span>}</Fact>
                <Fact label="Quotation currency">{trip.currency}</Fact>
                <Fact label="Enquiry source">{trip.enquirySource ?? <span className="text-ink-faint">Not recorded</span>}</Fact>
              </dl>
            </Panel>
          </Section>

          <Section title="The brief">
            <Panel className="p-6">
              <dl className="grid gap-6 sm:grid-cols-3">
                <Fact label="Purpose">{trip.purpose ?? "—"}</Fact>
                <Fact label="Occasion">{trip.occasion ?? "—"}</Fact>
                <Fact label="Experience style">{trip.experienceStyle ?? "—"}</Fact>
              </dl>
              {trip.specialRequirements && <p className="mt-6 border-t border-stone-100 pt-4 text-sm whitespace-pre-line">{trip.specialRequirements}</p>}
            </Panel>
          </Section>

          <div className="grid gap-6 md:grid-cols-2">
            <Section title="Internal notes" description="Never shown to guests.">
              <Panel className="min-h-24 p-5 text-sm whitespace-pre-line">{trip.internalNotes ?? <span className="text-ink-faint">No internal notes.</span>}</Panel>
            </Section>
            <Section title="Guest-facing notes">
              <Panel className="min-h-24 p-5 text-sm whitespace-pre-line">{trip.guestNotes ?? <span className="text-ink-faint">No guest-facing notes.</span>}</Panel>
            </Section>
          </div>

          <Section title="Workspace modules" description="Further sections of the trip workspace, delivered in the phases shown.">
            <ul className="flex flex-wrap gap-2">
              {MODULES.map((m) => (
                <li key={m.label} className="rounded-[var(--radius-md)] border border-dashed border-stone-300 px-3 py-1.5 text-[12.5px] text-ink-muted">
                  {m.label} <span className="text-ink-faint">· phase {m.phase}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <aside className="space-y-8">
          <Section title="Lifecycle">
            <Panel className="p-5">
              <p className="mb-4 text-sm">Currently <strong className="font-semibold">{TRIP_STATUS_LABEL[trip.status]}</strong>.</p>
              {trip.archivedAt ? (
                <p className="text-[13px] text-ink-muted">Restore the trip to change its status.</p>
              ) : (
                <LifecyclePanel options={options} version={trip.version} canOverride={can(actor, "trip.override")} action={transitionTripAction.bind(null, id)} />
              )}
            </Panel>
          </Section>

          <Section title="Commercial approval">
            <Panel className="p-5 text-sm">
              {trip.commercialApprovedAt ? (
                <p className="text-success">Approved {formatDateTime(trip.commercialApprovedAt)}</p>
              ) : (
                <>
                  <p className="text-ink-muted">Not yet approved. Approval is required before the trip can be confirmed.</p>
                  {can(actor, "trip.approve") && !finished && (
                    <div className="mt-3">
                      <ConfirmButton
                        label="Record approval"
                        variant="primary"
                        title="Record commercial approval?"
                        body="Confirms that the commercial terms of this trip have been reviewed and approved. This is recorded against your name."
                        confirmLabel="Approve"
                        action={approveTripAction.bind(null, id, trip.version)}
                      />
                    </div>
                  )}
                </>
              )}
            </Panel>
          </Section>

          <Section title="Status history">
            <ol className="space-y-4 border-l border-stone-200 pl-4">
              {data.history.map((h) => (
                <li key={h.id} className="text-[13px]">
                  <p className="text-ink">
                    {h.fromStatus ? `${TRIP_STATUS_LABEL[h.fromStatus]} → ` : ""}
                    <strong className="font-semibold">{TRIP_STATUS_LABEL[h.toStatus]}</strong>
                    {h.overridden && <Badge tone="danger" className="ml-2">Override</Badge>}
                  </p>
                  {h.reason && <p className="mt-0.5 text-ink-muted">“{h.reason}”</p>}
                  {h.overriddenRules && <p className="mt-0.5 text-[12px] text-danger">Rules bypassed: {h.overriddenRules}</p>}
                  <p className="text-[11.5px] text-ink-faint">{h.actorName ?? "System"} · {formatDateTime(h.at)}</p>
                </li>
              ))}
            </ol>
          </Section>
        </aside>
      </div>
    </>
  );
}
