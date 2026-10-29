"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useState, useTransition } from "react";
import { ActionForm } from "@/components/ui/action-form";
import { useDrawerClose } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { BOOKING_STATUSES, BOOKING_STATUS_LABEL, RATE_BASIS_LABEL, type RateBasis } from "@/lib/domain/components";
import { formatDate, formatMoney } from "@/lib/format";
import type { ActionState } from "@/server/action-result";

/** Up/down and move-to-day controls. Buttons (not drag-and-drop) so reordering works by keyboard. */
export function MoveControls({ isFirst, isLast, days, currentDayId, move, title }: { isFirst: boolean; isLast: boolean; days: { id: string; label: string }[]; currentDayId: string; move: (m: { direction?: "up" | "down"; toDayId?: string }) => Promise<ActionState>; title: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (m: { direction?: "up" | "down"; toDayId?: string }) => start(async () => { const r = await move(m); setError(r && !r.ok ? (r.message ?? "Failed") : null); });
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" disabled={isFirst || pending} onClick={() => run({ direction: "up" })} aria-label={`Move “${title}” earlier`} className="rounded p-1 text-ink-faint hover:bg-muted hover:text-ink disabled:opacity-30"><ArrowUp size={14} /></button>
      <button type="button" disabled={isLast || pending} onClick={() => run({ direction: "down" })} aria-label={`Move “${title}” later`} className="rounded p-1 text-ink-faint hover:bg-muted hover:text-ink disabled:opacity-30"><ArrowDown size={14} /></button>
      {days.length > 1 && (
        <select aria-label={`Move “${title}” to another day`} disabled={pending} value="" onChange={(e) => e.target.value && run({ toDayId: e.target.value })} className="h-7 rounded border border-line bg-surface px-1.5 text-[12px] text-ink-muted">
          <option value="">Move to…</option>
          {days.filter((d) => d.id !== currentDayId).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
      )}
      {error && <span role="alert" className="text-[12px] text-danger">{error}</span>}
    </span>
  );
}

export function BookingForm({ action, current, onDone }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; current: { status: string; confirmationRef: string | null }; onDone?: () => void }) {
  return (
    <ActionForm action={action} onSuccess={onDone} className="space-y-4">
      {({ errors: e, pending }) => (
        <>
          <SelectField label="Arrangement status" name="status" options={BOOKING_STATUSES.map((s) => ({ value: s, label: BOOKING_STATUS_LABEL[s] }))} defaultValue={current.status} error={e.status} hint="Only mark Confirmed once the supplier has confirmed in writing." />
          <TextField label="Supplier confirmation reference" name="confirmationRef" defaultValue={current.confirmationRef ?? ""} error={e.confirmationRef} />
          <TextField label="Confirmed on" name="confirmedOn" type="date" />
          <TextField label="Note (recorded in history)" name="note" />
          <Button type="submit" disabled={pending}>Update arrangement</Button>
        </>
      )}
    </ActionForm>
  );
}

export interface RateOption { id: string; name: string; currency: string; amount: string; basis: RateBasis; supplierName: string; serviceName: string; validFrom: string | null; validTo: string | null; version: number; componentType: string }

/** Lists approved rates (matching type first) and applies the chosen one. */
export function RatePicker({ rates, componentType, apply, onDone }: { rates: RateOption[]; componentType: string; apply: (rateId: string) => Promise<ActionState>; onDone?: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const close = useDrawerClose();
  const matching = rates.filter((r) => r.componentType === componentType);
  const list = showAll || matching.length === 0 ? rates : matching;
  if (!rates.length) return <p className="text-[13px] text-ink-muted">No approved supplier rates yet. Add and approve rates in the Supplier Directory, or enter a manual cost.</p>;
  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-[13px] text-danger">{error}</p>}
      <ul className="divide-y divide-line rounded-[var(--radius-md)] border border-line">
        {list.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 text-[13px]">
              <p className="font-medium">{r.supplierName} · {r.serviceName}</p>
              <p className="text-ink-faint">{r.name} v{r.version} · {RATE_BASIS_LABEL[r.basis]} · {formatDate(r.validFrom)} – {formatDate(r.validTo)}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-medium tabular">{formatMoney(r.amount, r.currency)}</span>
              <Button size="sm" disabled={pending} onClick={() => start(async () => { const res = await apply(r.id); if (res?.ok) { onDone?.(); close?.(); } else setError(res?.message ?? "Failed"); })}>Use</Button>
            </div>
          </li>
        ))}
      </ul>
      {matching.length > 0 && matching.length < rates.length && (
        <button type="button" className="text-[12.5px] text-accent-text hover:underline" onClick={() => setShowAll((s) => !s)}>{showAll ? "Show matching rates only" : `Show all ${rates.length} approved rates`}</button>
      )}
    </div>
  );
}
