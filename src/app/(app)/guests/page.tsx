import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { controlClass } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { loadOr404 } from "@/server/load-or-404";
import { listGuests } from "@/server/services/guests";

export const metadata: Metadata = { title: "Guests & Relationships" };

export default async function GuestsPage({ searchParams }: PageProps<"/guests">) {
  const actor = await requireActor();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const rows = await loadOr404(listGuests(db, actor, query));
  return (
    <>
      <PageHeader eyebrow="Journeys" title="Guests & Relationships" description="Guests, lead contacts and their journeys with us." actions={can(actor, "guest.edit") && <ButtonLink href="/guests/new"><Plus size={16} aria-hidden /> New guest</ButtonLink>} />
      <form className="mb-5 flex gap-2" role="search">
        <label htmlFor="guest-q" className="sr-only">Search guests</label>
        <input id="guest-q" name="q" defaultValue={query} placeholder="Name or email" className={`${controlClass} h-9 w-72 py-1`} />
        <button className={buttonClass("secondary", "md", "h-9")}>Search</button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title={query ? "No guests match your search" : "No guests yet"} action={can(actor, "guest.edit") && !query && <ButtonLink href="/guests/new" variant="secondary">Add the first guest</ButtonLink>} />
      ) : (
        <Table>
          <thead><tr><Th>Name</Th><Th>Email</Th><Th>Phone</Th><Th>Nationality</Th><Th className="text-right">Trips as lead</Th></tr></thead>
          <tbody>
            {rows.map((g) => (
              <tr key={g.id} className="hover:bg-stone-50">
                <Td><Link href={`/guests/${g.id}`} className="font-medium hover:underline">{g.lastName}, {g.firstName}</Link>{g.isDemo && <Badge tone="warning" className="ml-2">Demo</Badge>}</Td>
                <Td className="text-[13px]">{g.email ?? "—"}</Td>
                <Td className="text-[13px]">{g.phone ?? "—"}</Td>
                <Td className="text-[13px]">{g.nationality ?? "—"}</Td>
                <Td className="text-right tabular">{g.tripCount}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
