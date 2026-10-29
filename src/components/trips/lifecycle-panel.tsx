"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { controlClass } from "@/components/ui/field";
import { TRIP_STATUS_LABEL, type TripStatus } from "@/lib/domain/trip-lifecycle";
import type { ActionState } from "@/server/action-result";

export interface NextStatusOption {
  status: TripStatus;
  blockers: string[];
  reasonRequired: boolean;
  permitted: boolean;
}

export function LifecyclePanel({
  options,
  version,
  canOverride,
  action,
}: {
  options: NextStatusOption[];
  version: number;
  canOverride: boolean;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const permitted = options.filter((o) => o.permitted);
  const [to, setTo] = useState<TripStatus | "">("");
  const sel = permitted.find((o) => o.status === to);

  if (!permitted.length) return <p className="text-[13px] text-ink-muted">No further status changes are available to you.</p>;

  return (
    <form action={formAction} className="space-y-3" key={version}>
      {state?.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      <input type="hidden" name="version" value={version} />
      <label htmlFor="to" className="block text-[13px] font-medium">Move to</label>
      <select id="to" name="to" required className={controlClass} value={to} onChange={(e) => setTo(e.target.value as TripStatus)}>
        <option value="">Choose next stage…</option>
        {permitted.map((o) => (
          <option key={o.status} value={o.status}>
            {TRIP_STATUS_LABEL[o.status]}
            {o.blockers.length ? " — requirements outstanding" : ""}
          </option>
        ))}
      </select>
      {sel && sel.blockers.length > 0 && (
        <Alert tone="warning" title="Requirements outstanding">
          <ul className="list-disc pl-4">{sel.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
          {canOverride ? (
            <label className="mt-2 flex items-start gap-2 text-ink">
              <input type="checkbox" name="override" className="mt-0.5 h-4 w-4 accent-danger" />
              <span>Override these rules. Your reason is recorded in the trip history and audit log.</span>
            </label>
          ) : (
            <p className="mt-2">Only users with override permission can proceed.</p>
          )}
        </Alert>
      )}
      {sel && (
        <div>
          <label htmlFor="reason" className="block text-[13px] font-medium">
            Reason {sel.reasonRequired ? <span className="text-danger">*</span> : <span className="font-normal text-ink-faint">(optional)</span>}
          </label>
          <textarea id="reason" name="reason" rows={2} required={sel.reasonRequired} className={`${controlClass} mt-1.5`} />
        </div>
      )}
      <Button type="submit" size="sm" disabled={!sel || pending || (sel.blockers.length > 0 && !canOverride)}>
        {pending ? "Updating…" : "Update status"}
      </Button>
    </form>
  );
}
