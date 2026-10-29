import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { BrandMark, TripStatusBadge } from "@/components/trips/status-badge";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { controlClass } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { TRIP_VIEWS, isTripView } from "@/lib/domain/trip-views";
import { formatDateRange, formatMoney } from "@/lib/format";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/current";
import { getBrandContext } from "@/server/brand-context";
import { db } from "@/server/db/client";
import { listBrands, listTrips } from "@/server/services/trips";

export const metadata: Metadata = { title: "Trips" };

export default async function TripsPage({ searchParams }: PageProps<"/trips">) {
  const actor = await requireActor();
  const sp = await searchParams;
  const view = isTripView(sp.view) ? sp.view : "active";
  const q = typeof sp.q === "string" ? sp.q : "";
  const brandSlug = await getBrandContext();
  const brand = brandSlug ? (await listBrands(db)).find((b) => b.slug === brandSlug) : undefined;
  const rows = await listTrips(db, actor, { q, status: TRIP_VIEWS[view].statuses, brandId: brand?.id, includeArchived: sp.archived === "1" });

  return (
    <>
      <PageHeader
        eyebrow="Journeys"
        title="Trips"
        description={brand ? `Trips where ${brand.name} is the primary or guest-facing brand.` : "Every journey from first enquiry to final reconciliation."}
        actions={can(actor, "trip.create") && <ButtonLink href="/trips/new"><Plus size={16} aria-hidden /> New trip</ButtonLink>}
      />

      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Trip views" className="-mx-1 flex gap-1 overflow-x-auto">
          {Object.entries(TRIP_VIEWS).map(([key, v]) => (
            <Link
              key={key}
              href={{ pathname: "/trips", query: { view: key, ...(q ? { q } : {}) } }}
              aria-current={view === key ? "page" : undefined}
              className={cn(
                "rounded-[var(--radius-md)] px-3 py-1.5 text-[13px] whitespace-nowrap",
                view === key ? "bg-forest text-surface" : "text-ink-muted hover:bg-stone-100 hover:text-ink",
              )}
            >
              {v.label}
            </Link>
          ))}
        </nav>
        <form className="flex gap-2" role="search">
          <input type="hidden" name="view" value={view} />
          <label htmlFor="trip-q" className="sr-only">Search trips</label>
          <input id="trip-q" name="q" defaultValue={q} placeholder="Name, reference or destination" className={cn(controlClass, "h-9 w-64 py-1")} />
          <button className={buttonClass("secondary", "md", "h-9")}>Search</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={q ? "No trips match your search" : `No trips in “${TRIP_VIEWS[view].label}”`}
          action={can(actor, "trip.create") && !q && <ButtonLink href="/trips/new" variant="secondary">Create a trip</ButtonLink>}
        >
          {brand && "The brand view in the header may be filtering results."}
        </EmptyState>
      ) : (
        <Table>
          <caption className="sr-only">Trips — {TRIP_VIEWS[view].label}</caption>
          <thead>
            <tr>
              <Th>Reference</Th>
              <Th>Trip</Th>
              <Th>Brand</Th>
              <Th>Travel dates</Th>
              <Th className="text-right">Party</Th>
              <Th>Manager</Th>
              <Th>Status</Th>
              <Th className="text-right">Estimate</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="hover:bg-stone-50">
                <Td className="text-[12.5px] whitespace-nowrap text-ink-muted tabular">{t.reference}</Td>
                <Td>
                  <Link href={`/trips/${t.id}`} className="font-medium text-ink hover:underline">{t.name}</Link>
                  <p className="text-[12px] text-ink-faint">
                    {[t.leadGuestName, t.primaryDestination].filter(Boolean).join(" · ") || "No lead guest yet"}
                    {t.isDemo && <Badge tone="warning" className="ml-2">Demo</Badge>}
                  </p>
                </Td>
                <Td><BrandMark name={t.brandName} color={t.brandColor} /></Td>
                <Td className="text-[13px] whitespace-nowrap tabular">{formatDateRange(t.startDate, t.endDate)}</Td>
                <Td className="text-right tabular">{t.adults + t.children}</Td>
                <Td className="text-[13px]">{t.managerName ?? <span className="text-warning">Unassigned</span>}</Td>
                <Td><TripStatusBadge status={t.status} /></Td>
                <Td className="text-right text-[13px] whitespace-nowrap text-ink-muted tabular">{formatMoney(t.estimatedValue, t.currency)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="mt-3 text-[12px] text-ink-faint">
        {rows.length} trip{rows.length === 1 ? "" : "s"}. Estimates are trip managers&apos; pipeline figures, not quoted prices.{" "}
        {sp.archived === "1" ? <Link className="underline" href={{ pathname: "/trips", query: { view } }}>Hide archived</Link> : <Link className="underline" href={{ pathname: "/trips", query: { view, archived: "1" } }}>Include archived</Link>}
      </p>
    </>
  );
}
