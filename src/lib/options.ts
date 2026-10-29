import { COMPONENT_TYPES, COMPONENT_TYPE_KEYS, RATE_BASES, RATE_BASIS_LABEL } from "@/lib/domain/components";

export const CURRENCY_OPTIONS = ["ZAR", "USD", "EUR", "GBP"].map((c) => ({ value: c, label: c }));
export const BASIS_OPTIONS = RATE_BASES.map((b) => ({ value: b, label: RATE_BASIS_LABEL[b] }));
export const COMPONENT_TYPE_OPTIONS = COMPONENT_TYPE_KEYS.map((k) => ({ value: k, label: COMPONENT_TYPES[k].label }));
export const RATE_TYPE_OPTIONS = [
  { value: "contracted", label: "Contracted rate" },
  { value: "trade", label: "Trade rate" },
  { value: "supplier_provided", label: "Supplier-provided rate" },
  { value: "public", label: "Publicly listed rate" },
  { value: "indicative", label: "Indicative estimate" },
  { value: "manual_estimate", label: "Manual estimate" },
];
export const RATE_TYPE_LABEL = Object.fromEntries(RATE_TYPE_OPTIONS.map((o) => [o.value, o.label])) as Record<string, string>;
