import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/current";

export const metadata: Metadata = { title: "Integrations" };

/** Honest status: nothing is connected yet. Each row explains what is required (docs/INTEGRATIONS.md). */
const INTEGRATIONS = [
  { name: "Xero", purpose: "Approved invoices, supplier bills and payment status", status: "Not configured", needs: "Xero app credentials, OAuth consent and agreed accounting workflow (decision D8)." },
  { name: "Exchange rates", purpose: "Currency conversion for multi-currency costing", status: "Manual", needs: "Rates are entered manually by Finance. A live provider can be added later." },
  { name: "Google Places & Maps", purpose: "Location import, maps and distance estimates", status: "Not configured", needs: "API key and terms review. Imported data will remain unverified until reviewed." },
  { name: "Email", purpose: "Invitations, reminders and notifications", status: "Not configured", needs: "Transactional email provider. Invitations currently produce a copyable link." },
  { name: "File storage", purpose: "Contracts, rate sheets, inspection photos", status: "Not configured", needs: "Private S3-compatible bucket." },
  { name: "AI assistance", purpose: "Drafting, summarising, rate-sheet extraction", status: "Not configured", needs: "Provider choice and data-handling approval. Output will always require human review." },
];

export default async function IntegrationsPage() {
  const actor = await requireActor();
  if (!can(actor, "admin.settings")) notFound();
  return (
    <>
      <PageHeader eyebrow="System" title="Integrations" description="External services connect only after a verified live call. Nothing below is currently connected." />
      <Table>
        <thead><tr><Th>Service</Th><Th>Purpose</Th><Th>Status</Th><Th>What is required</Th></tr></thead>
        <tbody>
          {INTEGRATIONS.map((i) => (
            <tr key={i.name}>
              <Td className="font-medium">{i.name}</Td>
              <Td className="text-[13px] text-ink-muted">{i.purpose}</Td>
              <Td><Badge tone={i.status === "Manual" ? "info" : "neutral"}>{i.status}</Badge></Td>
              <Td className="text-[13px] text-ink-muted">{i.needs}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
