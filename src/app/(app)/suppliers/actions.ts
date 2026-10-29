"use server";

import type { ActionState } from "@/server/action-result";
import { act, checked, fields } from "@/server/act";
import { db } from "@/server/db/client";
import { addSupplierContact, addSupplierService, createRate, decideRate, removeSupplierContact, reviseRate, saveSupplier } from "@/server/services/suppliers";

const supplierFrom = (fd: FormData) => fields(fd) as never;

export async function saveSupplierAction(id: string | null, _p: ActionState, fd: FormData) {
  return act((a) => saveSupplier(db, a, id, supplierFrom(fd)), { revalidate: ["/suppliers"], success: "Supplier saved.", redirectTo: (s) => `/suppliers/${s.id}` });
}
export async function addContactAction(supplierId: string, _p: ActionState, fd: FormData) {
  return act((a) => addSupplierContact(db, a, supplierId, { ...fields(fd), isPrimary: checked(fd, "isPrimary") } as never), { revalidate: [`/suppliers/${supplierId}`], success: "Contact added." });
}
export async function removeContactAction(supplierId: string, contactId: string) {
  return act((a) => removeSupplierContact(db, a, contactId), { revalidate: [`/suppliers/${supplierId}`], success: "Contact removed." });
}
export async function addServiceAction(supplierId: string, _p: ActionState, fd: FormData) {
  return act((a) => addSupplierService(db, a, supplierId, fields(fd) as never), { revalidate: [`/suppliers/${supplierId}`], success: "Service added." });
}
export async function createRateAction(supplierId: string, serviceId: string, _p: ActionState, fd: FormData) {
  return act((a) => createRate(db, a, serviceId, fields(fd) as never), { revalidate: [`/suppliers/${supplierId}`, "/rates/review"], success: "Rate submitted for review." });
}
export async function reviseRateAction(supplierId: string, rateId: string, _p: ActionState, fd: FormData) {
  return act((a) => reviseRate(db, a, rateId, fields(fd) as never), { revalidate: [`/suppliers/${supplierId}`, "/rates/review"], success: "New rate version submitted for review. The approved version stays in force until then." });
}
export async function decideRateAction(rateId: string, decision: "approve" | "reject") {
  return act((a) => decideRate(db, a, rateId, decision), { revalidate: ["/rates/review", "/suppliers"], success: decision === "approve" ? "Rate approved for costing." : "Rate rejected." });
}
