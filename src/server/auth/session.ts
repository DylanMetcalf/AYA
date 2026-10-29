import { and, eq, gt, lt } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { sessions } from "@/server/db/schema";
import type { Actor } from "./actor";
import { generateToken, hashToken } from "./crypto";
import { loadActor } from "./load-actor";

export const SESSION_COOKIE = "ultima_session";
const DAY = 86_400_000;
export const SESSION_TTL_MS = 14 * DAY;

export async function createSession(db: DbOrTx, userId: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    ip: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
  });
  return { token, expiresAt };
}

/** Validates a session token, re-checks the user is active, and slides expiry past the halfway point. */
export async function validateSession(db: DbOrTx, token: string): Promise<{ actor: Actor; expiresAt: Date } | null> {
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));
  if (!session) return null;
  const actor = await loadActor(db, session.userId);
  if (!actor) {
    await db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }
  let expiresAt = session.expiresAt;
  if (expiresAt.getTime() - Date.now() < SESSION_TTL_MS / 2) {
    expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, session.id));
  }
  return { actor, expiresAt };
}

export const invalidateSession = (db: DbOrTx, token: string) =>
  db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));

export const invalidateUserSessions = (db: DbOrTx, userId: string) =>
  db.delete(sessions).where(eq(sessions.userId, userId));

export const purgeExpiredSessions = (db: DbOrTx) => db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
