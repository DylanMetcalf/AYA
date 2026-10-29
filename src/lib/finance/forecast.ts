/**
 * Target forecasting from actual data plus explicit assumptions. Nothing here invents history:
 * when inputs are missing the result says so.
 */
export interface ForecastInput {
  target: number;
  achieved: number;
  /** Values of historical confirmed bookings (in target currency). */
  historicalBookingValues: number[];
  /** Explicit conversion assumptions (0–100), entered by management. */
  conversion: { conservative: number | null; expected: number | null; optimistic: number | null };
  /** Historical quote decisions, used to show the observed conversion rate alongside assumptions. */
  decided: { accepted: number; declined: number };
  /** Minimum bookings before an average is considered meaningful. */
  minHistory?: number;
}

export type Scenario = { name: "conservative" | "expected" | "optimistic"; conversion: number; opportunitiesNeeded: number } | { name: "conservative" | "expected" | "optimistic"; conversion: null; opportunitiesNeeded: null };

export function forecastToTarget(i: ForecastInput) {
  const gap = Math.max(0, i.target - i.achieved);
  const minHistory = i.minHistory ?? 3;
  const n = i.historicalBookingValues.length;
  const avg = n >= minHistory ? i.historicalBookingValues.reduce((a, b) => a + b, 0) / n : null;
  const bookingsNeeded = gap === 0 ? 0 : avg ? Math.ceil(gap / avg) : null;
  const decidedTotal = i.decided.accepted + i.decided.declined;
  const observedConversion = decidedTotal >= 5 ? (i.decided.accepted / decidedTotal) * 100 : null;
  const scenarios: Scenario[] = (["conservative", "expected", "optimistic"] as const).map((name) => {
    const c = i.conversion[name];
    if (!c || c <= 0 || bookingsNeeded === null) return { name, conversion: null, opportunitiesNeeded: null };
    return { name, conversion: c, opportunitiesNeeded: Math.ceil(bookingsNeeded / (c / 100)) };
  });
  return {
    gap,
    progressPercent: i.target > 0 ? Math.min(100, (i.achieved / i.target) * 100) : 0,
    averageBookingValue: avg,
    historyCount: n,
    insufficientHistory: n < minHistory,
    bookingsNeeded,
    observedConversion,
    scenarios,
  };
}
