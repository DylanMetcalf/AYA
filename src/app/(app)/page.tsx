import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { BrandMark, TripStatusBadge } from "@/components/trips/status-badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Panel, Section } from "@/components/ui/page-header";
import { formatDate, formatDateRange, formatDateTime, formatMoney } from "@/lib/format";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/current";
import { getBrandContext } from "@/server/brand-context";
import { db } from "@/server/db/client";
import { getCommandCentre } from "@/server/services/dashboard";

export const metadata: Metadata = { title: "Command Centre" };

type TripRow = Awaited<ReturnType<typeof getCommandCentre>>["upcoming"][number];

function greeting(d: Date) {
  const h = Number(new Intl.DateTimeFormat("en-ZA", { hour: "numeric", hour12: false, timeZone: "Africa/Johannesburg" }).format(d));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Metric({ label, value, href, note }: { label: string; value: number; href: string; note: string }) {
  return (
    <Link href={href} className="group block rounded-[var(--radius-lg)] border border-line bg-surface px-5 py-4 transition-colors hover:border-line-strong">
      <div className="flex items-start justify-between">
        <p className="text-[12px] font-medium text-ink-muted">{label}</p>
        <ArrowUpRight size={14} className="text-line-strong transition-colors group-hover:text-accent" aria-hidden />
      </div>
      <p className="mt-2 font-display text-[2.4rem] leading-none text-ink tabular">{value}</p>
      <p className="mt-2 text-[11.5px] text-ink-faint">{note}</p>
    </Link>
  );
}

function TripLine({ t, meta }: { t: TripRow; meta?: string }) {
  return (
    <li>
      <Link href={`/trips/${t.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-subtle">
        <span className="w-28 shrink-0 text-[12px] whitespace-nowrap text-ink-faint tabular">{t.reference}</span>
        <span className="min-w-40 flex-1 text-sm font-medium text-ink">{t.name}</span>
        <BrandMark name={t.brandName} color={t.brandColor} />
        <span className="w-44 text-[12.5px] text-ink-muted tabular">{meta ?? formatDateRange(t.startDate, t.endDate)}</span>
        <TripStatusBadge status={t.status} />
      </Link>
    </li>
  );
}

export default async function CommandCentrePage() {
  const actor = await requireActor();
  const brand = await getBrandContext();
  const data = await getCommandCentre(db, actor, brand);
  const now = new Date();
  const { attention } = data;
  const attentionCount = attention.departingUnconfirmed.length + attention.unassigned.length + attention.confirmedWithoutApproval.length;

  return (
    <>
      <PageHeader
        eyebrow={new Intl.DateTimeFormat("en-ZA", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Johannesburg" }).format(now)}
        title={`${greeting(now)}, ${actor.name.split(" ")[0]}`}
        description={brand ? "Showing trips for the selected brand. Change the brand view in the header." : "Live overview across all brands."}
        actions={can(actor, "trip.create") && <ButtonLink href="/trips/new"><Plus size={16} aria-hidden /> New trip</ButtonLink>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Active trips" value={data.counts.activeTrips} href="/trips?view=active" note="Enquiry through reconciliation" />
        <Metric label="Awaiting quotation" value={data.counts.awaitingQuote} href="/trips?view=awaiting_quote" note="Itinerary, costing or review" />
        <Metric label="Awaiting client" value={data.counts.awaitingDecision} href="/trips?view=awaiting_decision" note="Quote issued or held" />
        <Metric label="Confirmed & operating" value={data.counts.operating} href="/trips?view=operations" note="Confirmed, preparing or travelling" />
      </div>

      <div className="mt-10 grid gap-10 xl:grid-cols-[1fr_340px]">
        <div className="space-y-10">
          <Section title="Needs attention" description="Issues that require a decision or an owner.">
            {attentionCount === 0 ? (
              <EmptyState title="Nothing needs intervention">No unconfirmed near-term departures, unassigned trips or unapproved confirmations.</EmptyState>
            ) : (
              <Panel className="divide-y divide-muted">
                {attention.confirmedWithoutApproval.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-danger">Confirmed without commercial approval (override)</p>
                    <ul>{attention.confirmedWithoutApproval.map((t) => <TripLine key={t.id} t={t} />)}</ul>
                  </div>
                )}
                {attention.departingUnconfirmed.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-warning">Departing within 30 days, not confirmed</p>
                    <ul>{attention.departingUnconfirmed.map((t) => <TripLine key={t.id} t={t} meta={`Departs ${formatDate(t.startDate)}`} />)}</ul>
                  </div>
                )}
                {attention.unassigned.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-info">No responsible trip manager</p>
                    <ul>{attention.unassigned.map((t) => <TripLine key={t.id} t={t} />)}</ul>
                  </div>
                )}
              </Panel>
            )}
          </Section>

          <Section title="Upcoming journeys" description="Confirmed or awaiting decision, travelling within 90 days.">
            {data.upcoming.length === 0 ? (
              <EmptyState title="No journeys in the next 90 days" />
            ) : (
              <Panel>
                <ul className="divide-y divide-muted">{data.upcoming.map((t) => <TripLine key={t.id} t={t} />)}</ul>
              </Panel>
            )}
          </Section>
        </div>

        <aside className="space-y-10">
          <Section title="Sales pipeline" description="Sum of trip managers' estimates on open opportunities — not quoted or confirmed values.">
            {data.pipeline.length === 0 ? (
              <p className="text-sm text-ink-muted">No estimates recorded on open trips.</p>
            ) : (
              <Panel className="divide-y divide-muted">
                {data.pipeline.map((p) => (
                  <div key={p.currency} className="flex items-baseline justify-between px-4 py-3">
                    <span className="text-[12px] text-ink-muted">{p.n} trip{p.n === 1 ? "" : "s"}</span>
                    <span className="font-display text-xl text-ink tabular">{formatMoney(p.total, p.currency)}</span>
                  </div>
                ))}
              </Panel>
            )}
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">
              Sales, gross profit, margins and balances appear once quotations and payments are recorded (financial engine, phase 6).
            </p>
          </Section>

          {data.recentActivity.length > 0 && (
            <Section title="Recent activity">
              <ol className="space-y-3 border-l border-line pl-4">
                {data.recentActivity.map((a) => (
                  <li key={a.id} className="text-[13px]">
                    {a.entityType === "trip" ? (
                      <Link href={`/trips/${a.entityId}`} className="text-ink hover:underline">{a.summary}</Link>
                    ) : (
                      <span className="text-ink">{a.summary}</span>
                    )}
                    <p className="text-[11.5px] text-ink-faint">{a.actorName ?? "System"} · {formatDateTime(a.at)}</p>
                  </li>
                ))}
              </ol>
            </Section>
          )}
        </aside>
      </div>
    </>
  );
}
