"use client";

import { startTransition, useActionState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import type { ActionState } from "@/server/action-result";

type Opt = { value: string; label: string };
type Action = (p: ActionState, fd: FormData) => Promise<ActionState>;

function Shell({ action, children, submitLabel }: { action: Action; children: (e: Record<string, string[]>) => ReactNode; submitLabel: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form noValidate className="grid max-w-3xl gap-4 sm:grid-cols-2" onSubmit={(ev) => { ev.preventDefault(); const fd = new FormData(ev.currentTarget); startTransition(() => formAction(fd)); }}>
      {state?.message && <Alert tone="danger" className="sm:col-span-2">{state.message}</Alert>}
      {children(state?.fieldErrors ?? {})}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
        <ButtonLink href="/settings" variant="ghost">Cancel</ButtonLink>
      </div>
    </form>
  );
}

export interface BrandValues { name: string; kind: string; legalCompanyId: string; tagline: string; description: string; colorPrimary: string; colorSecondary: string; colorAccent: string; contactEmail: string; contactPhone: string; website: string; documentFooter: string; isProvisional: boolean }

export function BrandForm({ action, v, companies }: { action: Action; v: BrandValues; companies: Opt[] }) {
  return (
    <Shell action={action} submitLabel="Save brand">
      {(e) => (
        <>
          <TextField label="Name" name="name" defaultValue={v.name} required error={e.name} />
          <SelectField label="Kind" name="kind" defaultValue={v.kind} error={e.kind} options={[{ value: "operating", label: "Operating brand" }, { value: "trading", label: "Trading brand" }, { value: "partner", label: "Connected partner brand" }]} />
          <SelectField label="Legal company" name="legalCompanyId" defaultValue={v.legalCompanyId} placeholder="Not set" options={companies} error={e.legalCompanyId} fieldClassName="sm:col-span-2" />
          <TextField label="Tagline" name="tagline" defaultValue={v.tagline} error={e.tagline} fieldClassName="sm:col-span-2" />
          <TextAreaField label="Description" name="description" defaultValue={v.description} error={e.description} fieldClassName="sm:col-span-2" />
          <div className="grid grid-cols-3 gap-4 sm:col-span-2">
            <TextField label="Primary colour" name="colorPrimary" defaultValue={v.colorPrimary} error={e.colorPrimary} />
            <TextField label="Secondary colour" name="colorSecondary" defaultValue={v.colorSecondary} error={e.colorSecondary} />
            <TextField label="Accent colour" name="colorAccent" defaultValue={v.colorAccent} error={e.colorAccent} />
          </div>
          <TextField label="Contact email" name="contactEmail" type="email" defaultValue={v.contactEmail} error={e.contactEmail} />
          <TextField label="Contact phone" name="contactPhone" defaultValue={v.contactPhone} error={e.contactPhone} />
          <TextField label="Website" name="website" defaultValue={v.website} error={e.website} fieldClassName="sm:col-span-2" />
          <TextAreaField label="Document footer" name="documentFooter" defaultValue={v.documentFooter} error={e.documentFooter} fieldClassName="sm:col-span-2" hint="Shown on this brand's quotations and itineraries." />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="isProvisional" defaultChecked={v.isProvisional} className="h-4 w-4 accent-accent" />
            Identity is provisional (official brand guidelines not yet supplied)
          </label>
        </>
      )}
    </Shell>
  );
}

export interface CompanyValues { name: string; registrationNumber: string; vatNumber: string; country: string; address: string; baseCurrency: string; groupRole: string; verified: boolean; notes: string }

export function CompanyForm({ action, v }: { action: Action; v: CompanyValues }) {
  return (
    <Shell action={action} submitLabel="Save company">
      {(e) => (
        <>
          <TextField label="Registered name" name="name" defaultValue={v.name} required error={e.name} fieldClassName="sm:col-span-2" />
          <TextField label="Registration number" name="registrationNumber" defaultValue={v.registrationNumber} error={e.registrationNumber} />
          <TextField label="VAT number" name="vatNumber" defaultValue={v.vatNumber} error={e.vatNumber} />
          <TextField label="Country" name="country" maxLength={2} defaultValue={v.country} error={e.country} />
          <SelectField label="Base currency" name="baseCurrency" defaultValue={v.baseCurrency} options={["ZAR", "USD", "EUR", "GBP"].map((c) => ({ value: c, label: c }))} />
          <SelectField label="Relationship to the group" name="groupRole" defaultValue={v.groupRole} fieldClassName="sm:col-span-2" options={[
            { value: "central_operator", label: "Central operating company" }, { value: "group_company", label: "Group company" },
            { value: "connected_partner", label: "Connected partner (separate business)" }, { value: "supplier", label: "Supplier" }, { value: "other", label: "Other" }]} />
          <TextAreaField label="Address" name="address" rows={3} defaultValue={v.address} error={e.address} fieldClassName="sm:col-span-2" />
          <TextAreaField label="Notes" name="notes" rows={3} defaultValue={v.notes} error={e.notes} fieldClassName="sm:col-span-2" />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="verified" defaultChecked={v.verified} className="h-4 w-4 accent-accent" />
            Legal, tax and invoicing details have been verified by the business
          </label>
        </>
      )}
    </Shell>
  );
}
