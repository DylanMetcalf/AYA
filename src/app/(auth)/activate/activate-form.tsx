"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { activateAction } from "./actions";

export function ActivateForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(activateAction, null);
  if (!token) return <Alert tone="danger">This activation link is incomplete. Ask your administrator for a new invitation.</Alert>;
  return (
    <form action={action} className="space-y-5">
      {state?.message && <Alert tone="danger">{state.message}</Alert>}
      <input type="hidden" name="token" value={token} />
      <TextField label="New password" name="password" type="password" autoComplete="new-password" minLength={12} required error={state?.fieldErrors?.password} />
      <TextField label="Confirm password" name="confirm" type="password" autoComplete="new-password" minLength={12} required error={state?.fieldErrors?.confirm} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Activating…" : "Activate account"}
      </Button>
    </form>
  );
}
