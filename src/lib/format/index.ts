const dateFmt = new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dateTimeFmt = new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" });

/** Formats an ISO date (YYYY-MM-DD) without timezone drift. */
export const formatDate = (d: string | null | undefined) => (d ? dateFmt.format(new Date(`${d}T00:00:00Z`)) : "—");
export const formatDateTime = (d: Date | string | null | undefined) => (d ? dateTimeFmt.format(new Date(d)) : "—");

export function formatDateRange(start: string | null, end: string | null) {
  if (!start && !end) return "Dates to be confirmed";
  if (!end || start === end) return formatDate(start);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

/** Display only. `amount` is a decimal string from the finance engine/DB; never parse money for maths here. */
export function formatMoney(amount: string | null | undefined, currency: string) {
  if (amount == null) return "—";
  const [int = "0", frac = "00"] = amount.replace(/^-/, "").split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const sign = amount.startsWith("-") ? "−" : "";
  return `${sign}${currency} ${grouped}.${frac.padEnd(2, "0").slice(0, 2)}`;
}

export const nights = (start: string | null, end: string | null) =>
  start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) : null;
