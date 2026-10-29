/**
 * Permission catalogue. Roles map to these in the DB (role_permissions); the defaults below are only
 * used to seed system roles. Authorisation is always checked server-side in services.
 */
export const PERMISSIONS = {
  "trip.read": "View trips (Guide role: assigned trips only)",
  "trip.read_all": "View all trips, not only assigned ones",
  "trip.create": "Create trips",
  "trip.edit": "Edit trips and move them through design stages",
  "trip.approve": "Record commercial approval",
  "trip.confirm": "Confirm trips",
  "trip.cancel": "Cancel trips",
  "trip.override": "Override lifecycle rules with a recorded reason",
  "guest.read": "View guests",
  "guest.read_sensitive": "View dietary, accessibility and medical information",
  "guest.edit": "Create and edit guests",
  "supplier.read": "View suppliers",
  "supplier.edit": "Create and edit suppliers and draft rates",
  "rate.approve": "Approve supplier rates for operational use",
  "finance.read_costs": "View supplier costs, margins and profitability",
  "finance.edit": "Record payments, exchange rates and budgets",
  "quote.issue": "Issue quotations to clients",
  "fleet.read": "View vehicles and allocations",
  "fleet.edit": "Manage vehicles, allocations and inspections",
  "performance.read": "View targets, forecasts and management reports",
  "admin.users": "Invite users, assign roles, deactivate accounts",
  "admin.settings": "Configure companies, brands and integrations",
  "audit.read": "View the audit log",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const SYSTEM_ROLES: { key: string; name: string; description: string; permissions: Permission[] }[] = [
  {
    key: "owner",
    name: "Owner / System Administrator",
    description: "Full administrative access.",
    permissions: ALL_PERMISSIONS,
  },
  {
    key: "management",
    name: "Management",
    description: "Business oversight, approvals, financial visibility and performance.",
    permissions: ALL_PERMISSIONS.filter((p) => !p.startsWith("admin.")),
  },
  {
    key: "trip_manager",
    name: "Trip Manager",
    description: "Designs, costs and coordinates trips.",
    permissions: [
      "trip.read", "trip.read_all", "trip.create", "trip.edit", "trip.cancel",
      "guest.read", "guest.read_sensitive", "guest.edit",
      "supplier.read", "supplier.edit", "finance.read_costs", "fleet.read",
    ],
  },
  {
    key: "operations",
    name: "Operations Coordinator",
    description: "Supplier confirmations, tasks, readiness and transport.",
    permissions: [
      "trip.read", "trip.read_all", "trip.edit", "guest.read", "guest.read_sensitive",
      "supplier.read", "supplier.edit", "fleet.read", "fleet.edit",
    ],
  },
  {
    key: "fleet",
    name: "Fleet Manager",
    description: "Vehicles, availability, allocations, inspections and maintenance.",
    permissions: ["trip.read", "trip.read_all", "fleet.read", "fleet.edit", "supplier.read"],
  },
  {
    key: "finance",
    name: "Finance",
    description: "Payments, balances, exchange rates and financial reporting.",
    permissions: [
      "trip.read", "trip.read_all", "guest.read", "supplier.read",
      "finance.read_costs", "finance.edit", "performance.read",
    ],
  },
  {
    key: "guide",
    name: "Guide / Field Staff",
    description: "Assigned trip information, run sheets and checklists.",
    permissions: ["trip.read", "guest.read", "guest.read_sensitive", "fleet.read"],
  },
];
