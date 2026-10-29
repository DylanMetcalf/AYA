import type { ReactNode } from "react";
import { LogOut, Search } from "lucide-react";
import { BrandContextSelect } from "@/components/shell/brand-context-select";
import { Sidebar } from "@/components/shell/sidebar";
import { FlashToast } from "@/components/ui/flash";
import { NAV_GROUPS } from "@/lib/navigation";
import { requireActor } from "@/server/auth/current";
import { getBrandContext } from "@/server/brand-context";
import { db } from "@/server/db/client";
import { readFlash } from "@/server/flash";
import { listBrands } from "@/server/services/trips";
import { signOut } from "./shell-actions";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor();
  const [brands, brandContext, flashMessage] = await Promise.all([listBrands(db), getBrandContext(), readFlash()]);
  // Navigation hides what the user cannot use; services still enforce permissions independently.
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || actor.permissions.has(i.permission)) })).filter((g) => g.items.length);

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Sidebar groups={groups} user={{ name: actor.name, role: actor.roleNames.join(", ") || "No role assigned" }} />
      <div className="lg:pl-[248px]">
        <header className="no-print sticky top-0 z-10 flex h-14 items-center gap-4 border-b border-line bg-surface/90 pr-4 pl-16 backdrop-blur-sm lg:px-8">
          <form action="/search" role="search" className="relative max-w-md flex-1">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint" aria-hidden />
            <label htmlFor="global-search" className="sr-only">Search journeys, guests, suppliers and vehicles</label>
            <input
              id="global-search"
              name="q"
              type="search"
              placeholder="Search journeys, guests, suppliers, vehicles…"
              className="h-9 w-full rounded-[var(--radius-md)] border border-line bg-subtle pr-3 pl-9 text-[13px] placeholder:text-ink-faint focus:border-accent focus:bg-surface focus:outline-none"
            />
          </form>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden md:block">
              <BrandContextSelect brands={brands.map((b) => ({ slug: b.slug, name: b.name }))} current={brandContext} />
            </div>
            <form action={signOut}>
              <button type="submit" className="flex items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-[12.5px] text-ink-muted hover:bg-muted hover:text-ink">
                <LogOut size={14} aria-hidden /> <span className="hidden sm:inline">Sign out</span>
              </button>
            </form>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1400px] px-4 py-7 md:px-8">
          {children}
        </main>
      </div>
      <FlashToast message={flashMessage} />
    </div>
  );
}
