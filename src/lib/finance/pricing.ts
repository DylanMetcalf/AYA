import { D, type Dec } from "./money";

/**
 * Margin vs markup — deliberately separate functions.
 *   markup  = profit ÷ cost.   R10 000 cost + 20% markup  → R12 000 sell.
 *   margin  = profit ÷ sell.   R10 000 cost at 20% margin → R12 500 sell.
 */
export function sellFromMarkup(cost: Dec, markupPercent: Dec): Dec {
  if (markupPercent.lt(0)) throw new Error("Markup cannot be negative");
  return cost.times(markupPercent.div(100).plus(1));
}

export function sellFromMargin(cost: Dec, marginPercent: Dec): Dec {
  if (marginPercent.lt(0) || marginPercent.gte(100)) throw new Error("Margin must be at least 0% and below 100%");
  return cost.div(new D(1).minus(marginPercent.div(100)));
}

export const grossProfit = (sell: Dec, cost: Dec) => sell.minus(cost);

/** Gross margin % of selling price; null when there is no positive selling price. */
export const marginPercent = (sell: Dec, cost: Dec): Dec | null => (sell.lte(0) ? null : sell.minus(cost).div(sell).times(100));

/** Markup % on cost; null when cost is zero or negative. */
export const markupPercent = (sell: Dec, cost: Dec): Dec | null => (cost.lte(0) ? null : sell.minus(cost).div(cost).times(100));

export const percentOf = (amount: Dec, pct: Dec) => amount.times(pct).div(100);
