import type { DbOrTx } from "@/server/db/client";
import { auditEvents } from "@/server/db/schema";

export interface AuditInput {
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  changes?: Record<string, unknown>;
  category?: "business" | "security";
}

/** Call inside the same transaction as the change so history and data never diverge. */
export async function audit(tx: DbOrTx, actorId: string | null, e: AuditInput) {
  await tx.insert(auditEvents).values({ actorId, category: e.category ?? "business", ...e });
}
