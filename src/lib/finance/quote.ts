import { COMPONENT_TYPES, type ComponentType, type RateBasis } from "@/lib/domain/components";
import { componentCost, type ComponentCost } from "./costing";
import { type FxRate, type ResolvedRate, resolveRate } from "./fx";
import { D, type Dec, dec, fmt2, round2, sum } from "./money";
import { marginPercent, markupPercent, percentOf, sellFromMargin, sellFromMarkup } from "./pricing";

export interface CostingComponent {
  id: string;
  dayNumber: number;
  dayTitle: string | null;
  dayLocation: string | null;
  position: number;
  type: ComponentType;
  title: string;
  startTime: string | null;
  endTime: string | null;
  startLocation: string | null;
  endLocation: string | null;
  guestDescription: string | null;
  includedInQuote: boolean;
  costCurrency: string | null;
  unitCost: string | null;
  quantity: string | null;
  minimumCharge: string | null;
  costBasis: RateBasis | null;
  supplierName: string | null;
  supplierRateId: string | null;
  rateVersion: number | null;
  operatingBrandName: string | null;
}

export interface CostedLine {
  component: CostingComponent;
  cost: ComponentCost | null;
  fx: ResolvedRate | null;
  /** Cost in the quote currency, rounded to cents; null if cost or rate is missing. */
  converted: Dec | null;
  issue: "no_cost" | "no_rate" | null;
}

export interface TripCosting {
  currency: string;
  lines: CostedLine[];
  totalCost: Dec;
  issues: CostedLine[];
  byCategory: Record<string, Dec>;
  byOperatingBrand: Record<string, Dec>;
}

/** Costs every included component in the quote currency. Missing costs/rates are reported, never guessed. */
export function costTrip(components: CostingComponent[], opts: { currency: string; rates: FxRate[]; onDate: string; fxBufferPercent?: string }): TripCosting {
  const buffer = dec(opts.fxBufferPercent ?? "0");
  const lines: CostedLine[] = components.map((component) => {
    const cost = componentCost({ unitCost: component.unitCost, quantity: component.quantity, minimumCharge: component.minimumCharge, basis: component.costBasis, currency: component.costCurrency });
    if (!component.includedInQuote) return { component, cost, fx: null, converted: null, issue: null };
    if (!cost || !component.costCurrency) return { component, cost, fx: null, converted: null, issue: "no_cost" };
    const fx = resolveRate(opts.rates, component.costCurrency, opts.currency, opts.onDate, buffer);
    if (!fx) return { component, cost, fx: null, converted: null, issue: "no_rate" };
    return { component, cost, fx, converted: round2(cost.amount.times(fx.bufferedRate)), issue: null };
  });
  const priced = lines.filter((l) => l.converted);
  const byCategory: Record<string, Dec> = {};
  const byOperatingBrand: Record<string, Dec> = {};
  for (const l of priced) {
    const cat = COMPONENT_TYPES[l.component.type].category;
    byCategory[cat] = (byCategory[cat] ?? new D(0)).plus(l.converted!);
    const b = l.component.operatingBrandName ?? "Unassigned";
    byOperatingBrand[b] = (byOperatingBrand[b] ?? new D(0)).plus(l.converted!);
  }
  return {
    currency: opts.currency,
    lines,
    totalCost: sum(priced.map((l) => l.converted!)),
    issues: lines.filter((l) => l.issue),
    byCategory,
    byOperatingBrand,
  };
}

export interface PricingInput {
  mode: "margin" | "markup";
  percent: string;
  discountPercent?: string;
  commissionPercent?: string;
}

export interface PricingResult {
  cost: Dec;
  sellBeforeDiscount: Dec;
  discount: Dec;
  sell: Dec;
  commission: Dec;
  grossProfit: Dec;
  marginPercent: Dec | null;
  markupPercent: Dec | null;
}

/** Applies the pricing method to a total cost. Discount reduces the price; commission is a cost of sale. */
export function priceFromCost(totalCost: Dec, p: PricingInput): PricingResult {
  const pct = dec(p.percent);
  const sellBeforeDiscount = round2(p.mode === "margin" ? sellFromMargin(totalCost, pct) : sellFromMarkup(totalCost, pct));
  const discountPct = dec(p.discountPercent ?? "0");
  const commissionPct = dec(p.commissionPercent ?? "0");
  if (discountPct.lt(0) || discountPct.gt(100) || commissionPct.lt(0) || commissionPct.gt(100)) throw new Error("Discount and commission must be between 0% and 100%");
  const discount = round2(percentOf(sellBeforeDiscount, discountPct));
  const sell = sellBeforeDiscount.minus(discount);
  const commission = round2(percentOf(sell, commissionPct));
  const grossProfit = sell.minus(totalCost).minus(commission);
  return {
    cost: totalCost,
    sellBeforeDiscount,
    discount,
    sell,
    commission,
    grossProfit,
    marginPercent: marginPercent(sell, totalCost.plus(commission)),
    markupPercent: markupPercent(sell, totalCost.plus(commission)),
  };
}

/** Everything a quote presented, frozen at generation. Stored as JSONB; never recomputed. */
export interface QuoteSnapshot {
  schemaVersion: 1;
  generatedAt: string;
  trip: { reference: string; name: string; startDate: string | null; endDate: string | null; adults: number; children: number; rooms: number; leadGuestName: string | null };
  brand: { name: string; tagline: string | null; colorPrimary: string; colorAccent: string; contactEmail: string | null; contactPhone: string | null; website: string | null; documentFooter: string | null; quotingEntity: string | null };
  currency: string;
  pricing: { mode: "margin" | "markup"; percent: string; discountPercent: string; commissionPercent: string; fxBufferPercent: string };
  fx: { from: string; to: string; rate: string; bufferedRate: string; source: string; effectiveDate: string; inverted: boolean }[];
  lines: { componentId: string; dayNumber: number; type: string; title: string; supplierName: string | null; supplierRateId: string | null; rateVersion: number | null; originalCurrency: string; originalAmount: string; calculation: string; convertedCost: string }[];
  excluded: { componentId: string; title: string }[];
  totals: { cost: string; sellBeforeDiscount: string; discount: string; sell: string; commission: string; grossProfit: string; marginPercent: string | null; markupPercent: string | null; perPerson: string | null };
  itinerary: { dayNumber: number; date: string | null; title: string | null; location: string | null; items: { time: string | null; title: string; description: string | null; type: string }[] }[];
  terms: { depositPercent: string | null; depositDueDate: string | null; balanceDueDate: string | null; validUntil: string | null; inclusions: string | null; exclusions: string | null; terms: string | null };
}

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function buildSnapshot(args: {
  costing: TripCosting;
  pricing: PricingResult;
  pricingInput: PricingInput & { fxBufferPercent: string };
  trip: QuoteSnapshot["trip"];
  brand: QuoteSnapshot["brand"];
  terms: QuoteSnapshot["terms"];
  generatedAt?: Date;
}): QuoteSnapshot {
  const { costing, pricing, trip } = args;
  if (costing.issues.length) throw new Error("Cannot build a quote while components are missing costs or exchange rates");
  const fxSeen = new Map<string, ResolvedRate>();
  for (const l of costing.lines) if (l.fx && l.fx.from !== l.fx.to) fxSeen.set(`${l.fx.from}>${l.fx.to}`, l.fx);
  const travellers = trip.adults + trip.children;
  const days = new Map<number, QuoteSnapshot["itinerary"][number]>();
  for (const l of [...costing.lines].sort((a, b) => a.component.dayNumber - b.component.dayNumber || a.component.position - b.component.position)) {
    const c = l.component;
    const day = days.get(c.dayNumber) ?? { dayNumber: c.dayNumber, date: trip.startDate ? addDays(trip.startDate, c.dayNumber - 1) : null, title: c.dayTitle, location: c.dayLocation, items: [] };
    day.items.push({ time: c.startTime?.slice(0, 5) ?? null, title: c.title, description: c.guestDescription, type: c.type });
    days.set(c.dayNumber, day);
  }
  return {
    schemaVersion: 1,
    generatedAt: (args.generatedAt ?? new Date()).toISOString(),
    trip,
    brand: args.brand,
    currency: costing.currency,
    pricing: {
      mode: args.pricingInput.mode,
      percent: args.pricingInput.percent,
      discountPercent: args.pricingInput.discountPercent ?? "0",
      commissionPercent: args.pricingInput.commissionPercent ?? "0",
      fxBufferPercent: args.pricingInput.fxBufferPercent,
    },
    fx: [...fxSeen.values()].map((f) => ({ from: f.from, to: f.to, rate: f.rate.toFixed(8), bufferedRate: f.bufferedRate.toFixed(8), source: f.source, effectiveDate: f.effectiveDate, inverted: f.inverted })),
    lines: costing.lines.filter((l) => l.converted).map((l) => ({
      componentId: l.component.id,
      dayNumber: l.component.dayNumber,
      type: l.component.type,
      title: l.component.title,
      supplierName: l.component.supplierName,
      supplierRateId: l.component.supplierRateId,
      rateVersion: l.component.rateVersion,
      originalCurrency: l.component.costCurrency!,
      originalAmount: fmt2(l.cost!.amount),
      calculation: l.cost!.explanation,
      convertedCost: fmt2(l.converted!),
    })),
    excluded: costing.lines.filter((l) => !l.component.includedInQuote).map((l) => ({ componentId: l.component.id, title: l.component.title })),
    totals: {
      cost: fmt2(pricing.cost),
      sellBeforeDiscount: fmt2(pricing.sellBeforeDiscount),
      discount: fmt2(pricing.discount),
      sell: fmt2(pricing.sell),
      commission: fmt2(pricing.commission),
      grossProfit: fmt2(pricing.grossProfit),
      marginPercent: pricing.marginPercent ? pricing.marginPercent.toFixed(2) : null,
      markupPercent: pricing.markupPercent ? pricing.markupPercent.toFixed(2) : null,
      perPerson: travellers > 0 ? fmt2(pricing.sell.div(travellers)) : null,
    },
    itinerary: [...days.values()],
    terms: args.terms,
  };
}

/** Outstanding = amount due − amount paid (never negative; overpayment reported separately). */
export function balance(due: Dec, paid: Dec) {
  const diff = due.minus(paid);
  return { outstanding: diff.gt(0) ? diff : new D(0), overpaid: diff.lt(0) ? diff.neg() : new D(0) };
}
