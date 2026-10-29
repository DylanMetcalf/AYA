"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/field";
import { COMPONENT_TYPES, type ComponentType } from "@/lib/domain/components";
import { BASIS_OPTIONS, COMPONENT_TYPE_OPTIONS, CURRENCY_OPTIONS } from "@/lib/options";
import type { ActionState } from "@/server/action-result";

type Opt = { value: string; label: string };
export interface SegmentValues {
  type: ComponentType;
  title: string;
  startTime: string;
  endTime: string;
  startLocation: string;
  endLocation: string;
  operatingBrandId: string;
  guestFacingBrandId: string;
  providerCompanyId: string;
  supplierId: string;
  leadUserId: string;
  guestDescription: string;
  internalNotes: string;
  details: Record<string, string>;
  includedInQuote: boolean;
  costCurrency: string;
  unitCost: string;
  quantity: string;
  costBasis: string;
  minimumCharge: string;
  actualCost: string;
  supplierPaymentDue: string;
}

export const emptySegment = (type: ComponentType = "activity"): SegmentValues => ({
  type, title: "", startTime: "", endTime: "", startLocation: "", endLocation: "", operatingBrandId: "", guestFacingBrandId: "", providerCompanyId: "",
  supplierId: "", leadUserId: "", guestDescription: "", internalNotes: "", details: {}, includedInQuote: true, costCurrency: "ZAR", unitCost: "", quantity: "1",
  costBasis: COMPONENT_TYPES[type].basis, minimumCharge: "", actualCost: "", supplierPaymentDue: "",
});

function Group({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <fieldset className="grid gap-4 border-t border-line pt-5 first:border-t-0 first:pt-0 sm:grid-cols-2">
      <legend className="mb-1 text-[12px] font-semibold tracking-wide text-ink-muted uppercase sm:col-span-2">{title}</legend>
      {hint && <p className="-mt-2 text-[12px] text-ink-faint sm:col-span-2">{hint}</p>}
      {children}
    </fieldset>
  );
}

export function SegmentForm({
  action, v, brands, companies, suppliers, users, showCosts, submitLabel, onDone, costSourceNote,
}: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  v: SegmentValues;
  brands: Opt[];
  companies: Opt[];
  suppliers: Opt[];
  users: Opt[];
  showCosts: boolean;
  submitLabel: string;
  onDone?: () => void;
  costSourceNote?: string;
}) {
  const [type, setType] = useState<ComponentType>(v.type);
  const def = COMPONENT_TYPES[type];
  return (
    <ActionForm action={action} onSuccess={onDone} className="space-y-6">
      {({ errors: e, pending }) => (
        <>
          <Group title="Segment">
            <SelectField label="Type" name="type" options={COMPONENT_TYPE_OPTIONS} value={type} onChange={(ev) => setType(ev.target.value as ComponentType)} error={e.type} />
            <TextField label="Title" name="title" defaultValue={v.title} required error={e.title} placeholder={def.label} />
            <TextField label="Start time" name="startTime" type="time" defaultValue={v.startTime} error={e.startTime} />
            <TextField label="End time" name="endTime" type="time" defaultValue={v.endTime} error={e.endTime} />
            <TextField label="From / location" name="startLocation" defaultValue={v.startLocation} />
            <TextField label="To" name="endLocation" defaultValue={v.endLocation} />
            {(def.fields as { key: string; label: string; kind?: "text" | "number" }[]).map((f) => (
              <TextField key={`${type}-${f.key}`} label={f.label} name={`detail.${f.key}`} type={f.kind === "number" ? "number" : "text"} min={f.kind === "number" ? 0 : undefined} defaultValue={v.details[f.key] ?? ""} />
            ))}
          </Group>

          <Group title="Brands & responsibility" hint="Who operates this segment and which brand the guest experiences. Defaults to the journey's brands.">
            <SelectField label="Operating brand" name="operatingBrandId" options={brands} placeholder="Journey's primary brand" defaultValue={v.operatingBrandId} />
            <SelectField label="Guest-facing brand" name="guestFacingBrandId" options={brands} placeholder="Journey's guest-facing brand" defaultValue={v.guestFacingBrandId} />
            <SelectField label="Service provider (company)" name="providerCompanyId" options={companies} placeholder="—" defaultValue={v.providerCompanyId} />
            <SelectField label="Supplier" name="supplierId" options={suppliers} placeholder="—" defaultValue={v.supplierId} />
            <SelectField label="Operational lead" name="leadUserId" options={users} placeholder="Unassigned" defaultValue={v.leadUserId} fieldClassName="sm:col-span-2" />
          </Group>

          <Group title="Descriptions">
            <TextAreaField label="Guest-facing description" name="guestDescription" rows={3} defaultValue={v.guestDescription} fieldClassName="sm:col-span-2" hint="Appears on proposals and itineraries." />
            <TextAreaField label="Internal operational notes" name="internalNotes" rows={2} defaultValue={v.internalNotes} fieldClassName="sm:col-span-2" hint="Never shown to guests." />
          </Group>

          {showCosts && (
            <Group title="Costing" hint={costSourceNote ?? "Enter the supplier's cost, or price from an approved rate after saving. Editing these figures detaches the segment from its rate."}>
              <SelectField label="Cost currency" name="costCurrency" options={CURRENCY_OPTIONS} defaultValue={v.costCurrency} error={e.costCurrency} />
              <SelectField label="Rate basis" name="costBasis" options={BASIS_OPTIONS} defaultValue={v.costBasis || def.basis} />
              <TextField label="Unit cost" name="unitCost" inputMode="decimal" defaultValue={v.unitCost} error={e.unitCost} />
              <TextField label="Quantity" name="quantity" inputMode="decimal" defaultValue={v.quantity} error={e.quantity} />
              <TextField label="Minimum charge" name="minimumCharge" inputMode="decimal" defaultValue={v.minimumCharge} error={e.minimumCharge} />
              <TextField label="Supplier payment due" name="supplierPaymentDue" type="date" defaultValue={v.supplierPaymentDue} />
              <TextField label="Actual cost (after travel)" name="actualCost" inputMode="decimal" defaultValue={v.actualCost} error={e.actualCost} hint="For budget vs actual reporting." />
              <label className="flex items-center gap-2 self-end pb-2 text-[13px]">
                <input type="checkbox" name="includedInQuote" defaultChecked={v.includedInQuote} className="h-4 w-4 accent-accent" />
                Include in quote price
              </label>
            </Group>
          )}
          {!showCosts && <input type="hidden" name="includedInQuote" value={v.includedInQuote ? "on" : ""} />}

          <div className="sticky bottom-0 -mx-6 border-t border-line bg-surface px-6 py-4">
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
          </div>
        </>
      )}
    </ActionForm>
  );
}
