import type { Metadata } from "next";
import Link from "next/link";
import { GuestForm } from "@/components/guests/guest-form";
import { TripStatusBadge } from "@/components/trips/status-badge";
import { Alert } from "@/components/ui/alert";
import { Panel, PageHeader, Section } from "@/components/ui/page-header";
import { formatDateRange } from "@/lib/format";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { loadOr404 } from "@/server/load-or-404";
import { getGuest } from "@/server/services/guests";
import { updateGuestAction } from "../actions";

export const metadata: Metadata = { title: "Guest" };

export default async function GuestPage({ params, searchParams }: PageProps<"/guests/[id]">) {
  const actor = await requireActor();
  const { id } = await params;
  const { saved } = await searchParams;
  const { guest: g, trips } = await loadOr404(getGuest(db, actor, id));
  const v = (x: string | null) => x ?? "";
  return (
    <>
      <PageHeader eyebrow="Guest" title={`${g.firstName} ${g.lastName}`} description={[g.email, g.phone].filter(Boolean).join(" · ") || undefined} />
      {saved && <Alert tone="success" className="mb-6">Guest saved.</Alert>}
      <div className="grid gap-10 xl:grid-cols-[1fr_360px]">
        <Section title="Details">
          {can(actor, "guest.edit") ? (
            <GuestForm action={updateGuestAction.bind(null, id)} showSensitive={!g.sensitiveRedacted} submitLabel="Save guest"
              initial={{ firstName: g.firstName, lastName: g.lastName, email: v(g.email), phone: v(g.phone), nationality: v(g.nationality), preferences: v(g.preferences), dietary: v(g.dietary), accessibility: v(g.accessibility), medicalNotes: v(g.medicalNotes), relationshipNotes: v(g.relationshipNotes), marketingConsent: g.marketingConsent }} />
          ) : (
            <Panel className="p-5 text-sm whitespace-pre-line">{g.preferences ?? "No recorded preferences."}</Panel>
          )}
        </Section>
        <Section title="Journeys as lead guest">
          {trips.length === 0 ? <p className="text-sm text-ink-muted">No trips yet.</p> : (
            <Panel><ul className="divide-y divide-stone-100">
              {trips.map((t) => (
                <li key={t.id}><Link href={`/trips/${t.id}`} className="block px-4 py-3 hover:bg-stone-50">
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="mt-1 flex items-center gap-2 text-[12px] text-ink-faint"><span className="tabular">{t.reference}</span> · {formatDateRange(t.startDate, t.endDate)} <TripStatusBadge status={t.status} /></p>
                </Link></li>
              ))}
            </ul></Panel>
          )}
        </Section>
      </div>
    </>
  );
}
