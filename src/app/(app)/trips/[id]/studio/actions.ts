"use server";

import type { ActionState } from "@/server/action-result";
import { act, checked, fields } from "@/server/act";
import { db } from "@/server/db/client";
import { addComponent, addDay, applyRate, generateDaysFromDates, moveComponent, removeComponent, removeDay, setBookingStatus, updateComponent, updateDay, type ComponentInput } from "@/server/services/itinerary";

const path = (tripId: string) => [`/trips/${tripId}/studio`, `/trips/${tripId}`, `/trips/${tripId}/commercial`];

/** Form → component input. Type-specific detail inputs are named `detail.<key>`. */
function componentFrom(fd: FormData): ComponentInput {
  const f = fields(fd);
  const details: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) if (k.startsWith("detail.") && v.trim()) details[k.slice(7)] = v.trim();
  return { ...(f as unknown as ComponentInput), details, includedInQuote: checked(fd, "includedInQuote") };
}

export async function addDayAction(tripId: string, _p: ActionState, fd: FormData) {
  return act((a) => addDay(db, a, tripId, fields(fd)), { revalidate: path(tripId), success: "Day added." });
}
export async function generateDaysAction(tripId: string) {
  return act((a) => generateDaysFromDates(db, a, tripId), { revalidate: path(tripId), success: "Days created from travel dates." });
}
export async function updateDayAction(tripId: string, dayId: string, _p: ActionState, fd: FormData) {
  return act((a) => updateDay(db, a, dayId, fields(fd)), { revalidate: path(tripId), success: "Day updated." });
}
export async function removeDayAction(tripId: string, dayId: string) {
  return act((a) => removeDay(db, a, dayId), { revalidate: path(tripId), success: "Day removed." });
}
export async function addComponentAction(tripId: string, dayId: string, _p: ActionState, fd: FormData) {
  return act((a) => addComponent(db, a, dayId, componentFrom(fd)), { revalidate: path(tripId), success: "Segment added." });
}
export async function updateComponentAction(tripId: string, componentId: string, _p: ActionState, fd: FormData) {
  return act((a) => updateComponent(db, a, componentId, componentFrom(fd)), { revalidate: path(tripId), success: "Segment saved." });
}
export async function moveComponentAction(tripId: string, componentId: string, move: { direction?: "up" | "down"; toDayId?: string }) {
  return act((a) => moveComponent(db, a, componentId, move), { revalidate: path(tripId) });
}
export async function removeComponentAction(tripId: string, componentId: string) {
  return act((a) => removeComponent(db, a, componentId), { revalidate: path(tripId), success: "Segment removed." });
}
export async function bookingAction(tripId: string, componentId: string, _p: ActionState, fd: FormData) {
  return act((a) => setBookingStatus(db, a, componentId, fields(fd) as never), { revalidate: [...path(tripId), "/bookings"], success: "Supplier arrangement updated." });
}
export async function applyRateAction(tripId: string, componentId: string, rateId: string) {
  return act((a) => applyRate(db, a, componentId, rateId), { revalidate: path(tripId), success: "Priced from approved supplier rate." });
}
export async function addFirstDayAction(tripId: string) {
  return act((a) => addDay(db, a, tripId, {}), { revalidate: path(tripId), success: "Day 1 added." });
}
