"use server";

import { redirect } from "next/navigation";
import { type ActionState, toActionError } from "@/server/action-result";
import { db } from "@/server/db/client";
import { activateInvitation } from "@/server/services/users";

export async function activateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("confirm") ?? "")) return { ok: false, fieldErrors: { confirm: ["Passwords do not match"] } };
  try {
    await activateInvitation(db, String(formData.get("token") ?? ""), password);
  } catch (e) {
    return toActionError(e);
  }
  redirect("/login?activated=1");
}
