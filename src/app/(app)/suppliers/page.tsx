import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { VerificationBadge } from "@/components/suppliers/badges";
import { SupplierForm } from "@/components/suppliers/forms";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { controlClass } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { loadOr404 } from "@/server/load-or-404";
import { listLegalCompanies } from "@/server/services/org";
import { SUPPLIER_CATEGORY_LABEL, listSuppliers } from "@/server/services/suppliers";
import { saveSupplierAction } from "./actions";

export const metadata: Metadata = { title: "Supplier Directory" };

export default async function SuppliersPage({ searchParams }: PageProps<"/suppliers">) {
  const actor = await requireActor();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const category = typeof sp.category === "string" ? sp.category : "";
  const [rows, companies] = await Promise.all([loadOr404(listSuppliers(db, actor, { q, category })), listLegalCompanies(db)]);
  const categories = Object.entries(SUPPLIER_CATEGORY_LABEL).map(([value, label]) => ({ value, label }));
  return (
    <>
      <PageHeader
        eyebrow="Suppliers"
        title="Supplier Directory"
        description="Lodges, guides, aviation, vehicle partners and specialist services. Rates are versioned and must be approved before they are used for costing."
        actions={can(actor, "supplier.edit") && (
          <Drawer trigger={{ label: <><Plus size={15} aria-hidden /> New supplier</>, variant: "primary", size: "md" }} title="New supplier" wide>
            <SupplierForm action={saveSupplierAction.bind(null, null)} v={{}} categories={categories} companies={companies.map((c) => ({ value: c.id, label: c.name }))} />
          </Drawer>
        )}
      />
      <form className="mb-5 flex flex-wrap gap-2" role="search">
        <label htmlFor="sq" className="sr-only">Search suppliers</label>
        <input id="sq" name="q" defaultValue={q} placeholder="Name or region" className={`${controlClass} h-9 w-64 py-1`} />
        <label htmlFor="sc" className="sr-only">Category</label>
        <select id="sc" name="category" defaultValue={category} className={`${controlClass} h-9 w-48 py-1`}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <button className={buttonClass("secondary", "md", "h-9")}>Filter</button>
      </form>
      {rows.length === 0 ? (
        <EmptyState title={q || category ? "No suppliers match" : "No suppliers yet"}>Add suppliers, then their services and rates.</EmptyState>
      ) : (
        <Table>
          <thead><tr><Th>Supplier</Th><Th>Category</Th><Th>Region</Th><Th className="text-right">Services</Th><Th>Rates</Th><Th>Verification</Th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="hover:bg-subtle">
                <Td><Link href={`/suppliers/${s.id}`} className="font-medium hover:text-accent-text">{s.name}</Link>{s.isDemo && <Badge tone="warning" className="ml-2">Demo</Badge>}</Td>
                <Td className="text-ink-muted">{SUPPLIER_CATEGORY_LABEL[s.category]}</Td>
                <Td className="text-ink-muted">{s.region ?? "—"}</Td>
                <Td className="text-right tabular">{s.services}</Td>
                <Td>
                  <span className="flex flex-wrap gap-1.5">
                    <span className="text-[12.5px] text-ink-muted tabular">{s.approvedRates} approved</span>
                    {s.pendingRates > 0 && <Badge tone="warning">{s.pendingRates} to review</Badge>}
                    {s.expiringRates > 0 && <Badge tone="info">{s.expiringRates} expiring</Badge>}
                  </span>
                </Td>
                <Td><VerificationBadge status={s.verification} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
