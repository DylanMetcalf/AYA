import { asc, eq } from "drizzle-orm";
import type { z } from "zod";
import { brandSchema, legalCompanySchema } from "@/lib/validation/org";
import { type Actor, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit";
import type { Db, DbOrTx } from "@/server/db/client";
import { brands, legalCompanies } from "@/server/db/schema";
import { notFound } from "@/server/errors";

export const listLegalCompanies = (db: DbOrTx) => db.select().from(legalCompanies).orderBy(asc(legalCompanies.name));
export const listAllBrands = (db: DbOrTx) => db.select().from(brands).orderBy(asc(brands.name));

function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(after)) if (before[k] !== after[k]) out[k] = { from: before[k], to: after[k] };
  return out;
}

export async function updateBrand(db: Db, actor: Actor, id: string, raw: z.input<typeof brandSchema>) {
  requirePermission(actor, "admin.settings");
  const v = brandSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(brands).where(eq(brands.id, id)).for("update");
    if (!before) throw notFound("Brand");
    await tx.update(brands).set({ ...v, updatedAt: new Date() }).where(eq(brands.id, id));
    await audit(tx, actor.id, { action: "brand.updated", entityType: "brand", entityId: id, summary: `Updated brand ${v.name}`, changes: diff(before, v) });
  });
}

export async function upsertLegalCompany(db: Db, actor: Actor, id: string | null, raw: z.input<typeof legalCompanySchema>) {
  requirePermission(actor, "admin.settings");
  const v = legalCompanySchema.parse(raw);
  return db.transaction(async (tx) => {
    if (!id) {
      const [c] = await tx.insert(legalCompanies).values(v).returning();
      await audit(tx, actor.id, { action: "company.created", entityType: "legal_company", entityId: c!.id, summary: `Added legal company ${v.name}` });
      return c!;
    }
    const [before] = await tx.select().from(legalCompanies).where(eq(legalCompanies.id, id)).for("update");
    if (!before) throw notFound("Company");
    const [c] = await tx.update(legalCompanies).set({ ...v, updatedAt: new Date() }).where(eq(legalCompanies.id, id)).returning();
    await audit(tx, actor.id, { action: "company.updated", entityType: "legal_company", entityId: id, summary: `Updated legal company ${v.name}`, changes: diff(before, v) });
    return c!;
  });
}
