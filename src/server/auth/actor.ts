import type { Permission } from "@/lib/auth/permissions";
import { forbidden } from "@/server/errors";

/** The authenticated user performing an operation. Services receive this explicitly. */
export interface Actor {
  id: string;
  name: string;
  email: string;
  roleKeys: string[];
  roleNames: string[];
  permissions: ReadonlySet<Permission>;
}

export const can = (actor: Actor, permission: Permission) => actor.permissions.has(permission);

export function requirePermission(actor: Actor, ...required: Permission[]) {
  for (const p of required) if (!actor.permissions.has(p)) throw forbidden();
}
