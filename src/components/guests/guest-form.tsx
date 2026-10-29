"use client";

import { startTransition, useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import type { ActionState } from "@/server/action-result";

export interface GuestFormValues {
  firstName: string; lastName: string; email: string; phone: string; nationality: string; preferences: string;
  dietary: string; accessibility: string; medicalNotes: string; relationshipNotes: string; marketingConsent: boolean;
}

export function GuestForm({ action, initial, showSensitive, submitLabel }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; initial: GuestFormValues; showSensitive: boolean; submitLabel: string }) {
  const [state, formAction, pending] = useActionState(action, null);
  const e = state?.fieldErrors ?? {};
  return (
    <form
      noValidate
      className="grid max-w-3xl gap-4 sm:grid-cols-2"
      onSubmit={(ev) => {
        ev.preventDefault();
        const fd = new FormData(ev.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {state?.message && <Alert tone={state.ok ? "success" : "danger"} className="sm:col-span-2">{state.message}</Alert>}
      <TextField label="First name" name="firstName" defaultValue={initial.firstName} required error={e.firstName} />
      <TextField label="Last name" name="lastName" defaultValue={initial.lastName} required error={e.lastName} />
      <TextField label="Email" name="email" type="email" defaultValue={initial.email} error={e.email} />
      <TextField label="Phone" name="phone" type="tel" defaultValue={initial.phone} error={e.phone} />
      <TextField label="Nationality" name="nationality" maxLength={2} defaultValue={initial.nationality} error={e.nationality} hint="2-letter country code, e.g. GB" />
      <div />
      <TextAreaField label="Preferences" name="preferences" defaultValue={initial.preferences} error={e.preferences} fieldClassName="sm:col-span-2" hint="Confirmed preferences only. Note assumptions as such." />
      {showSensitive ? (
        <fieldset className="grid gap-4 rounded-[var(--radius-md)] border border-line bg-subtle p-4 sm:col-span-2 sm:grid-cols-3">
          <legend className="px-1 text-[13px] font-medium">Restricted information</legend>
          <p className="text-xs text-ink-muted sm:col-span-3">Visible only to roles with access to sensitive guest data. Record only what operations genuinely need (POPIA).</p>
          <TextAreaField label="Dietary" name="dietary" rows={3} defaultValue={initial.dietary} error={e.dietary} />
          <TextAreaField label="Accessibility" name="accessibility" rows={3} defaultValue={initial.accessibility} error={e.accessibility} />
          <TextAreaField label="Medical notes" name="medicalNotes" rows={3} defaultValue={initial.medicalNotes} error={e.medicalNotes} />
        </fieldset>
      ) : (
        <p className="text-[13px] text-ink-muted sm:col-span-2">Dietary, accessibility and medical information is restricted and hidden for your role.</p>
      )}
      <TextAreaField label="Relationship notes (internal)" name="relationshipNotes" defaultValue={initial.relationshipNotes} error={e.relationshipNotes} fieldClassName="sm:col-span-2" />
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="marketingConsent" defaultChecked={initial.marketingConsent} className="h-4 w-4 accent-accent" />
        Guest has consented to marketing communications
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
      </div>
    </form>
  );
}
