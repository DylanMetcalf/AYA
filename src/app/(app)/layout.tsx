import type { ReactNode } from "react";
import { LogOut, Search } from "lucide-react";
import { BrandContextSelect } from "@/components/shell/brand-context-select";
import { Sidebar } from "@/components/shell/sidebar";
import { NAV_GROUPS } from "@/lib/navigation";
import { requireActor } from "@/server/auth/current";
import { getBrandContext } from "@/server/brand-context";
import { db } from "@/server/db/client";
import { listBrands } from "@/server/services/trips";
import { signOut } from "./shell-actions";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor();
  const [brands, brandContext] = await Promise.all([listBrands(db), getBrandContext()]);
  // Navigation hides what the user cannot use; services still enforce permissions independently.
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || actor.permissions.has(i.permission)) })).filter((g) => g.items.length);

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Sidebar groups={groups} />
      <div className="lg:pl-64">
        <header className="no-print sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-stone-200 bg-ivory/95 pr-4 pl-16 backdrop-blur lg:px-8">
          <form action="/search" role="search" className="relative max-w-md flex-1">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint" aria-hidden />
            <label htmlFor="global-search" className="sr-only">Search trips, guests and suppliers</label>
            <input
              id="global-search"
              name="q"
              type="search"
              placeholder="Search trips, guests, suppliers…"
              className="h-9 w-full rounded-[var(--radius-md)] border border-stone-200 bg-surface pr-3 pl-9 text-[13px] placeholder:text-ink-faint focus:border-forest focus:outline-none"
            />
          </form>
          <div className="ml-auto flex items-center gap-4">
            <div className="hidden md:block">
              <BrandContextSelect brands={brands.map((b) => ({ slug: b.slug, name: b.name }))} current={brandContext} />
            </div>
            <div className="hidden text-right sm:block">
              <p className="text-[13px] font-medium leading-tight text-ink">{actor.name}</p>
              <p className="text-[11px] text-ink-faint">{actor.email}</p>
            </div>
            <form action={signOut}>
              <button type="submit" className="rounded-[var(--radius-md)] p-2 text-ink-muted hover:bg-stone-100 hover:text-ink" aria-label="Sign out" title="Sign out">
                <LogOut size={16} />
              </button>
            </form>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1360px] px-4 py-8 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
