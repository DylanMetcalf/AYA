import { and, desc, eq, ilike, lt, type SQL } from "drizzle-orm";
import { type Actor, requirePermission } from "@/server/auth/actor";
import type { Db } from "@/server/db/client";
import { auditEvents, users } from "@/server/db/schema";

export async function listAuditEvents(db: Db, actor: Actor, f: { category?: string; q?: string; before?: number } = {}) {
  requirePermission(actor, "audit.read");
  const conds: (SQL | undefined)[] = [];
  if (f.category === "security" || f.category === "business") conds.push(eq(auditEvents.category, f.category));
  if (f.q?.trim()) conds.push(ilike(auditEvents.summary, `%${f.q.trim()}%`));
  if (f.before) conds.push(lt(auditEvents.id, f.before));
  return db
    .select({ id: auditEvents.id, at: auditEvents.at, category: auditEvents.category, action: auditEvents.action, entityType: auditEvents.entityType, entityId: auditEvents.entityId, summary: auditEvents.summary, actorName: users.name })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorId))
    .where(and(...conds))
    .orderBy(desc(auditEvents.id))
    .limit(100);
}
