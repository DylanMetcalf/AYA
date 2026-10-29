import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Panel } from "@/components/ui/page-header";
import { RATE_BASIS_LABEL } from "@/lib/domain/components";
import { dec } from "@/lib/finance/money";
import { formatDate, formatMoney } from "@/lib/format";
import { RATE_TYPE_LABEL } from "@/lib/options";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { listRatesForReview, rateImpact } from "@/server/services/suppliers";
import { decideRateAction } from "../../suppliers/actions";

export const metadata: Metadata = { title: "Rate Review" };

export default async function RateReviewPage() {
  const actor = await requireActor();
  if (!can(actor, "rate.approve")) notFound();
  const queue = await listRatesForReview(db, actor);
  const impacts = await Promise.all(queue.map((q) => rateImpact(db, actor, q.rate.lineageId)));

  return (
    <>
      <PageHeader eyebrow="Suppliers" title="Rate Review" description="New and changed supplier rates awaiting approval. Approval makes a rate available for costing; it never changes issued quotes." />
      {queue.length === 0 ? (
        <EmptyState title="Nothing awaiting review">New supplier rates and changes appear here for approval.</EmptyState>
      ) : (
        <div className="space-y-4">
          {queue.map((q, i) => {
            const impact = impacts[i]!;
            const change = q.current && q.current.currency === q.rate.currency ? dec(q.rate.amount).minus(dec(q.current.amount)) : null;
            const pct = change && dec(q.current!.amount).gt(0) ? change.div(dec(q.current!.amount)).times(100) : null;
            return (
              <Panel key={q.rate.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[12px] text-ink-faint"><Link href={`/suppliers/${q.supplierId}`} className="hover:text-ink">{q.supplierName}</Link> · {q.serviceName}</p>
                    <p className="mt-0.5 text-[15px] font-medium">{q.rate.name} <span className="text-[12px] font-normal text-ink-faint">v{q.rate.version}</span></p>
                    <p className="mt-1 text-[12.5px] text-ink-muted">{RATE_BASIS_LABEL[q.rate.basis]} · {RATE_TYPE_LABEL[q.rate.type]} · valid {formatDate(q.rate.validFrom)} – {formatDate(q.rate.validTo)}</p>
                    <p className="mt-0.5 text-[12px] text-ink-faint">Source: {q.rate.source} · submitted by {q.createdBy ?? "—"}</p>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    {q.current ? (
                      <>
                        <div><p className="text-[11px] text-ink-faint">Current v{q.current.version}</p><p className="tabular text-ink-muted">{formatMoney(q.current.amount, q.current.currency)}</p></div>
                        <ArrowRight size={16} className="text-ink-faint" aria-hidden />
                      </>
                    ) : <Badge tone="info">New rate</Badge>}
                    <div>
                      <p className="text-[11px] text-ink-faint">Proposed</p>
                      <p className="text-[16px] font-semibold tabular">{formatMoney(q.rate.amount, q.rate.currency)}</p>
                      {pct && <p className={`text-[12px] tabular ${pct.gt(0) ? "text-danger" : "text-success"}`}>{pct.gt(0) ? "+" : ""}{pct.toFixed(1)}%</p>}
                    </div>
                  </div>
                </div>
                {(impact.components.length > 0 || impact.quotes.length > 0) && (
                  <div className="mt-4 rounded-[var(--radius-md)] bg-subtle px-4 py-3 text-[12.5px]">
                    <p className="font-medium text-ink">Impact if approved</p>
                    {impact.components.length > 0 && (
                      <p className="mt-1 text-ink-muted">
                        Priced on {impact.components.length} segment(s) in open journeys:{" "}
                        {impact.components.map((c, j) => <span key={c.componentId}>{j > 0 && ", "}<Link className="underline" href={`/trips/${c.tripId}/studio`}>{c.reference}</Link> ({c.title}, v{c.version})</span>)}. These keep their current price until re-priced in Trip Studio.
                      </p>
                    )}
                    {impact.quotes.length > 0 && <p className="mt-1 text-ink-muted">{impact.quotes.length} issued/accepted quote(s) used an earlier version — they are locked and will not change.</p>}
                  </div>
                )}
                <div className="mt-4 flex gap-2">
                  <ActionButton action={decideRateAction.bind(null, q.rate.id, "approve")} variant="primary">Approve for costing</ActionButton>
                  <ActionButton action={decideRateAction.bind(null, q.rate.id, "reject")} variant="ghost">Reject</ActionButton>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}
