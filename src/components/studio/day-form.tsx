"use client";

import { ActionForm } from "@/components/ui/action-form";
import { Button } from "@/components/ui/button";
import { TextAreaField, TextField } from "@/components/ui/field";
import type { ActionState } from "@/server/action-result";

export function DayForm({ action, v, submitLabel }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; v?: { title: string; location: string; notes: string }; submitLabel: string }) {
  return (
    <ActionForm action={action} className="space-y-4">
      {({ pending }) => (
        <>
          <TextField label="Title" name="title" defaultValue={v?.title} placeholder="e.g. Classic car journey along the Panorama Route" />
          <TextField label="Location" name="location" defaultValue={v?.location} />
          {v && <TextAreaField label="Day notes (internal)" name="notes" defaultValue={v.notes} />}
          <Button type="submit" disabled={pending}>{submitLabel}</Button>
        </>
      )}
    </ActionForm>
  );
}
