import { sql } from "drizzle-orm";
import { check, date, index, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { users } from "./org";
import { trips } from "./trips";
import { itineraryComponents } from "./itinerary";
import { vehicles } from "./fleet";

export const taskStatus = pgEnum("task_status", ["open", "in_progress", "blocked", "done"]);
export const taskPriority = pgEnum("task_priority", ["low", "normal", "high", "urgent"]);
export const taskCategory = pgEnum("task_category", ["guest", "accommodation", "transport", "experiences", "financial", "documentation", "general"]);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    tripId: uuid("trip_id").references(() => trips.id, { onDelete: "cascade" }),
    componentId: uuid("component_id").references(() => itineraryComponents.id, { onDelete: "set null" }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    dueDate: date("due_date"),
    priority: taskPriority("priority").notNull().default("normal"),
    status: taskStatus("status").notNull().default("open"),
    category: taskCategory("category").notNull().default("general"),
    blockedReason: text("blocked_reason"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedById: uuid("completed_by_id").references(() => users.id),
    createdById: uuid("created_by_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("tasks_assignee_idx").on(t.assigneeId, t.status),
    index("tasks_trip_idx").on(t.tripId),
    check("tasks_done_ck", sql`(${t.status} = 'done') = (${t.completedAt} is not null)`),
  ],
);
