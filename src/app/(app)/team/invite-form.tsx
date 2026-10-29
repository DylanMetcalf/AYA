"use client";

import { startTransition, useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { inviteUserAction } from "./actions";

export function InviteForm({ roles }: { roles: { key: string; name: string; description: string | null }[] }) {
  const [state, action, pending] = useActionState(inviteUserAction, null);
  const e = state?.fieldErrors ?? {};
  return (
    <form noValidate className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); const fd = new FormData(ev.currentTarget); startTransition(() => action(fd)); }}>
      {state?.message && !state.ok && <Alert tone="danger">{state.message}</Alert>}
      {state?.link && (
        <Alert tone="success" title="Invitation created">
          <p>Email delivery is not configured. Send this single-use link to the person securely — it is shown only once and expires in 7 days.</p>
          <input readOnly value={state.link} aria-label="Activation link" className="mt-2 w-full rounded border border-success/30 bg-surface px-2 py-1 font-mono text-[12px] text-ink" onFocus={(ev) => ev.currentTarget.select()} />
        </Alert>
      )}
      <TextField label="Full name" name="name" required error={e.name} />
      <TextField label="Email" name="email" type="email" required error={e.email} />
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium">Roles</legend>
        {e.roleKeys && <p className="mb-1 text-xs text-danger">{e.roleKeys[0]}</p>}
        <div className="space-y-1.5">
          {roles.map((r) => (
            <label key={r.key} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="roleKeys" value={r.key} className="mt-0.5 h-4 w-4 accent-forest" />
              <span><span className="font-medium">{r.name}</span><span className="block text-xs text-ink-faint">{r.description}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create invitation"}</Button>
    </form>
  );
}
