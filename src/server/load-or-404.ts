import { notFound } from "next/navigation";
import { DomainError } from "@/server/errors";

/** For pages: maps a service's not-found (including out-of-scope records) to the 404 page. */
export async function loadOr404<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof DomainError && (e.code === "not_found" || e.code === "forbidden")) notFound();
    throw e;
  }
}
