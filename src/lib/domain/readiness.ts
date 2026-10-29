import { BOOKING_STATUS_LABEL, COMPONENT_TYPES, type BookingStatus, type ComponentType, type ReadinessCategory } from "./components";

export type ItemState = "done" | "outstanding" | "not_required";
export interface ReadinessItem {
  key: string;
  label: string;
  category: ReadinessCategory | "financial" | "team";
  state: ItemState;
  /** Critical items block "ready to travel" regardless of overall completion. */
  critical: boolean;
  detail?: string;
}

export interface ReadinessInput {
  hasLeadGuest: boolean;
  hasDates: boolean;
  hasManager: boolean;
  components: { id: string; type: ComponentType; title: string; bookingStatus: BookingStatus; dayNumber: number }[];
  vehicleSegmentsWithoutAllocation: string[];
  allocations: { status: "provisional" | "confirmed" | "cancelled"; vehicleReady: boolean; label: string }[];
  openTasks: { title: string; priority: "low" | "normal" | "high" | "urgent" }[];
  commerciallyApproved: boolean;
  /** null = no quote accepted yet. */
  clientDepositOutstanding: boolean | null;
}

const isBooked = (s: BookingStatus) => s === "confirmed" || s === "completed";

/**
 * Builds a transparent readiness checklist. A trip is "ready" only when no critical item is
 * outstanding — a high percentage alone never means ready.
 */
export function assessReadiness(i: ReadinessInput) {
  const items: ReadinessItem[] = [
    { key: "lead", label: "Lead guest recorded", category: "guest", state: i.hasLeadGuest ? "done" : "outstanding", critical: true },
    { key: "dates", label: "Travel dates set", category: "guest", state: i.hasDates ? "done" : "outstanding", critical: true },
    { key: "manager", label: "Responsible trip manager", category: "team", state: i.hasManager ? "done" : "outstanding", critical: false },
    { key: "approval", label: "Commercial approval recorded", category: "financial", state: i.commerciallyApproved ? "done" : "outstanding", critical: true },
    {
      key: "deposit",
      label: "Client deposit received",
      category: "financial",
      state: i.clientDepositOutstanding === null ? "outstanding" : i.clientDepositOutstanding ? "outstanding" : "done",
      critical: false,
      detail: i.clientDepositOutstanding === null ? "No accepted quote yet" : undefined,
    },
  ];
  const active = i.components.filter((c) => c.bookingStatus !== "cancelled");
  if (!active.length) items.push({ key: "itinerary", label: "Itinerary built", category: "guest", state: "outstanding", critical: true });
  for (const c of active) {
    const def = COMPONENT_TYPES[c.type];
    if (c.type === "free_time" || c.type === "logistics") continue;
    items.push({
      key: `c-${c.id}`,
      label: `Day ${c.dayNumber}: ${c.title}`,
      category: def.category,
      state: c.bookingStatus === "unavailable" ? "outstanding" : isBooked(c.bookingStatus) ? "done" : "outstanding",
      critical: def.critical,
      detail: BOOKING_STATUS_LABEL[c.bookingStatus],
    });
  }
  for (const title of i.vehicleSegmentsWithoutAllocation) items.push({ key: `va-${title}`, label: `Vehicle allocated: ${title}`, category: "transport", state: "outstanding", critical: true });
  for (const a of i.allocations.filter((x) => x.status !== "cancelled")) {
    items.push({ key: `al-${a.label}`, label: `Allocation confirmed: ${a.label}`, category: "transport", state: a.status === "confirmed" ? "done" : "outstanding", critical: true });
    items.push({ key: `vr-${a.label}`, label: `Vehicle ready: ${a.label}`, category: "transport", state: a.vehicleReady ? "done" : "outstanding", critical: true, detail: a.vehicleReady ? undefined : "Inspection sign-off or defect resolution outstanding" });
  }
  for (const t of i.openTasks) items.push({ key: `t-${t.title}`, label: `Task: ${t.title}`, category: "team", state: "outstanding", critical: t.priority === "urgent" });

  const required = items.filter((x) => x.state !== "not_required");
  const done = required.filter((x) => x.state === "done").length;
  const criticalOutstanding = required.filter((x) => x.critical && x.state === "outstanding");
  return {
    items,
    done,
    total: required.length,
    percent: required.length ? Math.round((done / required.length) * 100) : 0,
    criticalOutstanding,
    ready: criticalOutstanding.length === 0 && done === required.length,
  };
}
