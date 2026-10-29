import "server-only";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, toActionError } from "@/server/action-result";
import type { Actor } from "@/server/auth/actor";
import { requireActor } from "@/server/auth/current";
import { flash } from "@/server/flash";

/**
 * Standard server-action wrapper: authenticate, run the service, then revalidate and flash on success.
 * Services perform their own authorisation; this never substitutes for it.
 */
export async function act<T>(
  fn: (actor: Actor) => Promise<T>,
  opts: { revalidate?: string[]; success?: string | ((r: T) => string); redirectTo?: string | ((r: T) => string) } = {},
): Promise<ActionState> {
  const actor = await requireActor();
  let result: T;
  try {
    result = await fn(actor);
  } catch (e) {
    return toActionError(e);
  }
  for (const p of opts.revalidate ?? []) revalidatePath(p);
  const message = typeof opts.success === "function" ? opts.success(result) : opts.success;
  if (message) await flash(message);
  if (opts.redirectTo) redirect(typeof opts.redirectTo === "function" ? opts.redirectTo(result) : opts.redirectTo);
  return { ok: true, message };
}

/** Single-valued FormData → plain object of strings (checkboxes become "on"). */
export const fields = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
export const checked = (fd: FormData, name: string) => fd.get(name) === "on";
