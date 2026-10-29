"use client";

import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { BASIS_OPTIONS, COMPONENT_TYPE_OPTIONS, CURRENCY_OPTIONS, RATE_TYPE_OPTIONS } from "@/lib/options";
import type { ActionState } from "@/server/action-result";

type Action = (p: ActionState, fd: FormData) => Promise<ActionState>;
type Opt = { value: string; label: string };
const g2 = "grid gap-4 sm:grid-cols-2";

export function SupplierForm({ action, v, categories, companies, onDone }: { action: Action; v: Record<string, string>; categories: Opt[]; companies: Opt[]; onDone?: () => void }) {
  return (
    <ActionForm action={action} onSuccess={onDone} className={g2}>
      {({ errors: e, pending }) => (
        <>
          <TextField label="Supplier name" name="name" defaultValue={v.name} required error={e.name} fieldClassName="sm:col-span-2" />
          <SelectField label="Category" name="category" options={categories} defaultValue={v.category} error={e.category} />
          <SelectField label="Default currency" name="defaultCurrency" options={CURRENCY_OPTIONS} defaultValue={v.defaultCurrency ?? "ZAR"} />
          <TextField label="Email" name="email" type="email" defaultValue={v.email} error={e.email} />
          <TextField label="Phone" name="phone" defaultValue={v.phone} error={e.phone} />
          <TextField label="Website" name="website" defaultValue={v.website} error={e.website} />
          <TextField label="Region" name="region" defaultValue={v.region} error={e.region} placeholder="e.g. Greater Kruger" />
          <TextField label="Location / address" name="location" defaultValue={v.location} error={e.location} fieldClassName="sm:col-span-2" />
          <SelectField label="Linked legal company" name="legalCompanyId" options={companies} placeholder="None (independent supplier)" defaultValue={v.legalCompanyId} fieldClassName="sm:col-span-2" hint="Set when the supplier is itself a configured company, e.g. Schmidt Car Hire." />
          <TextAreaField label="Service description" name="description" rows={3} defaultValue={v.description} fieldClassName="sm:col-span-2" />
          <TextAreaField label="Payment terms" name="paymentTerms" rows={2} defaultValue={v.paymentTerms} />
          <TextAreaField label="Cancellation terms" name="cancellationTerms" rows={2} defaultValue={v.cancellationTerms} />
          <SelectField label="Verification" name="verification" defaultValue={v.verification ?? "unverified"} options={[{ value: "unverified", label: "Unverified" }, { value: "verified", label: "Verified by our team" }, { value: "needs_review", label: "Needs review" }]} />
          <div />
          <TextAreaField label="Internal notes" name="internalNotes" rows={2} defaultValue={v.internalNotes} fieldClassName="sm:col-span-2" />
          <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save supplier"}</Button></div>
        </>
      )}
    </ActionForm>
  );
}

export function ContactForm({ action, onDone }: { action: Action; onDone?: () => void }) {
  return (
    <ActionForm action={action} onSuccess={onDone} resetOnSuccess className="space-y-4">
      {({ errors: e, pending }) => (
        <>
          <TextField label="Name" name="name" required error={e.name} />
          <TextField label="Role" name="role" placeholder="Reservations manager" />
          <TextField label="Email" name="email" type="email" error={e.email} />
          <TextField label="Phone" name="phone" />
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="isPrimary" className="h-4 w-4 accent-accent" /> Primary contact (shown on run sheets)</label>
          <Button type="submit" disabled={pending}>Add contact</Button>
        </>
      )}
    </ActionForm>
  );
}

export function ServiceForm({ action, onDone }: { action: Action; onDone?: () => void }) {
  return (
    <ActionForm action={action} onSuccess={onDone} resetOnSuccess className="space-y-4">
      {({ errors: e, pending }) => (
        <>
          <TextField label="Service name" name="name" required error={e.name} placeholder="e.g. Luxury suite, Hoedspruit → lodge flight" />
          <SelectField label="Itinerary segment type" name="componentType" options={COMPONENT_TYPE_OPTIONS} error={e.componentType} hint="Used to suggest this service when building itineraries." />
          <TextAreaField label="Description" name="description" rows={3} />
          <Button type="submit" disabled={pending}>Add service</Button>
        </>
      )}
    </ActionForm>
  );
}

/** Rate entry. Every rate records its source and type; it is used for costing only once approved. */
export function RateForm({ action, v = {}, submitLabel, onDone }: { action: Action; v?: Record<string, string>; submitLabel: string; onDone?: () => void }) {
  return (
    <ActionForm action={action} onSuccess={onDone} className={g2}>
      {({ errors: e, pending }) => (
        <>
          <TextField label="Rate name" name="name" defaultValue={v.name} required error={e.name} fieldClassName="sm:col-span-2" placeholder="High season 2027 — per person sharing" />
          <SelectField label="Currency" name="currency" options={CURRENCY_OPTIONS} defaultValue={v.currency ?? "ZAR"} error={e.currency} />
          <TextField label="Amount" name="amount" inputMode="decimal" defaultValue={v.amount} required error={e.amount} />
          <SelectField label="Rate basis" name="basis" options={BASIS_OPTIONS} defaultValue={v.basis ?? "per_person"} error={e.basis} />
          <TextField label="Minimum charge" name="minimumCharge" inputMode="decimal" defaultValue={v.minimumCharge} error={e.minimumCharge} />
          <TextField label="Valid from" name="validFrom" type="date" defaultValue={v.validFrom} error={e.validFrom} />
          <TextField label="Valid to" name="validTo" type="date" defaultValue={v.validTo} error={e.validTo} />
          <TextField label="Season" name="season" defaultValue={v.season} />
          <TextField label="Minimum nights" name="minimumNights" type="number" min={1} defaultValue={v.minimumNights} error={e.minimumNights} />
          <TextField label="Occupancy" name="occupancyNote" defaultValue={v.occupancyNote} fieldClassName="sm:col-span-2" placeholder="Based on two adults sharing" />
          <TextAreaField label="Inclusions" name="inclusions" rows={2} defaultValue={v.inclusions} />
          <TextAreaField label="Exclusions" name="exclusions" rows={2} defaultValue={v.exclusions} />
          <SelectField label="Rate type" name="type" options={RATE_TYPE_OPTIONS} defaultValue={v.type ?? "supplier_provided"} error={e.type} />
          <TextField label="Date obtained" name="obtainedOn" type="date" defaultValue={v.obtainedOn} />
          <TextField label="Source" name="source" defaultValue={v.source} required error={e.source} fieldClassName="sm:col-span-2" hint="Where this figure came from, e.g. “2027 trade rate sheet (PDF) from reservations”." />
          <TextAreaField label="Internal notes" name="internalNotes" rows={2} defaultValue={v.internalNotes} fieldClassName="sm:col-span-2" />
          <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? "Submitting…" : submitLabel}</Button></div>
        </>
      )}
    </ActionForm>
  );
}
