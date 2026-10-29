import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface Crumb { label: string; href?: string }

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  crumbs,
  meta,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  crumbs?: Crumb[];
  meta?: ReactNode;
}) {
  return (
    <header className="mb-7">
      {crumbs && (
        <nav aria-label="Breadcrumb" className="mb-3">
          <ol className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-ink-faint">
            {crumbs.map((c, i) => (
              <li key={i} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden className="text-line-strong">/</span>}
                {c.href ? <Link href={c.href} className="hover:text-ink">{c.label}</Link> : <span aria-current="page" className="text-ink-muted">{c.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          {eyebrow && <p className="mb-1.5 text-[11.5px] font-medium tracking-[0.1em] text-ink-faint uppercase">{eyebrow}</p>}
          <h1 className="title text-[24px] leading-tight text-ink">{title}</h1>
          {meta && <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-ink-muted">{meta}</div>}
          {description && <p className="mt-1.5 max-w-2xl text-[13.5px] text-ink-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Section({ title, description, actions, children, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className} aria-label={typeof title === "string" ? title : undefined}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-[12.5px] text-ink-muted">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-[var(--radius-lg)] border border-line bg-surface", className)}>{children}</div>;
}

/** Label/value pair for detail panels. */
export function Fact({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[11.5px] font-medium text-ink-faint">{label}</dt>
      <dd className="mt-1 text-[13.5px] text-ink">{children}</dd>
    </div>
  );
}

/** Horizontal tab navigation backed by links (each tab is a real route). */
export function Tabs({ tabs, current }: { tabs: { key: string; label: string; href: string; count?: number }[]; current: string }) {
  return (
    <nav aria-label="Sections" className="no-print mb-7 -mt-2 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={cn(
            "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] whitespace-nowrap transition-colors",
            t.key === current ? "border-accent font-medium text-ink" : "border-transparent text-ink-muted hover:text-ink",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="rounded-full bg-muted px-1.5 text-[11px] text-ink-muted tabular">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
