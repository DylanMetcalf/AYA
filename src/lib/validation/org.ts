import { z } from "zod";

const opt = (max: number) => z.string().trim().max(max).transform((v) => (v === "" ? null : v)).nullish();
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #1F3A2E");

export const brandSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["operating", "trading", "partner"]),
  legalCompanyId: z.string().transform((v) => (v === "" ? null : v)).pipe(z.uuid().nullable()).nullish(),
  tagline: opt(200),
  description: opt(5000),
  colorPrimary: hex,
  colorSecondary: hex,
  colorAccent: hex,
  contactEmail: z.string().trim().transform((v) => (v === "" ? null : v)).pipe(z.email().nullable()).nullish(),
  contactPhone: opt(50),
  website: opt(200),
  documentFooter: opt(2000),
  isProvisional: z.boolean(),
});

export const legalCompanySchema = z.object({
  name: z.string().trim().min(1).max(200),
  registrationNumber: opt(100),
  vatNumber: opt(100),
  country: z.string().trim().toUpperCase().length(2),
  address: opt(1000),
  baseCurrency: z.enum(["ZAR", "USD", "EUR", "GBP"]),
  groupRole: z.enum(["central_operator", "group_company", "connected_partner", "supplier", "other"]),
  verified: z.boolean(),
  notes: opt(5000),
});
