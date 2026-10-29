import { ZodError } from "zod";
import { DomainError } from "@/server/errors";

export type ActionState = { ok: boolean; message?: string; fieldErrors?: Record<string, string[]> } | null;

/** Converts service errors into a safe, user-facing action state. Unknown errors are logged, not exposed. */
export function toActionError(e: unknown): ActionState {
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of e.issues) {
      const key = issue.path.join(".") || "_";
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return { ok: false, message: "Please correct the highlighted fields.", fieldErrors };
  }
  if (e instanceof DomainError) return { ok: false, message: e.message, fieldErrors: e.details };
  // Let Next.js redirect/notFound control-flow errors propagate.
  if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
  console.error("[action] unexpected error", e);
  return { ok: false, message: "Something went wrong. The error has been logged; please try again." };
}
