import { eq } from "drizzle-orm";
import { SYSTEM_ROLES } from "@/lib/auth/permissions";
import type { DbOrTx } from "@/server/db/client";
import { brands, legalCompanies, rolePermissions, roles, suppliers } from "@/server/db/schema";

/** Creates system roles if missing. Existing role permissions are left as administrators configured them. */
export async function ensureSystemRoles(db: DbOrTx) {
  for (const r of SYSTEM_ROLES) {
    const [existing] = await db.select().from(roles).where(eq(roles.key, r.key));
    if (existing) continue;
    const [role] = await db.insert(roles).values({ key: r.key, name: r.name, description: r.description, isSystem: true }).returning();
    await db.insert(rolePermissions).values(r.permissions.map((permission) => ({ roleId: role!.id, permission })));
  }
}

/**
 * Seeds the provisional company/brand structure. All legal details are unverified placeholders
 * (OPEN_DECISIONS D1, D2) and brand identities are marked provisional.
 */
export async function ensureBaseOrganisation(db: DbOrTx) {
  const [any] = await db.select({ id: brands.id }).from(brands).limit(1);
  if (any) return;
  const [ultimaCo] = await db
    .insert(legalCompanies)
    .values({ name: "ULTIMA (legal entity to be confirmed)", groupRole: "central_operator", notes: "Placeholder created at setup. Confirm registered name, registration and VAT numbers." })
    .returning();
  const [schmidtCo] = await db
    .insert(legalCompanies)
    .values({ name: "Schmidt Car Hire (legal entity to be confirmed)", groupRole: "connected_partner", notes: "Separate business supplying vehicles. Confirm legal and invoicing details." })
    .returning();
  await db.insert(brands).values([
    { slug: "ultima", name: "ULTIMA", kind: "operating", legalCompanyId: ultimaCo!.id, tagline: "Bespoke journeys, seamlessly coordinated", colorPrimary: "#1F3A2E", colorSecondary: "#F6F1E7", colorAccent: "#B08D57" },
    { slug: "aya", name: "AYA", kind: "trading", legalCompanyId: ultimaCo!.id, tagline: "Private. Personal. Flexible. By invitation only.", description: "Safari and wilderness brand.", colorPrimary: "#5B4A2F", colorSecondary: "#EDE4D0", colorAccent: "#A0703F" },
    { slug: "schmidt", name: "Schmidt Car Hire", kind: "partner", legalCompanyId: schmidtCo!.id, tagline: "Classic and specialist vehicles", colorPrimary: "#5E2329", colorSecondary: "#F1ECE4", colorAccent: "#2E2E2E" },
  ]);
  await db.insert(suppliers).values({ name: "Schmidt Car Hire", category: "vehicle_partner", legalCompanyId: schmidtCo!.id, region: "Mpumalanga / Limpopo", description: "Connected specialist vehicle partner." });
}
