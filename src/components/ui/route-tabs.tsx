"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** Tabs where each tab is a route; the active tab is derived from the URL. */
export function RouteTabs({ tabs }: { tabs: { label: string; href: string; exact?: boolean }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Journey sections" className="no-print mb-7 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 py-2.5 text-[13px] whitespace-nowrap transition-colors", active ? "border-accent font-medium text-ink" : "border-transparent text-ink-muted hover:text-ink")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
