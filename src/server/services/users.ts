import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { type Actor, requirePermission } from "@/server/auth/actor";
import { MIN_PASSWORD_LENGTH, generateToken, hashPassword, hashToken, verifyPassword } from "@/server/auth/crypto";
import { rateLimit } from "@/server/auth/rate-limit";
import { createSession, invalidateUserSessions } from "@/server/auth/session";
import { audit } from "@/server/audit";
import type { Db } from "@/server/db/client";
import { invitations, roles, userRoles, users } from "@/server/db/schema";
import { conflict, invalid, notFound } from "@/server/errors";

const INVITE_TTL_MS = 7 * 86_400_000;
const GENERIC_LOGIN_ERROR = "Email or password is incorrect.";
let dummyHash: Promise<string> | undefined;

export async function login(db: Db, input: { email: string; password: string; ip?: string | null; userAgent?: string | null }) {
  const email = input.email.trim().toLowerCase();
  if (!rateLimit(`login:${email}:${input.ip ?? ""}`, 10, 15 * 60_000)) {
    throw invalid("Too many sign-in attempts. Please wait 15 minutes and try again.");
  }
  const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
  // Verify against a dummy hash when the user is unknown to keep timing similar.
  dummyHash ??= hashPassword("timing-equaliser-not-a-real-password");
  const ok = await verifyPassword(user?.passwordHash ?? (await dummyHash), input.password) && !!user?.passwordHash;
  if (!user || !ok || !user.isActive) {
    await audit(db, user?.id ?? null, {
      category: "security",
      action: "auth.login_failed",
      entityType: "user",
      entityId: user?.id ?? "unknown",
      summary: `Failed sign-in for ${email}`,
    });
    throw invalid(GENERIC_LOGIN_ERROR);
  }
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await audit(db, user.id, { category: "security", action: "auth.login", entityType: "user", entityId: user.id, summary: "Signed in" });
  return createSession(db, user.id, input);
}

export const inviteSchema = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(1).max(120),
  roleKeys: z.array(z.string()).min(1, "Select at least one role"),
});

/** Creates an inactive-password user and returns a single-use activation token (shown once to the admin). */
export async function inviteUser(db: Db, actor: Actor, raw: z.input<typeof inviteSchema>) {
  requirePermission(actor, "admin.users");
  const input = inviteSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${input.email.toLowerCase()}`);
    if (existing) throw conflict("A user with this email already exists.");
    const roleRows = await tx.select().from(roles).where(inArray(roles.key, input.roleKeys));
    if (roleRows.length !== input.roleKeys.length) throw invalid("Unknown role selected.");
    const [user] = await tx.insert(users).values({ email: input.email, name: input.name }).returning();
    await tx.insert(userRoles).values(roleRows.map((r) => ({ userId: user!.id, roleId: r.id })));
    const token = generateToken();
    await tx.insert(invitations).values({
      userId: user!.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      createdById: actor.id,
    });
    await audit(tx, actor.id, {
      category: "security",
      action: "user.invited",
      entityType: "user",
      entityId: user!.id,
      summary: `Invited ${input.name} (${input.email}) as ${roleRows.map((r) => r.name).join(", ")}`,
      changes: { roles: input.roleKeys },
    });
    return { userId: user!.id, token };
  });
}

export async function activateInvitation(db: Db, token: string, password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) throw invalid(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    // Lock the invitation row so a token cannot be redeemed twice concurrently.
    const [inv] = await tx
      .select()
      .from(invitations)
      .where(and(eq(invitations.tokenHash, hashToken(token)), isNull(invitations.usedAt), gt(invitations.expiresAt, new Date())))
      .for("update");
    if (!inv) throw invalid("This invitation link is invalid or has expired.");
    await tx.update(invitations).set({ usedAt: new Date() }).where(eq(invitations.id, inv.id));
    await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, inv.userId));
    await audit(tx, inv.userId, { category: "security", action: "user.activated", entityType: "user", entityId: inv.userId, summary: "Account activated" });
    return inv.userId;
  });
}

export async function listUsers(db: Db, actor: Actor) {
  requirePermission(actor, "admin.users");
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, isActive: users.isActive, lastLoginAt: users.lastLoginAt, hasPassword: sql<boolean>`${users.passwordHash} is not null`, roleName: roles.name })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(roles, eq(roles.id, userRoles.roleId))
    .orderBy(asc(users.name));
  const map = new Map<string, Omit<(typeof rows)[number], "roleName"> & { roles: string[] }>();
  for (const { roleName, ...u } of rows) {
    const entry = map.get(u.id) ?? { ...u, roles: [] };
    if (roleName) entry.roles.push(roleName);
    map.set(u.id, entry);
  }
  return [...map.values()];
}

export async function setUserActive(db: Db, actor: Actor, userId: string, active: boolean) {
  requirePermission(actor, "admin.users");
  if (userId === actor.id && !active) throw invalid("You cannot deactivate your own account.");
  await db.transaction(async (tx) => {
    const [u] = await tx.update(users).set({ isActive: active, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
    if (!u) throw notFound("User");
    if (!active) await invalidateUserSessions(tx, userId);
    await audit(tx, actor.id, {
      category: "security",
      action: active ? "user.reactivated" : "user.deactivated",
      entityType: "user",
      entityId: userId,
      summary: `${active ? "Reactivated" : "Deactivated"} ${u.name}`,
    });
  });
}

export async function listAssignableUsers(db: Db) {
  return db.select({ id: users.id, name: users.name }).from(users).where(eq(users.isActive, true)).orderBy(asc(users.name));
}
