import { desc } from "drizzle-orm";
import { z } from "zod";
import { currencyCode, reqDate, reqText } from "@/lib/validation/common";
import { type Actor, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit";
import type { Db, DbOrTx } from "@/server/db/client";
import { currencyRates } from "@/server/db/schema";
import { invalid } from "@/server/errors";

export const listFxRates = (db: DbOrTx) => db.select().from(currencyRates).orderBy(desc(currencyRates.effectiveDate), desc(currencyRates.createdAt));

const fxSchema = z.object({
  fromCurrency: currencyCode,
  toCurrency: currencyCode,
  rate: z.string().trim().regex(/^\d{1,8}(\.\d{1,8})?$/, "Enter a rate like 18.2450"),
  source: reqText(200, "Record the source, e.g. “Bank quote — FNB, 09:00”"),
  effectiveDate: reqDate,
});

/** Manual exchange rate entered by Finance. Never presented as a live market rate. */
export async function addFxRate(db: Db, actor: Actor, raw: z.input<typeof fxSchema>) {
  requirePermission(actor, "finance.edit");
  const v = fxSchema.parse(raw);
  if (v.fromCurrency === v.toCurrency) throw invalid("Choose two different currencies.");
  if (Number(v.rate) <= 0) throw invalid("Rate must be greater than zero.");
  return db.transaction(async (tx) => {
    const [r] = await tx.insert(currencyRates).values({ ...v, isManual: true, createdById: actor.id }).returning();
    await audit(tx, actor.id, { action: "fx.rate_added", entityType: "currency_rate", entityId: r!.id, summary: `1 ${v.fromCurrency} = ${v.rate} ${v.toCurrency} from ${v.effectiveDate} (${v.source})` });
    return r!;
  });
}
