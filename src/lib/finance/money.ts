import Decimal from "decimal.js";

/**
 * Money primitives. All financial maths in the application goes through src/lib/finance.
 * Rounding policy (docs/FINANCIAL_ENGINE.md): full precision internally; round HALF-UP to 2 dp at
 * (1) a component's cost, (2) each line converted to the quote currency, (3) the final selling price.
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof D>;
export type MoneyInput = string | number | Dec;

export const dec = (v: MoneyInput | null | undefined): Dec => {
  if (v === null || v === undefined || v === "") return new D(0);
  if (typeof v === "number" && !Number.isInteger(v)) throw new Error("Pass non-integer amounts as strings to avoid float error");
  return new D(v);
};

export const round2 = (v: Dec) => v.toDecimalPlaces(2, D.ROUND_HALF_UP);
/** Canonical 2-dp string for storage and display. */
export const fmt2 = (v: Dec) => round2(v).toFixed(2);
export const isValidAmount = (s: string) => /^-?\d{1,12}(\.\d{1,2})?$/.test(s.trim());
export const sum = (vals: Dec[]) => vals.reduce((a, b) => a.plus(b), new D(0));
