import type { Metadata } from "next";
import { TripForm } from "@/components/trips/trip-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireActor } from "@/server/auth/current";
import { notFound } from "next/navigation";
import { can } from "@/server/auth/actor";
import { createTripAction } from "../actions";
import { tripFormOptions } from "../form-options";

export const metadata: Metadata = { title: "New trip" };

export default async function NewTripPage() {
  const actor = await requireActor();
  if (!can(actor, "trip.create")) notFound();
  const o = await tripFormOptions(actor);
  const ultima = o.brandRows.find((b) => b.kind === "operating") ?? o.brandRows[0];
  return (
    <>
      <PageHeader eyebrow="Trips" title="New trip" description="Capture the enquiry now; you can save an incomplete brief and return to it at any time." />
      <TripForm
        action={createTripAction}
        brands={o.brands}
        companies={o.companies}
        users={o.users}
        guests={o.guests}
        submitLabel="Create trip"
        cancelHref="/trips"
        initial={{
          name: "", primaryBrandId: ultima?.id ?? "", guestFacingBrandId: ultima?.id ?? "",
          operatingCompanyId: ultima?.legalCompanyId ?? "", quotingCompanyId: ultima?.legalCompanyId ?? "",
          managerId: actor.id, leadGuestId: "", startDate: "", endDate: "", adults: 2, children: 0, rooms: 1,
          primaryDestination: "", purpose: "", occasion: "", experienceStyle: "", enquirySource: "", currency: "ZAR",
          estimatedValue: "", internalNotes: "", guestNotes: "", specialRequirements: "", participatingBrandIds: [], supplyingBrandIds: [],
        }}
      />
    </>
  );
}
