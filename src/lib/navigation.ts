import type { Permission } from "@/lib/auth/permissions";

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  permission?: Permission;
  /** Phase in docs/IMPLEMENTATION_PLAN.md that delivers this module; undefined = live. */
  plannedPhase?: number;
}

export const NAV_GROUPS: { label?: string; items: NavItem[] }[] = [
  { items: [{ label: "Command Centre", href: "/", icon: "compass" }] },
  {
    label: "Journeys",
    items: [
      { label: "Trips", href: "/trips", icon: "route", permission: "trip.read" },
      { label: "Trip Studio", href: "/studio", icon: "pen", permission: "trip.edit", plannedPhase: 4 },
      { label: "Guests & Relationships", href: "/guests", icon: "users", permission: "guest.read" },
    ],
  },
  {
    label: "Supply",
    items: [
      { label: "Destinations & Suppliers", href: "/suppliers", icon: "map", permission: "supplier.read", plannedPhase: 5 },
      { label: "Vehicles", href: "/vehicles", icon: "car", permission: "fleet.read", plannedPhase: 8 },
      { label: "Inventory", href: "/inventory", icon: "package", plannedPhase: 9 },
    ],
  },
  {
    label: "Delivery",
    items: [
      { label: "Operations", href: "/operations", icon: "clipboard", plannedPhase: 7 },
      { label: "Team", href: "/team", icon: "id", permission: "admin.users" },
    ],
  },
  {
    label: "Business",
    items: [
      { label: "Financials", href: "/financials", icon: "wallet", permission: "finance.read_costs", plannedPhase: 6 },
      { label: "Performance", href: "/performance", icon: "chart", permission: "performance.read", plannedPhase: 10 },
      { label: "Reports", href: "/reports", icon: "file", permission: "performance.read", plannedPhase: 10 },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Integrations", href: "/integrations", icon: "plug", permission: "admin.settings" },
      { label: "Settings", href: "/settings", icon: "settings", permission: "admin.settings" },
    ],
  },
];
