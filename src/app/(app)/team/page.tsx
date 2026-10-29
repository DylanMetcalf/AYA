import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { PageHeader, Panel, Section } from "@/components/ui/page-header";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { can } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { roles } from "@/server/db/schema";
import { listUsers } from "@/server/services/users";
import { setUserActiveAction } from "./actions";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const actor = await requireActor();
  if (!can(actor, "admin.users")) notFound();
  const [users, roleRows] = await Promise.all([listUsers(db, actor), db.select().from(roles).orderBy(asc(roles.name))]);
  return (
    <>
      <PageHeader eyebrow="Delivery" title="Team" description="Individual accounts and roles. Permissions are enforced on the server for every action." />
      <div className="grid gap-10 xl:grid-cols-[1fr_360px]">
        <Section title="People">
          <Table>
            <thead><tr><Th>Name</Th><Th>Roles</Th><Th>Status</Th><Th>Last sign-in</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <Td><p className="font-medium">{u.name}</p><p className="text-[12px] text-ink-faint">{u.email}</p></Td>
                  <Td className="text-[13px]">{u.roles.join(", ") || "—"}</Td>
                  <Td>{!u.isActive ? <Badge tone="danger">Deactivated</Badge> : u.hasPassword ? <Badge tone="success">Active</Badge> : <Badge tone="warning">Invited</Badge>}</Td>
                  <Td className="text-[13px] text-ink-muted">{formatDateTime(u.lastLoginAt)}</Td>
                  <Td className="text-right">
                    {u.id !== actor.id && (
                      <ConfirmButton
                        variant="ghost"
                        label={u.isActive ? "Deactivate" : "Reactivate"}
                        danger={u.isActive}
                        title={u.isActive ? `Deactivate ${u.name}?` : `Reactivate ${u.name}?`}
                        body={u.isActive ? "They will be signed out everywhere immediately and cannot sign in. Their history is kept." : "They will be able to sign in again with their existing password."}
                        confirmLabel={u.isActive ? "Deactivate" : "Reactivate"}
                        action={setUserActiveAction.bind(null, u.id, !u.isActive)}
                      />
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
        <Section title="Invite a team member">
          <Panel className="p-5"><InviteForm roles={roleRows.map((r) => ({ key: r.key, name: r.name, description: r.description }))} /></Panel>
        </Section>
      </div>
    </>
  );
}
