import type { ReactNode } from "react";

export function EmptyState({ title, children, action, compact }: { title: string; children?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center rounded-[var(--radius-lg)] border border-dashed border-line-strong bg-surface/50 px-6 text-center ${compact ? "py-7" : "py-12"}`}>
      <p className="text-[14px] font-medium text-ink">{title}</p>
      {children && <div className="mt-1 max-w-md text-[13px] text-ink-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
