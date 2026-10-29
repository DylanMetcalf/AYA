"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { TripFieldsInput } from "@/lib/validation/trip";
import { type ActionState, toActionError } from "@/server/action-result";
import { requireActor } from "@/server/auth/current";
import { db } from "@/server/db/client";
import {
  createTrip,
  duplicateTrip,
  recordCommercialApproval,
  setTripArchived,
  transitionTrip,
  updateTrip,
} from "@/server/services/trips";

function formToTrip(fd: FormData): TripFieldsInput {
  const s = (k: string) => String(fd.get(k) ?? "");
  return {
    name: s("name"),
    primaryBrandId: s("primaryBrandId"),
    guestFacingBrandId: s("guestFacingBrandId"),
    operatingCompanyId: s("operatingCompanyId"),
    quotingCompanyId: s("quotingCompanyId"),
    managerId: s("managerId"),
    leadGuestId: s("leadGuestId"),
    startDate: s("startDate"),
    endDate: s("endDate"),
    adults: s("adults"),
    children: s("children"),
    rooms: s("rooms"),
    primaryDestination: s("primaryDestination"),
    purpose: s("purpose"),
    occasion: s("occasion"),
    experienceStyle: s("experienceStyle"),
    enquirySource: s("enquirySource"),
    currency: s("currency") as TripFieldsInput["currency"],
    estimatedValue: s("estimatedValue"),
    internalNotes: s("internalNotes"),
    guestNotes: s("guestNotes"),
    specialRequirements: s("specialRequirements"),
    participatingBrandIds: fd.getAll("participatingBrandIds").map(String),
    supplyingBrandIds: fd.getAll("supplyingBrandIds").map(String),
  };
}

export async function createTripAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  let id: string;
  try {
    id = (await createTrip(db, actor, formToTrip(fd))).id;
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/trips");
  redirect(`/trips/${id}?saved=1`);
}

export async function updateTripAction(id: string, version: number, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await updateTrip(db, actor, id, version, formToTrip(fd));
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath(`/trips/${id}`);
  redirect(`/trips/${id}?saved=1`);
}

export async function transitionTripAction(id: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await transitionTrip(db, actor, id, {
      to: fd.get("to"),
      reason: String(fd.get("reason") ?? ""),
      override: fd.get("override") === "on",
      expectedVersion: fd.get("version"),
    });
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath(`/trips/${id}`);
  return { ok: true, message: "Status updated." };
}

export async function approveTripAction(id: string, version: number): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await recordCommercialApproval(db, actor, id, version);
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath(`/trips/${id}`);
  return { ok: true, message: "Commercial approval recorded." };
}

export async function duplicateTripAction(id: string): Promise<ActionState> {
  const actor = await requireActor();
  let newId: string;
  try {
    newId = (await duplicateTrip(db, actor, id)).id;
  } catch (e) {
    return toActionError(e);
  }
  redirect(`/trips/${newId}/edit?duplicated=1`);
}

export async function archiveTripAction(id: string, archived: boolean): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await setTripArchived(db, actor, id, archived);
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath(`/trips/${id}`);
  revalidatePath("/trips");
  return { ok: true, message: archived ? "Trip archived." : "Trip restored." };
}
