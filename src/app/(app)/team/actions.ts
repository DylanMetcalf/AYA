"use server";

import { revalidatePath } from "next/cache";
import { type ActionState, toActionError } from "@/server/action-result";
import { requireActor } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { inviteUser, setUserActive } from "@/server/services/users";

export type InviteState = (ActionState & { link?: string }) | null;

export async function inviteUserAction(_p: InviteState, fd: FormData): Promise<InviteState> {
  const actor = await requireActor();
  try {
    const { token } = await inviteUser(db, actor, { email: String(fd.get("email") ?? ""), name: String(fd.get("name") ?? ""), roleKeys: fd.getAll("roleKeys").map(String) });
    revalidatePath("/team");
    const base = process.env.APP_URL ?? "http://localhost:3000";
    // Email is not configured (docs/INTEGRATIONS.md); the admin shares this single-use link securely.
    return { ok: true, message: "Invitation created.", link: `${base}/activate?token=${encodeURIComponent(token)}` };
  } catch (e) {
    return toActionError(e);
  }
}

export async function setUserActiveAction(userId: string, active: boolean): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await setUserActive(db, actor, userId, active);
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/team");
  return { ok: true };
}
