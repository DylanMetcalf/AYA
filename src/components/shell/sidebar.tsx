"use client";

import {
  Car, ChartNoAxesColumn, ClipboardCheck, Compass, FileText, IdCard, Map, Menu, Package, PenTool, Plug, Route,
  Settings, Users, Wallet, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import type { NavItem } from "@/lib/navigation";

const ICONS: Record<string, LucideIcon> = {
  compass: Compass, route: Route, pen: PenTool, users: Users, map: Map, car: Car, package: Package,
  clipboard: ClipboardCheck, id: IdCard, wallet: Wallet, chart: ChartNoAxesColumn, file: FileText, plug: Plug, settings: Settings,
};

export function Sidebar({ groups }: { groups: { label?: string; items: NavItem[] }[] }) {
  const pathname = usePathname();
  // Open state is tied to the path it was opened on, so navigating closes the mobile drawer.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) =>
    setOpenOn((typeof v === "function" ? v(open) : v) ? pathname : null);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  const nav = (
    <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 pb-6">
      {groups.map((g, i) => (
        <div key={g.label ?? i} className="mt-5 first:mt-2">
          {g.label && <p className="px-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-stone-300">{g.label}</p>}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const Icon = ICONS[item.icon] ?? Compass;
              if (item.plannedPhase) {
                return (
                  <li key={item.href}>
                    <span
                      className="flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-[13.5px] text-stone-300/60"
                      title={`Planned for phase ${item.plannedPhase}`}
                    >
                      <Icon size={16} strokeWidth={1.6} aria-hidden />
                      <span className="flex-1">{item.label}</span>
                      <span className="text-[10px] uppercase tracking-wider">Phase {item.plannedPhase}</span>
                    </span>
                  </li>
                );
              }
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-[13.5px] transition-colors",
                      active ? "bg-white/10 text-surface" : "text-stone-200 hover:bg-white/5 hover:text-surface",
                    )}
                  >
                    <Icon size={16} strokeWidth={1.6} aria-hidden className={active ? "text-sand" : ""} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const wordmark = (
    <Link href="/" className="block px-6 pt-6 pb-2">
      <span className="font-display text-[22px] tracking-[0.22em] text-surface">ULTIMA</span>
      <span className="mt-0.5 block text-[10px] uppercase tracking-[0.2em] text-sand/80">Experience Operations</span>
    </Link>
  );

  return (
    <>
      <button
        type="button"
        className="fixed top-3 left-3 z-40 rounded-[var(--radius-md)] bg-forest p-2 text-surface lg:hidden no-print"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <X size={18} /> : <Menu size={18} />}
      </button>
      <aside
        className={cn(
          "no-print fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-forest transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {wordmark}
        <div className="mx-6 my-3 h-px bg-brass/40" aria-hidden />
        {nav}
      </aside>
      {open && <div className="fixed inset-0 z-20 bg-ink/30 lg:hidden" aria-hidden onClick={() => setOpen(false)} />}
    </>
  );
}
