"use client";

import {
  BarChart3, BookCheck, Building2, CalendarDays, Car, CheckSquare, GitBranch, Layers, LayoutGrid, Menu, Package,
  Plug, Route, ScrollText, Tags, Users, UsersRound, Wallet, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import type { NavItem } from "@/lib/navigation";

const ICONS: Record<string, LucideIcon> = {
  overview: LayoutGrid, tasks: CheckSquare, calendar: CalendarDays, route: Route, pipeline: GitBranch, users: Users,
  bookings: BookCheck, car: Car, package: Package, building: Building2, rates: Tags, wallet: Wallet, chart: BarChart3,
  layers: Layers, team: UsersRound, plug: Plug, audit: ScrollText,
};

/** Provisional typographic mark — replaceable once official brand assets are supplied (OPEN_DECISIONS D2). */
export function UltimaMark({ className = "" }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span aria-hidden className="relative h-5 w-5">
        <span className="absolute inset-0 rounded-[3px] border-[1.5px] border-current opacity-40" />
        <span className="absolute top-[5px] left-[5px] h-[10px] w-[10px] rounded-[2px] bg-accent" />
      </span>
      <span className="text-[15px] font-semibold tracking-[0.2em]">ULTIMA</span>
    </span>
  );
}

export function Sidebar({ groups, user }: { groups: { label?: string; items: NavItem[] }[]; user: { name: string; role: string } }) {
  const pathname = usePathname();
  // Open state is tied to the path it was opened on, so navigating closes the mobile drawer.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  const isActive = (item: NavItem) => {
    const prefixes = item.match ?? [item.href];
    return item.href === "/" ? pathname === "/" : prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  };

  return (
    <>
      <button
        type="button"
        className="no-print fixed top-2.5 left-3 z-40 rounded-[var(--radius-md)] bg-graphite p-2 text-surface lg:hidden"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        onClick={() => setOpenOn(open ? null : pathname)}
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>
      <aside
        className={cn(
          "no-print fixed inset-y-0 left-0 z-30 flex w-[248px] flex-col border-r border-graphite-line bg-graphite text-graphite-text transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Link href="/" className="flex h-14 shrink-0 items-center gap-2 border-b border-graphite-line px-5 text-surface">
          <UltimaMark />
          <span className="rounded-[3px] bg-graphite-raised px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-graphite-text">Operations</span>
        </Link>
        <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-4">
          {groups.map((g, i) => (
            <div key={g.label ?? i} className="mb-5">
              {g.label && <p className="px-2.5 pb-1.5 text-[10.5px] font-medium tracking-[0.12em] text-graphite-text/80 uppercase">{g.label}</p>}
              <ul className="space-y-px">
                {g.items.map((item) => {
                  const Icon = ICONS[item.icon] ?? LayoutGrid;
                  const active = isActive(item);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "relative flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-[7px] text-[13px] transition-colors",
                          active ? "bg-graphite-raised text-surface" : "hover:bg-graphite-raised/60 hover:text-surface",
                        )}
                      >
                        {active && <span aria-hidden className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-accent" />}
                        <Icon size={15} strokeWidth={1.75} aria-hidden className={active ? "text-surface" : ""} />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="shrink-0 border-t border-graphite-line px-5 py-3.5">
          <p className="truncate text-[13px] font-medium text-surface">{user.name}</p>
          <p className="truncate text-[11.5px]">{user.role}</p>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-20 bg-graphite/40 lg:hidden" aria-hidden onClick={() => setOpenOn(null)} />}
    </>
  );
}
