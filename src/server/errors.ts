/** Domain errors thrown by services. Server actions translate them into safe user-facing messages. */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "forbidden" | "validation" | "conflict" | "unauthenticated",
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
  }
}
export const notFound = (what = "Record") => new DomainError(`${what} not found.`, "not_found");
export const forbidden = (msg = "You do not have permission to do that.") => new DomainError(msg, "forbidden");
export const conflict = (msg: string) => new DomainError(msg, "conflict");
export const invalid = (msg: string, details?: Record<string, string[]>) => new DomainError(msg, "validation", details);
