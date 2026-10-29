import { z } from "zod";
import { TRIP_STATUSES } from "@/lib/domain/trip-lifecycle";

export const SUPPORTED_CURRENCIES = ["ZAR", "USD", "EUR", "GBP"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullish();
const optionalDate = z
  .string()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.iso.date().nullable())
  .nullish();
const optionalUuid = z
  .string()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.uuid().nullable())
  .nullish();

export const tripFieldsSchema = z
  .object({
    name: z.string().trim().min(2, "Give the trip a name").max(200),
    primaryBrandId: z.uuid("Choose the primary brand"),
    guestFacingBrandId: z.uuid("Choose the guest-facing brand"),
    operatingCompanyId: optionalUuid,
    quotingCompanyId: optionalUuid,
    managerId: optionalUuid,
    leadGuestId: optionalUuid,
    startDate: optionalDate,
    endDate: optionalDate,
    adults: z.coerce.number().int().min(0).max(500),
    children: z.coerce.number().int().min(0).max(500),
    rooms: z.coerce.number().int().min(0).max(500),
    primaryDestination: optionalText(200),
    purpose: optionalText(200),
    occasion: optionalText(200),
    experienceStyle: optionalText(200),
    enquirySource: optionalText(120),
    currency: z.enum(SUPPORTED_CURRENCIES),
    estimatedValue: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .pipe(z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter an amount like 125000.00").nullable())
      .nullish(),
    internalNotes: optionalText(10_000),
    guestNotes: optionalText(10_000),
    specialRequirements: optionalText(5_000),
    participatingBrandIds: z.array(z.uuid()).default([]),
    supplyingBrandIds: z.array(z.uuid()).default([]),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    path: ["endDate"],
    message: "Return date must be on or after departure",
  })
  .refine((v) => v.adults + v.children > 0, { path: ["adults"], message: "At least one traveller is required" });

export type TripFieldsInput = z.input<typeof tripFieldsSchema>;
export type TripFields = z.output<typeof tripFieldsSchema>;

export const transitionSchema = z.object({
  to: z.enum(TRIP_STATUSES),
  reason: optionalText(2_000),
  override: z.boolean().default(false),
  expectedVersion: z.coerce.number().int(),
});
