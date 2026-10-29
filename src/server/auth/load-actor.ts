import { eq } from "drizzle-orm";
import type { Permission } from "@/lib/auth/permissions";
import type { DbOrTx } from "@/server/db/client";
import { rolePermissions, roles, userRoles, users } from "@/server/db/schema";
import type { Actor } from "./actor";

/** Loads an active user's roles and permissions. Returns null for unknown or deactivated users. */
export async function loadActor(db: DbOrTx, userId: string): Promise<Actor | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !user.isActive) return null;
  const rows = await db
    .select({ key: roles.key, permission: rolePermissions.permission })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .where(eq(userRoles.userId, userId));
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleKeys: [...new Set(rows.map((r) => r.key))],
    permissions: new Set(rows.flatMap((r) => (r.permission ? [r.permission as Permission] : []))),
  };
}
