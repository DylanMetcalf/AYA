import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader, Section } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { listAllBrands, listLegalCompanies } from "@/server/services/org";

export const metadata: Metadata = { title: "Settings" };

const GROUP_ROLE: Record<string, string> = { central_operator: "Central operator", group_company: "Group company", connected_partner: "Connected partner", supplier: "Supplier", other: "Other" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const actor = await requireActor();
  if (!can(actor, "admin.settings")) notFound();
  const { saved } = await searchParams;
  const [companies, brands] = await Promise.all([listLegalCompanies(db), listAllBrands(db)]);
  const companyName = (id: string | null) => companies.find((c) => c.id === id)?.name ?? "—";
  return (
    <>
      <PageHeader eyebrow="System" title="Companies & brands" description="Legal entities and the brands that trade under them. Ownership, tax and invoicing arrangements are configuration — verify before production use." />
      {saved && <Alert tone="success" className="mb-6">Saved.</Alert>}
      <div className="space-y-10">
        <Section title="Legal companies" actions={<ButtonLink href="/settings/companies/new" variant="secondary" size="sm">Add company</ButtonLink>}>
          <Table>
            <thead><tr><Th>Company</Th><Th>Relationship</Th><Th>Registration</Th><Th>VAT</Th><Th>Currency</Th><Th>Status</Th></tr></thead>
            <tbody>{companies.map((c) => (
              <tr key={c.id}>
                <Td><Link href={`/settings/companies/${c.id}`} className="font-medium hover:underline">{c.name}</Link></Td>
                <Td className="text-[13px]">{GROUP_ROLE[c.groupRole]}</Td>
                <Td className="text-[13px]">{c.registrationNumber ?? "—"}</Td>
                <Td className="text-[13px]">{c.vatNumber ?? "—"}</Td>
                <Td className="text-[13px]">{c.baseCurrency}</Td>
                <Td>{c.verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Unverified</Badge>}</Td>
              </tr>))}
            </tbody>
          </Table>
        </Section>
        <Section title="Brands">
          <div className="grid gap-4 md:grid-cols-3">
            {brands.map((b) => (
              <Link key={b.id} href={`/settings/brands/${b.id}`} className="block overflow-hidden rounded-[var(--radius-lg)] border border-stone-200 bg-surface hover:border-stone-300">
                <div className="flex h-20 items-end p-4" style={{ backgroundColor: b.colorPrimary }}>
                  <span className="font-display text-xl tracking-[0.18em]" style={{ color: b.colorSecondary }}>{b.name}</span>
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex gap-1.5" aria-hidden>{[b.colorPrimary, b.colorSecondary, b.colorAccent].map((c) => <span key={c} className="h-4 w-4 rounded-full ring-1 ring-stone-200" style={{ backgroundColor: c }} />)}</div>
                  <p className="text-[13px] text-ink-muted">{b.tagline ?? "No tagline"}</p>
                  <p className="text-[12px] text-ink-faint">{b.kind} brand · {companyName(b.legalCompanyId)}</p>
                  {b.isProvisional && <Badge tone="warning">Provisional identity</Badge>}
                </div>
              </Link>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}
