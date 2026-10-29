import type { Metadata } from "next";
import { Pencil, Plus } from "lucide-react";
import { RateStatusBadge, VerificationBadge } from "@/components/suppliers/badges";
import { ContactForm, RateForm, ServiceForm, SupplierForm } from "@/components/suppliers/forms";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { Fact, PageHeader, Panel, Section } from "@/components/ui/page-header";
import { COMPONENT_TYPES, RATE_BASIS_LABEL, type ComponentType } from "@/lib/domain/components";
import { formatDate, formatMoney } from "@/lib/format";
import { RATE_TYPE_LABEL } from "@/lib/options";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { loadOr404 } from "@/server/load-or-404";
import { listLegalCompanies } from "@/server/services/org";
import { SUPPLIER_CATEGORY_LABEL, getSupplier } from "@/server/services/suppliers";
import { addContactAction, addServiceAction, createRateAction, decideRateAction, removeContactAction, reviseRateAction, saveSupplierAction } from "../actions";

export const metadata: Metadata = { title: "Supplier" };

const str = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v == null ? "" : String(v)]));

export default async function SupplierPage({ params }: PageProps<"/suppliers/[id]">) {
  const actor = await requireActor();
  const { id } = await params;
  const [{ supplier: s, contacts, services, rates }, companies] = await Promise.all([loadOr404(getSupplier(db, actor, id)), listLegalCompanies(db)]);
  const canEdit = can(actor, "supplier.edit");
  const canApprove = can(actor, "rate.approve");
  const categories = Object.entries(SUPPLIER_CATEGORY_LABEL).map(([value, label]) => ({ value, label }));
  const company = companies.find((c) => c.id === s.legalCompanyId);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Suppliers", href: "/suppliers" }, { label: s.name }]}
        title={s.name}
        meta={<><span>{SUPPLIER_CATEGORY_LABEL[s.category]}</span>{s.region && <span>· {s.region}</span>}<VerificationBadge status={s.verification} />{s.isDemo && <Badge tone="warning">Demonstration data</Badge>}</>}
        actions={canEdit && (
          <Drawer trigger={{ label: <><Pencil size={14} aria-hidden /> Edit supplier</> }} title={`Edit ${s.name}`} wide>
            <SupplierForm action={saveSupplierAction.bind(null, s.id)} v={str(s)} categories={categories} companies={companies.map((c) => ({ value: c.id, label: c.name }))} />
          </Drawer>
        )}
      />

      <div className="grid gap-8 xl:grid-cols-[1fr_340px]">
        <div className="space-y-8">
          <Section
            title="Services & rates"
            description="Each change to a rate is a new version. The approved version is used for costing until a newer one is approved; issued quotes keep the figures they were built from."
            actions={canEdit && (
              <Drawer trigger={{ label: <><Plus size={14} aria-hidden /> Add service</> }} title="Add service" description={s.name}>
                <ServiceForm action={addServiceAction.bind(null, s.id)} />
              </Drawer>
            )}
          >
            {services.length === 0 ? (
              <EmptyState title="No services yet" compact>Add a bookable service (a suite, a flight route, a vehicle-day) and then its rates.</EmptyState>
            ) : (
              <div className="space-y-4">
                {services.map((svc) => {
                  const svcRates = rates.filter((r) => r.serviceId === svc.id);
                  const lineages = [...new Set(svcRates.map((r) => r.lineageId))];
                  return (
                    <Panel key={svc.id}>
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
                        <div>
                          <p className="text-[14px] font-medium">{svc.name}</p>
                          <p className="text-[12px] text-ink-faint">{COMPONENT_TYPES[svc.componentType as ComponentType]?.label ?? svc.componentType}{svc.description ? ` · ${svc.description}` : ""}</p>
                        </div>
                        {canEdit && (
                          <Drawer trigger={{ label: <><Plus size={14} aria-hidden /> Add rate</>, variant: "ghost" }} title="Add rate" description={`${s.name} · ${svc.name}`} wide>
                            <RateForm action={createRateAction.bind(null, s.id, svc.id)} v={{ currency: s.defaultCurrency }} submitLabel="Submit rate for review" />
                          </Drawer>
                        )}
                      </div>
                      {lineages.length === 0 ? (
                        <p className="px-5 py-4 text-[13px] text-ink-muted">No rates recorded.</p>
                      ) : (
                        <ul className="divide-y divide-line">
                          {lineages.map((lid) => {
                            const versions = svcRates.filter((r) => r.lineageId === lid).sort((a, b) => b.version - a.version);
                            const current = versions.find((r) => r.status === "approved");
                            const pending = versions.find((r) => r.status === "pending_review" || r.status === "draft");
                            const head = current ?? versions[0]!;
                            const expiring = current?.validTo && current.validTo < new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
                            return (
                              <li key={lid} className="px-5 py-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium">{head.name} <span className="text-[12px] font-normal text-ink-faint">v{head.version}</span> <RateStatusBadge status={head.status} />{expiring && <Badge tone="info">Expires {formatDate(current!.validTo)}</Badge>}</p>
                                    <p className="mt-1 text-[12.5px] text-ink-muted">
                                      {RATE_BASIS_LABEL[head.basis]} · {head.validFrom || head.validTo ? `${formatDate(head.validFrom)} – ${formatDate(head.validTo)}` : "No validity dates"} · {RATE_TYPE_LABEL[head.type]}
                                    </p>
                                    <p className="mt-0.5 text-[12px] text-ink-faint">Source: {head.source}{head.obtainedOn ? `, obtained ${formatDate(head.obtainedOn)}` : ""}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[15px] font-semibold tabular">{formatMoney(head.amount, head.currency)}</p>
                                    {head.minimumCharge && <p className="text-[11.5px] text-ink-faint">min {formatMoney(head.minimumCharge, head.currency)}</p>}
                                  </div>
                                </div>
                                {pending && current && (
                                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] bg-warning-bg px-3 py-2 text-[12.5px] text-warning">
                                    <span>v{pending.version} proposed: <strong className="tabular">{formatMoney(pending.amount, pending.currency)}</strong> — awaiting review</span>
                                    {canApprove && <><ActionButton action={decideRateAction.bind(null, pending.id, "approve")} variant="primary">Approve v{pending.version}</ActionButton><ActionButton action={decideRateAction.bind(null, pending.id, "reject")} variant="ghost">Reject</ActionButton></>}
                                  </div>
                                )}
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  {canApprove && !current && pending && <><ActionButton action={decideRateAction.bind(null, pending.id, "approve")} variant="primary">Approve</ActionButton><ActionButton action={decideRateAction.bind(null, pending.id, "reject")} variant="ghost">Reject</ActionButton></>}
                                  {canEdit && !pending && (
                                    <Drawer trigger={{ label: "Record a change", variant: "ghost" }} title={`Change “${head.name}”`} description="Creates a new version for review. The current approved version stays in force until approval." wide>
                                      <RateForm action={reviseRateAction.bind(null, s.id, head.id)} v={{ ...str(head), source: "", obtainedOn: "" }} submitLabel="Submit new version" />
                                    </Drawer>
                                  )}
                                  {versions.length > 1 && (
                                    <details className="text-[12.5px]">
                                      <summary className="cursor-pointer text-ink-muted hover:text-ink">History ({versions.length} versions)</summary>
                                      <table className="mt-2 w-full text-[12.5px]">
                                        <tbody>
                                          {versions.map((r) => (
                                            <tr key={r.id} className="border-t border-line">
                                              <td className="py-1.5 pr-3 text-ink-faint">v{r.version}</td>
                                              <td className="py-1.5 pr-3 tabular">{formatMoney(r.amount, r.currency)}</td>
                                              <td className="py-1.5 pr-3"><RateStatusBadge status={r.status} /></td>
                                              <td className="py-1.5 text-ink-faint">{r.createdByName ?? "—"} · {formatDate(r.createdAt.toISOString().slice(0, 10))}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </details>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </Panel>
                  );
                })}
              </div>
            )}
          </Section>
        </div>

        <aside className="space-y-8">
          <Section title="Details">
            <Panel className="p-5">
              <dl className="space-y-4">
                <Fact label="Contact">{[s.email, s.phone].filter(Boolean).join(" · ") || "—"}</Fact>
                <Fact label="Website">{s.website ?? "—"}</Fact>
                <Fact label="Location">{s.location ?? "—"}</Fact>
                <Fact label="Legal company">{company?.name ?? "Independent supplier"}</Fact>
                <Fact label="Payment terms">{s.paymentTerms ?? "—"}</Fact>
                <Fact label="Cancellation terms">{s.cancellationTerms ?? "—"}</Fact>
                {s.internalNotes && <Fact label="Internal notes"><span className="whitespace-pre-line">{s.internalNotes}</span></Fact>}
              </dl>
            </Panel>
          </Section>
          <Section title="Contacts" actions={canEdit && (
            <Drawer trigger={{ label: <><Plus size={14} aria-hidden /> Add</>, variant: "ghost" }} title="Add contact" description={s.name}>
              <ContactForm action={addContactAction.bind(null, s.id)} />
            </Drawer>
          )}>
            {contacts.length === 0 ? <p className="text-[13px] text-ink-muted">No contacts recorded.</p> : (
              <Panel><ul className="divide-y divide-line">
                {contacts.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="text-[13px]">
                      <p className="font-medium">{c.name} {c.isPrimary && <Badge tone="accent" className="ml-1">Primary</Badge>}</p>
                      <p className="text-ink-faint">{[c.role, c.email, c.phone].filter(Boolean).join(" · ")}</p>
                    </div>
                    {canEdit && <ConfirmButton variant="ghost" label="Remove" title={`Remove ${c.name}?`} body="The contact is removed from this supplier. This is recorded in the audit log." confirmLabel="Remove" danger action={removeContactAction.bind(null, s.id, c.id)} />}
                  </li>
                ))}
              </ul></Panel>
            )}
          </Section>
        </aside>
      </div>
    </>
  );
}
