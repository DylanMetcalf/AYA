"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { setSessionCookie } from "@/server/auth/current";
import { type ActionState, toActionError } from "@/server/action-result";
import { db } from "@/server/db/client";
import { login } from "@/server/services/users";

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const h = await headers();
  try {
    const { token, expiresAt } = await login(db, {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
      userAgent: h.get("user-agent"),
    });
    await setSessionCookie(token, expiresAt);
  } catch (e) {
    return toActionError(e);
  }
  const next = String(formData.get("next") ?? "/");
  // Only allow same-site relative redirects.
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
