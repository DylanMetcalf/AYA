import { D, type Dec } from "./money";

export interface FxRate {
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  source: string;
  effectiveDate: string;
}

export interface ResolvedRate {
  from: string;
  to: string;
  rate: Dec;
  /** Rate after the configured buffer (protects margin against currency movement). */
  bufferedRate: Dec;
  source: string;
  effectiveDate: string;
  /** True if derived by inverting the stored opposite pair. */
  inverted: boolean;
}

/**
 * Most recent rate effective on or before `onDate`. Falls back to inverting the opposite pair.
 * Returns null when no rate exists — callers must surface that, never assume 1:1.
 */
export function resolveRate(rates: FxRate[], from: string, to: string, onDate: string, bufferPercent: Dec = new D(0)): ResolvedRate | null {
  if (from === to) return { from, to, rate: new D(1), bufferedRate: new D(1), source: "Same currency", effectiveDate: onDate, inverted: false };
  const pick = (f: string, t: string) =>
    rates
      .filter((r) => r.fromCurrency === f && r.toCurrency === t && r.effectiveDate <= onDate)
      .sort((a, b) => (a.effectiveDate < b.effectiveDate ? 1 : -1))[0];
  const direct = pick(from, to);
  const inverse = direct ? undefined : pick(to, from);
  const base = direct ?? inverse;
  if (!base) return null;
  const rate = direct ? new D(direct.rate) : new D(1).div(new D(inverse!.rate));
  return {
    from,
    to,
    rate,
    bufferedRate: rate.times(bufferPercent.div(100).plus(1)),
    source: base.source,
    effectiveDate: base.effectiveDate,
    inverted: !direct,
  };
}
