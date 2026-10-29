import "server-only";
import { cookies } from "next/headers";

const FLASH = "ultima_flash";

/** Queue a short success message to show after the next navigation. */
export async function flash(message: string) {
  (await cookies()).set(FLASH, message.slice(0, 200), { path: "/", maxAge: 30, sameSite: "lax" });
}

export async function readFlash() {
  return (await cookies()).get(FLASH)?.value ?? null;
}
