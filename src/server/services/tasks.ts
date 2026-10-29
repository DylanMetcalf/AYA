import { and, eq, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { isUuid, optDate, optText, optUuid, reqText } from "@/lib/validation/common";
import { type Actor, can, requirePermission } from "@/server/auth/actor";
import { audit } from "@/server/audit";
import type { Db } from "@/server/db/client";
import { tasks, trips, users } from "@/server/db/schema";
import { forbidden, invalid, notFound } from "@/server/errors";
import { loadScopedTrip, tripScope } from "./trips";

export const TASK_CATEGORIES = ["guest", "accommodation", "transport", "experiences", "financial", "documentation", "general"] as const;

export const taskSchema = z.object({
  title: reqText(200, "Describe the task"),
  description: optText(5000),
  tripId: optUuid,
  componentId: optUuid,
  vehicleId: optUuid,
  assigneeId: optUuid,
  dueDate: optDate,
  priority: z.enum(["low", "normal", "high", "urgent"]),
  category: z.enum(TASK_CATEGORIES),
});

/** Visible tasks: assigned to me, or linked to a trip I can see, or general tasks for staff who see all trips. */
function taskScope(actor: Actor): SQL | undefined {
  if (can(actor, "trip.read_all")) return undefined;
  return or(eq(tasks.assigneeId, actor.id), sql`${tasks.tripId} in (select ${trips.id} from ${trips} where ${tripScope(actor) ?? sql`true`})`);
}

export async function listTasks(db: Db, actor: Actor, f: { mine?: boolean; tripId?: string; status?: "open" | "done" | "all"; overdue?: boolean } = {}) {
  requirePermission(actor, "trip.read");
  const today = new Date().toISOString().slice(0, 10);
  const conds: (SQL | undefined)[] = [taskScope(actor)];
  if (f.mine) conds.push(eq(tasks.assigneeId, actor.id));
  if (f.tripId) conds.push(eq(tasks.tripId, f.tripId));
  if (f.status === "open" || !f.status) conds.push(ne(tasks.status, "done"));
  if (f.status === "done") conds.push(eq(tasks.status, "done"));
  if (f.overdue) conds.push(and(ne(tasks.status, "done"), lt(tasks.dueDate, today)));
  return db
    .select({ t: tasks, assigneeName: users.name, reference: trips.reference, tripName: trips.name })
    .from(tasks)
    .leftJoin(users, eq(users.id, tasks.assigneeId))
    .leftJoin(trips, eq(trips.id, tasks.tripId))
    .where(and(...conds))
    .orderBy(sql`${tasks.status} = 'done'`, sql`${tasks.dueDate} asc nulls last`, sql`case ${tasks.priority} when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end`)
    .limit(500);
}

export async function createTask(db: Db, actor: Actor, raw: z.input<typeof taskSchema>) {
  requirePermission(actor, "trip.edit");
  const v = taskSchema.parse(raw);
  return db.transaction(async (tx) => {
    if (v.tripId) await loadScopedTrip(tx, actor, v.tripId);
    if (v.assigneeId) {
      const [u] = await tx.select({ id: users.id, active: users.isActive }).from(users).where(eq(users.id, v.assigneeId));
      if (!u?.active) throw invalid("Assignee must be an active team member.");
    }
    const [t] = await tx.insert(tasks).values({ ...v, createdById: actor.id }).returning();
    await audit(tx, actor.id, { action: "task.created", entityType: v.tripId ? "trip" : "task", entityId: v.tripId ?? t!.id, summary: `Task “${v.title}”${v.dueDate ? ` due ${v.dueDate}` : ""}` });
    return t!;
  });
}

/** Assignees may update their own task status; others need trip.edit. */
export async function setTaskStatus(db: Db, actor: Actor, taskId: string, status: "open" | "in_progress" | "blocked" | "done", blockedReason?: string) {
  if (!isUuid(taskId)) throw notFound("Task");
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(tasks).where(eq(tasks.id, taskId)).for("update");
    if (!t) throw notFound("Task");
    if (t.tripId) await loadScopedTrip(tx, actor, t.tripId);
    if (t.assigneeId !== actor.id && !can(actor, "trip.edit")) throw forbidden();
    if (status === "blocked" && !blockedReason?.trim()) throw invalid("Say what is blocking this task.");
    await tx.update(tasks).set({
      status,
      blockedReason: status === "blocked" ? blockedReason!.trim() : null,
      completedAt: status === "done" ? new Date() : null,
      completedById: status === "done" ? actor.id : null,
      updatedAt: new Date(),
    }).where(eq(tasks.id, taskId));
    await audit(tx, actor.id, { action: "task.status_changed", entityType: t.tripId ? "trip" : "task", entityId: t.tripId ?? t.id, summary: `Task “${t.title}”: ${t.status} → ${status}` });
  });
}

export async function openTaskCounts(db: Db, actor: Actor) {
  const today = new Date().toISOString().slice(0, 10);
  const [r] = await db
    .select({
      mine: sql<number>`count(*) filter (where ${tasks.assigneeId} = ${actor.id})::int`,
      dueToday: sql<number>`count(*) filter (where ${tasks.assigneeId} = ${actor.id} and ${tasks.dueDate} = ${today})::int`,
      overdue: sql<number>`count(*) filter (where ${tasks.assigneeId} = ${actor.id} and ${tasks.dueDate} < ${today})::int`,
      unassigned: sql<number>`count(*) filter (where ${tasks.assigneeId} is null)::int`,
    })
    .from(tasks)
    .where(and(ne(tasks.status, "done"), taskScope(actor)));
  return r!;
}

