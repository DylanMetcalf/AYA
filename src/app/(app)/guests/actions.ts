"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { GuestInput } from "@/lib/validation/guest";
import { type ActionState, toActionError } from "@/server/action-result";
import { requireActor } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { createGuest, updateGuest } from "@/server/services/guests";

const formToGuest = (fd: FormData): GuestInput => {
  const s = (k: string) => String(fd.get(k) ?? "");
  return {
    firstName: s("firstName"), lastName: s("lastName"), email: s("email"), phone: s("phone"), nationality: s("nationality"),
    preferences: s("preferences"), dietary: s("dietary"), accessibility: s("accessibility"), medicalNotes: s("medicalNotes"),
    relationshipNotes: s("relationshipNotes"), marketingConsent: fd.get("marketingConsent") === "on",
  };
};

export async function createGuestAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let id: string;
  try {
    id = (await createGuest(db, actor, formToGuest(fd))).id;
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/guests");
  redirect(`/guests/${id}?saved=1`);
}

export async function updateGuestAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await updateGuest(db, actor, id, formToGuest(fd));
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath(`/guests/${id}`);
  return { ok: true, message: "Guest saved." };
}
