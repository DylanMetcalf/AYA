import type { Permission } from "@/lib/auth/permissions";

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  permission?: Permission;
  /** Highlight when the path starts with any of these (defaults to href). */
  match?: string[];
}

/** Grouped by how staff work. Only modules that exist appear here. */
export const NAV_GROUPS: { label?: string; items: NavItem[] }[] = [
  {
    label: "Command",
    items: [
      { label: "Overview", href: "/", icon: "overview" },
      { label: "My Tasks", href: "/tasks", icon: "tasks" },
      { label: "Operations Calendar", href: "/calendar", icon: "calendar", permission: "trip.read" },
    ],
  },
  {
    label: "Journeys",
    items: [
      { label: "All Journeys", href: "/trips", icon: "route", permission: "trip.read", match: ["/trips"] },
      { label: "Journey Pipeline", href: "/pipeline", icon: "pipeline", permission: "trip.read" },
      { label: "Guests", href: "/guests", icon: "users", permission: "guest.read" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Bookings", href: "/bookings", icon: "bookings", permission: "trip.read" },
      { label: "Fleet & Vehicles", href: "/fleet", icon: "car", permission: "fleet.read" },
      { label: "Inventory & Amenities", href: "/inventory", icon: "package", permission: "inventory.read" },
    ],
  },
  {
    label: "Suppliers",
    items: [
      { label: "Supplier Directory", href: "/suppliers", icon: "building", permission: "supplier.read", match: ["/suppliers"] },
      { label: "Rate Review", href: "/rates/review", icon: "rates", permission: "rate.approve" },
    ],
  },
  {
    label: "Business",
    items: [
      { label: "Financials", href: "/financials", icon: "wallet", permission: "finance.read_costs" },
      { label: "Performance", href: "/performance", icon: "chart", permission: "performance.read" },
    ],
  },
  {
    label: "Organisation",
    items: [
      { label: "Brands & Entities", href: "/settings", icon: "layers", permission: "admin.settings" },
      { label: "Team", href: "/team", icon: "team", permission: "admin.users" },
      { label: "Integrations", href: "/integrations", icon: "plug", permission: "admin.settings" },
      { label: "Audit Log", href: "/audit", icon: "audit", permission: "audit.read" },
    ],
  },
];
