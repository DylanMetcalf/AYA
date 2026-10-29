import { z } from "zod";

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const optText = (max: number) => z.preprocess(blankToNull, z.string().trim().max(max).nullish());
export const reqText = (max: number, msg = "Required") => z.string().trim().min(1, msg).max(max);
export const optDate = z.preprocess(blankToNull, z.iso.date("Enter a valid date").nullish());
export const reqDate = z.iso.date("Enter a valid date");
export const optUuid = z.preprocess(blankToNull, z.uuid().nullish());
export const optTime = z.preprocess(blankToNull, z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use HH:MM").nullish());
export const currencyCode = z.enum(["ZAR", "USD", "EUR", "GBP"]);
/** Non-negative decimal amount as a string (max 2 dp). Never parsed to a JS float. */
export const amount = z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter an amount like 1250.00");
export const optAmount = z.preprocess(blankToNull, amount.nullish());
export const positiveAmount = amount.refine((v) => Number(v) > 0, "Amount must be greater than zero");
export const percent = z.string().trim().regex(/^\d{1,3}(\.\d{1,2})?$/, "Enter a percentage like 20 or 12.5");
export const quantity = z.string().trim().regex(/^\d{1,8}(\.\d{1,2})?$/, "Enter a quantity");
export const optInt = (min = 0, max = 1_000_000) => z.preprocess(blankToNull, z.coerce.number().int().min(min).max(max).nullish());
export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
