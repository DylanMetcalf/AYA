import { z } from "zod";

const opt = (max: number) => z.string().trim().max(max).transform((v) => (v === "" ? null : v)).nullish();

export const guestSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  email: z.string().trim().max(254).transform((v) => (v === "" ? null : v)).pipe(z.email("Enter a valid email").nullable()).nullish(),
  phone: opt(50),
  nationality: z.string().trim().toUpperCase().transform((v) => (v === "" ? null : v)).pipe(z.string().length(2, "Use a 2-letter country code").nullable()).nullish(),
  preferences: opt(5000),
  dietary: opt(2000),
  accessibility: opt(2000),
  medicalNotes: opt(2000),
  relationshipNotes: opt(5000),
  marketingConsent: z.boolean().default(false),
});
export type GuestInput = z.input<typeof guestSchema>;
