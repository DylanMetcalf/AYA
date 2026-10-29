import "server-only";
import { cookies } from "next/headers";

export const BRAND_COOKIE = "ultima_brand";

/** Selected brand slug for filtering overviews, or null for all brands. A view preference, not a security boundary. */
export async function getBrandContext(): Promise<string | null> {
  const v = (await cookies()).get(BRAND_COOKIE)?.value;
  return v && /^[a-z0-9-]{1,50}$/.test(v) ? v : null;
}
