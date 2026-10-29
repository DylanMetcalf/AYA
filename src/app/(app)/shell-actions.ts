"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { clearSessionCookie } from "@/server/auth/current";
import { SESSION_COOKIE, invalidateSession } from "@/server/auth/session";
import { BRAND_COOKIE } from "@/server/brand-context";
import { db } from "@/server/db/client";

export async function setBrandContext(formData: FormData) {
  const slug = String(formData.get("brand") ?? "");
  const jar = await cookies();
  if (!slug || slug === "all") jar.delete(BRAND_COOKIE);
  else if (/^[a-z0-9-]{1,50}$/.test(slug)) jar.set(BRAND_COOKIE, slug, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

export async function signOut() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await invalidateSession(db, token);
  await clearSessionCookie();
  redirect("/login");
}
