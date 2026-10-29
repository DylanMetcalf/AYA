"use client";

import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { useDrawerClose } from "@/components/ui/drawer";
import type { ActionState } from "@/server/action-result";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * Form wrapper for server actions:
 *  - submits in a transition (inputs are kept when validation fails),
 *  - exposes field errors to children,
 *  - adds a per-render idempotency key so a double submit cannot record twice,
 *  - optionally resets after success (for "add another" forms),
 *  - closes its enclosing Drawer on success.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  idempotent,
  onSuccess,
}: {
  action: Action;
  children: (s: { errors: Record<string, string[]>; pending: boolean }) => ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  idempotent?: boolean;
  onSuccess?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  // Kept across failed attempts (a retry is deduplicated server-side); rotated after success.
  const key = useRef<string | null>(null);
  const handled = useRef<ActionState>(null);
  const closeDrawer = useDrawerClose();
  useEffect(() => {
    if (!state?.ok || handled.current === state) return;
    handled.current = state;
    if (resetOnSuccess) ref.current?.reset();
    key.current = null;
    onSuccess?.();
    closeDrawer?.();
  }, [state, resetOnSuccess, onSuccess, closeDrawer]);
  return (
    <form
      ref={ref}
      noValidate
      className={className}
      onSubmit={(ev) => {
        ev.preventDefault();
        if (pending) return;
        const fd = new FormData(ev.currentTarget);
        if (idempotent) fd.set("idempotencyKey", (key.current ??= crypto.randomUUID()));
        startTransition(() => formAction(fd));
      }}
    >
      {state && !state.ok && state.message && <Alert tone="danger" className="mb-4">{state.message}</Alert>}
      {children({ errors: state?.fieldErrors ?? {}, pending })}
    </form>
  );
}
