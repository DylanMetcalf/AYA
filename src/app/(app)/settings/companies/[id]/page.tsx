import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { legalCompanies } from "@/server/db/schema";
import { saveCompanyAction } from "../../actions";
import { CompanyForm } from "../../settings-forms";

export const metadata: Metadata = { title: "Legal company" };

/** Handles both /settings/companies/new and /settings/companies/<id>. */
export default async function CompanyPage({ params }: PageProps<"/settings/companies/[id]">) {
  const actor = await requireActor();
  if (!can(actor, "admin.settings")) notFound();
  const { id } = await params;
  const isNew = id === "new";
  const [c] = !isNew && /^[0-9a-f-]{36}$/i.test(id) ? await db.select().from(legalCompanies).where(eq(legalCompanies.id, id)) : [];
  if (!isNew && !c) notFound();
  const n = (x: string | null | undefined) => x ?? "";
  return (
    <>
      <PageHeader eyebrow="Settings · Legal company" title={c?.name ?? "New legal company"} />
      <CompanyForm action={saveCompanyAction.bind(null, isNew ? null : id)}
        v={{ name: n(c?.name), registrationNumber: n(c?.registrationNumber), vatNumber: n(c?.vatNumber), country: c?.country ?? "ZA", address: n(c?.address), baseCurrency: c?.baseCurrency ?? "ZAR", groupRole: c?.groupRole ?? "other", verified: c?.verified ?? false, notes: n(c?.notes) }} />
    </>
  );
}
