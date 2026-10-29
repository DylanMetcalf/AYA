import type { Metadata } from "next";
import { TripForm } from "@/components/trips/trip-form";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { requireActor } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { getTrip } from "@/server/services/trips";
import { loadOr404 } from "@/server/load-or-404";
import { updateTripAction } from "../../actions";
import { tripFormOptions, tripToFormValues } from "../../form-options";

export const metadata: Metadata = { title: "Edit trip" };

export default async function EditTripPage({ params, searchParams }: PageProps<"/trips/[id]/edit">) {
  const actor = await requireActor();
  const { id } = await params;
  const { duplicated } = await searchParams;
  const [data, o] = await Promise.all([loadOr404(getTrip(db, actor, id)), tripFormOptions(actor)]);
  return (
    <>
      <PageHeader eyebrow={data.trip.reference} title={`Edit ${data.trip.name}`} />
      {duplicated && (
        <Alert tone="info" className="mb-6" title="Trip duplicated as a new enquiry">
          Dates, status, approvals, quotations, payments and supplier bookings were not copied. Set the new travel dates below.
        </Alert>
      )}
      <TripForm
        action={updateTripAction.bind(null, id, data.trip.version)}
        initial={tripToFormValues(data.trip, data.brandRows)}
        brands={o.brands}
        companies={o.companies}
        users={o.users}
        guests={o.guests}
        submitLabel="Save changes"
        cancelHref={`/trips/${id}`}
      />
    </>
  );
}
