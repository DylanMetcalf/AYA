"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { SUPPORTED_CURRENCIES } from "@/lib/validation/trip";
import type { ActionState } from "@/server/action-result";

type Opt = { value: string; label: string };
export interface TripFormValues {
  name: string;
  primaryBrandId: string;
  guestFacingBrandId: string;
  operatingCompanyId: string;
  quotingCompanyId: string;
  managerId: string;
  leadGuestId: string;
  startDate: string;
  endDate: string;
  adults: number;
  children: number;
  rooms: number;
  primaryDestination: string;
  purpose: string;
  occasion: string;
  experienceStyle: string;
  enquirySource: string;
  currency: string;
  estimatedValue: string;
  internalNotes: string;
  guestNotes: string;
  specialRequirements: string;
  participatingBrandIds: string[];
  supplyingBrandIds: string[];
}

function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-x-10 gap-y-4 border-t border-line py-8 first:border-t-0 first:pt-0 lg:grid-cols-[240px_1fr]">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden>
        <p className="text-[15px] font-semibold text-ink">{title}</p>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{description}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function TripForm({
  action,
  initial,
  brands,
  companies,
  users,
  guests,
  submitLabel,
  cancelHref,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  initial: TripFormValues;
  brands: Opt[];
  companies: Opt[];
  users: Opt[];
  guests: Opt[];
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [dirty, setDirty] = useState(false);
  const submitting = useRef(false);
  const e = state?.fieldErrors ?? {};

  useEffect(() => {
    const warn = (ev: BeforeUnloadEvent) => {
      if (dirty && !submitting.current) ev.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (state && !state.ok) submitting.current = false;
  }, [state]);

  return (
    <form
      action={formAction}
      onChange={() => setDirty(true)}
      onSubmit={(ev) => {
        // Submit via a transition so React does not reset the fields when validation fails.
        ev.preventDefault();
        submitting.current = true;
        const fd = new FormData(ev.currentTarget);
        startTransition(() => formAction(fd));
      }}
      className="max-w-5xl"
      noValidate
    >
      {state?.message && !state.ok && <Alert tone="danger" className="mb-6">{state.message}</Alert>}

      <FormSection title="The journey" description="What the guest will experience and when.">
        <TextField label="Trip name" name="name" defaultValue={initial.name} required error={e.name} fieldClassName="sm:col-span-2" placeholder="e.g. Panorama Route & Lowveld Safari" />
        <TextField label="Departure" name="startDate" type="date" defaultValue={initial.startDate} error={e.startDate} />
        <TextField label="Return" name="endDate" type="date" defaultValue={initial.endDate} error={e.endDate} />
        <TextField label="Primary destination" name="primaryDestination" defaultValue={initial.primaryDestination} error={e.primaryDestination} fieldClassName="sm:col-span-2" placeholder="e.g. Hoedspruit & Greater Kruger" />
        <div className="grid grid-cols-3 gap-4 sm:col-span-2">
          <TextField label="Adults" name="adults" type="number" min={0} defaultValue={initial.adults} error={e.adults} />
          <TextField label="Children" name="children" type="number" min={0} defaultValue={initial.children} error={e.children} />
          <TextField label="Rooms" name="rooms" type="number" min={0} defaultValue={initial.rooms} error={e.rooms} />
        </div>
      </FormSection>

      <FormSection title="Brand & commercial context" description="Who operates, who the guest sees, and who participates. Responsibilities stay separate even when the guest experiences one journey.">
        <SelectField label="Primary operating brand" name="primaryBrandId" options={brands} defaultValue={initial.primaryBrandId} required error={e.primaryBrandId} />
        <SelectField label="Guest-facing brand" name="guestFacingBrandId" options={brands} defaultValue={initial.guestFacingBrandId} required error={e.guestFacingBrandId} />
        <SelectField label="Operating company" name="operatingCompanyId" options={companies} placeholder="Not set" defaultValue={initial.operatingCompanyId} error={e.operatingCompanyId} />
        <SelectField label="Quoting entity" name="quotingCompanyId" options={companies} placeholder="Not set" defaultValue={initial.quotingCompanyId} error={e.quotingCompanyId} />
        <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
          {(["participatingBrandIds", "supplyingBrandIds"] as const).map((field) => (
            <fieldset key={field} className="rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3">
              <legend className="px-1 text-[13px] font-medium text-ink">{field === "participatingBrandIds" ? "Participating brands" : "Supplying brands"}</legend>
              <p className="mb-2 text-xs text-ink-faint">{field === "participatingBrandIds" ? "e.g. AYA for a safari extension" : "e.g. Schmidt Car Hire supplying vehicles"}</p>
              {brands.map((b) => (
                <label key={b.value} className="flex items-center gap-2 py-1 text-sm">
                  <input type="checkbox" name={field} value={b.value} defaultChecked={initial[field].includes(b.value)} className="h-4 w-4 accent-accent" />
                  {b.label}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        <SelectField label="Quotation currency" name="currency" options={SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: c }))} defaultValue={initial.currency} error={e.currency} />
        <TextField label="Estimated value" name="estimatedValue" inputMode="decimal" defaultValue={initial.estimatedValue} error={e.estimatedValue} hint="Pipeline estimate only — never used as a quoted price." />
      </FormSection>

      <FormSection title="Client & team">
        <SelectField label="Lead guest" name="leadGuestId" options={guests} placeholder={guests.length ? "Select a guest" : "No guests yet — add one under Guests"} defaultValue={initial.leadGuestId} error={e.leadGuestId} />
        <SelectField label="Trip manager" name="managerId" options={users} placeholder="Me (default)" defaultValue={initial.managerId} error={e.managerId} />
        <TextField label="Enquiry source" name="enquirySource" defaultValue={initial.enquirySource} error={e.enquirySource} placeholder="Referral, returning guest, partner…" />
      </FormSection>

      <FormSection title="The brief">
        <TextField label="Purpose" name="purpose" defaultValue={initial.purpose} error={e.purpose} />
        <TextField label="Occasion" name="occasion" defaultValue={initial.occasion} error={e.occasion} placeholder="Anniversary, milestone birthday…" />
        <TextField label="Preferred experience style" name="experienceStyle" defaultValue={initial.experienceStyle} error={e.experienceStyle} fieldClassName="sm:col-span-2" />
        <TextAreaField label="Special requirements" name="specialRequirements" defaultValue={initial.specialRequirements} error={e.specialRequirements} fieldClassName="sm:col-span-2" hint="Operational requirements. Dietary and medical details belong on the guest record, where access is restricted." />
      </FormSection>

      <FormSection title="Notes" description="Internal notes never appear on guest-facing documents.">
        <TextAreaField label="Internal notes" name="internalNotes" defaultValue={initial.internalNotes} error={e.internalNotes} />
        <TextAreaField label="Guest-facing notes" name="guestNotes" defaultValue={initial.guestNotes} error={e.guestNotes} />
      </FormSection>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-end gap-3 border-t border-line bg-canvas/95 px-4 py-4 backdrop-blur md:-mx-8 md:px-8">
        {dirty && <span className="mr-auto text-[12px] text-ink-faint" role="status">Unsaved changes</span>}
        <ButtonLink href={cancelHref} variant="ghost">Cancel</ButtonLink>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}
