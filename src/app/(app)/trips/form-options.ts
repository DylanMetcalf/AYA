import "server-only";
import type { TripFormValues } from "@/components/trips/trip-form";
import type { Actor } from "@/server/auth/actor";
import { can } from "@/server/auth/actor";
import { db } from "@/server/db/client";
import type { trips } from "@/server/db/schema";
import { guestOptions } from "@/server/services/guests";
import { listLegalCompanies } from "@/server/services/org";
import { listBrands } from "@/server/services/trips";
import { listAssignableUsers } from "@/server/services/users";

export async function tripFormOptions(actor: Actor) {
  const [brands, companies, users, guests] = await Promise.all([
    listBrands(db),
    listLegalCompanies(db),
    listAssignableUsers(db),
    can(actor, "guest.read") ? guestOptions(db, actor) : Promise.resolve([]),
  ]);
  return {
    brandRows: brands,
    companyRows: companies,
    brands: brands.map((b) => ({ value: b.id, label: b.name })),
    companies: companies.map((c) => ({ value: c.id, label: c.name })),
    users: users.map((u) => ({ value: u.id, label: u.name })),
    guests: guests.map((g) => ({ value: g.id, label: g.label })),
  };
}

export function tripToFormValues(t: typeof trips.$inferSelect, brandRows: { brandId: string; role: string }[]): TripFormValues {
  return {
    name: t.name,
    primaryBrandId: t.primaryBrandId,
    guestFacingBrandId: t.guestFacingBrandId,
    operatingCompanyId: t.operatingCompanyId ?? "",
    quotingCompanyId: t.quotingCompanyId ?? "",
    managerId: t.managerId ?? "",
    leadGuestId: t.leadGuestId ?? "",
    startDate: t.startDate ?? "",
    endDate: t.endDate ?? "",
    adults: t.adults,
    children: t.children,
    rooms: t.rooms,
    primaryDestination: t.primaryDestination ?? "",
    purpose: t.purpose ?? "",
    occasion: t.occasion ?? "",
    experienceStyle: t.experienceStyle ?? "",
    enquirySource: t.enquirySource ?? "",
    currency: t.currency,
    estimatedValue: t.estimatedValue ?? "",
    internalNotes: t.internalNotes ?? "",
    guestNotes: t.guestNotes ?? "",
    specialRequirements: t.specialRequirements ?? "",
    participatingBrandIds: brandRows.filter((b) => b.role === "participating").map((b) => b.brandId),
    supplyingBrandIds: brandRows.filter((b) => b.role === "supplying").map((b) => b.brandId),
  };
}
