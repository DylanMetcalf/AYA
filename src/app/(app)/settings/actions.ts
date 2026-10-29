"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type ActionState, toActionError } from "@/server/action-result";
import { requireActor } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { updateBrand, upsertLegalCompany } from "@/server/services/org";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function updateBrandAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await updateBrand(db, actor, id, {
      name: s(fd, "name"), kind: s(fd, "kind") as "operating", legalCompanyId: s(fd, "legalCompanyId"), tagline: s(fd, "tagline"),
      description: s(fd, "description"), colorPrimary: s(fd, "colorPrimary"), colorSecondary: s(fd, "colorSecondary"), colorAccent: s(fd, "colorAccent"),
      contactEmail: s(fd, "contactEmail"), contactPhone: s(fd, "contactPhone"), website: s(fd, "website"), documentFooter: s(fd, "documentFooter"),
      isProvisional: fd.get("isProvisional") === "on",
    });
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/", "layout");
  redirect("/settings?saved=brand");
}

export async function saveCompanyAction(id: string | null, _p: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  try {
    await upsertLegalCompany(db, actor, id, {
      name: s(fd, "name"), registrationNumber: s(fd, "registrationNumber"), vatNumber: s(fd, "vatNumber"), country: s(fd, "country"),
      address: s(fd, "address"), baseCurrency: s(fd, "baseCurrency") as "ZAR", groupRole: s(fd, "groupRole") as "other",
      verified: fd.get("verified") === "on", notes: s(fd, "notes"),
    });
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/settings");
  redirect("/settings?saved=company");
}
