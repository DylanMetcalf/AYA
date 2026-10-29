"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/action-result";

/** Runs a server action without confirmation (for safe, reversible actions). Errors show inline. */
export function ActionButton({ action, children, variant = "secondary", size = "sm", className }: { action: () => Promise<ActionState>; children: ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; className?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start">
      <Button variant={variant} size={size} className={className} disabled={pending} onClick={() => start(async () => { const r = await action(); setError(r && !r.ok ? (r.message ?? "Failed") : null); })}>
        {pending ? "Working…" : children}
      </Button>
      {error && <span role="alert" className="mt-1 text-[12px] text-danger">{error}</span>}
    </span>
  );
}
