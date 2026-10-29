import type { Metadata } from "next";
import Link from "next/link";
import { TripStatusBadge } from "@/components/trips/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Panel, Section } from "@/components/ui/page-header";
import { formatDateRange } from "@/lib/format";
import { requireActor } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { globalSearch } from "@/server/services/search";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const actor = await requireActor();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const r = query.length >= 2 ? await globalSearch(db, actor, query) : null;
  const total = r ? r.trips.length + r.guests.length + r.suppliers.length : 0;
  return (
    <>
      <PageHeader eyebrow="Search" title={query ? `Results for “${query}”` : "Search"} description="Results include only records you are permitted to see." />
      {!r ? <EmptyState title="Type at least two characters in the search bar" /> : total === 0 ? <EmptyState title="No matching records" /> : (
        <div className="space-y-8">
          {r.trips.length > 0 && <Section title="Trips"><Panel><ul className="divide-y divide-muted">{r.trips.map((t) => (
            <li key={t.id}><Link href={`/trips/${t.id}`} className="flex flex-wrap items-center gap-4 px-4 py-3 hover:bg-subtle"><span className="w-24 text-[12px] text-ink-faint tabular">{t.reference}</span><span className="flex-1 text-sm font-medium">{t.name}</span><span className="text-[12.5px] text-ink-muted">{formatDateRange(t.startDate, t.endDate)}</span><TripStatusBadge status={t.status} /></Link></li>))}</ul></Panel></Section>}
          {r.guests.length > 0 && <Section title="Guests"><Panel><ul className="divide-y divide-muted">{r.guests.map((g) => (
            <li key={g.id}><Link href={`/guests/${g.id}`} className="block px-4 py-3 text-sm hover:bg-subtle"><span className="font-medium">{g.firstName} {g.lastName}</span> <span className="text-ink-faint">{g.email}</span></Link></li>))}</ul></Panel></Section>}
          {r.suppliers.length > 0 && <Section title="Suppliers"><Panel><ul className="divide-y divide-muted">{r.suppliers.map((s) => (
            <li key={s.id} className="px-4 py-3 text-sm"><span className="font-medium">{s.name}</span> <span className="text-ink-faint">{s.category.replaceAll("_", " ")} · {s.region ?? "No region"}</span></li>))}</ul></Panel>
            <p className="mt-2 text-[12px] text-ink-faint">Supplier records open in the Suppliers module (phase 5).</p></Section>}
        </div>
      )}
    </>
  );
}
