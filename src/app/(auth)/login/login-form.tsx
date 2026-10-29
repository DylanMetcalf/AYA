"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { loginAction } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-5">
      {state?.message && <Alert tone="danger">{state.message}</Alert>}
      <input type="hidden" name="next" value={next ?? "/"} />
      <TextField label="Email" name="email" type="email" autoComplete="username" required autoFocus />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
