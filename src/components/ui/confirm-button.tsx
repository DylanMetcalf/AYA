"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/action-result";

/** Button that runs a server action after an accessible confirmation dialog (native <dialog>). */
export function ConfirmButton({
  label,
  title,
  body,
  confirmLabel,
  action,
  variant = "secondary",
  danger,
}: {
  label: ReactNode;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  action: () => Promise<ActionState>;
  variant?: "secondary" | "ghost" | "primary";
  danger?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState>(null);
  return (
    <>
      <Button variant={variant} size="sm" onClick={() => { setResult(null); ref.current?.showModal(); }}>
        {label}
      </Button>
      <dialog ref={ref} aria-labelledby="confirm-title" className="m-auto w-[min(92vw,440px)] rounded-[var(--radius-lg)] border border-line bg-surface p-6 text-ink shadow-xl">
        <h2 id="confirm-title" className="title text-[17px]">{title}</h2>
        <div className="mt-2 text-sm text-ink-muted">{body}</div>
        {result && !result.ok && <Alert tone="danger" className="mt-4">{result.message}</Alert>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => ref.current?.close()} disabled={pending}>Cancel</Button>
          <Button
            variant={danger ? "danger" : "primary"}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await action();
                setResult(r);
                if (r?.ok) ref.current?.close();
              })
            }
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </div>
      </dialog>
    </>
  );
}
