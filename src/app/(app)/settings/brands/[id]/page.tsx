import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { brands } from "@/server/db/schema";
import { listLegalCompanies } from "@/server/services/org";
import { updateBrandAction } from "../../actions";
import { BrandForm } from "../../settings-forms";

export const metadata: Metadata = { title: "Edit brand" };

export default async function BrandPage({ params }: PageProps<"/settings/brands/[id]">) {
  const actor = await requireActor();
  if (!can(actor, "admin.settings")) notFound();
  const { id } = await params;
  const [b] = /^[0-9a-f-]{36}$/i.test(id) ? await db.select().from(brands).where(eq(brands.id, id)) : [];
  if (!b) notFound();
  const companies = await listLegalCompanies(db);
  const n = (x: string | null) => x ?? "";
  return (
    <>
      <PageHeader eyebrow="Settings · Brand" title={b.name} />
      <BrandForm action={updateBrandAction.bind(null, id)} companies={companies.map((c) => ({ value: c.id, label: c.name }))}
        v={{ name: b.name, kind: b.kind, legalCompanyId: n(b.legalCompanyId), tagline: n(b.tagline), description: n(b.description), colorPrimary: b.colorPrimary, colorSecondary: b.colorSecondary, colorAccent: b.colorAccent, contactEmail: n(b.contactEmail), contactPhone: n(b.contactPhone), website: n(b.website), documentFooter: n(b.documentFooter), isProvisional: b.isProvisional }} />
    </>
  );
}
