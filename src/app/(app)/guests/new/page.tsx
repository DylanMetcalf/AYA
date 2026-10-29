import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuestForm } from "@/components/guests/guest-form";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/current";
import { createGuestAction } from "../actions";

export const metadata: Metadata = { title: "New guest" };

export default async function NewGuestPage() {
  const actor = await requireActor();
  if (!can(actor, "guest.edit")) notFound();
  return (
    <>
      <PageHeader eyebrow="Guests" title="New guest" />
      <GuestForm action={createGuestAction} showSensitive={can(actor, "guest.read_sensitive")} submitLabel="Create guest"
        initial={{ firstName: "", lastName: "", email: "", phone: "", nationality: "", preferences: "", dietary: "", accessibility: "", medicalNotes: "", relationshipNotes: "", marketingConsent: false }} />
    </>
  );
}
