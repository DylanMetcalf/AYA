import { cn } from "@/lib/cn";

export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cn("animate-shimmer rounded-[var(--radius-md)] bg-muted", className)} />;

/** Generic page skeleton used by route-level loading.tsx files. */
export function PageSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <Skeleton className="mb-2 h-3 w-24" />
      <Skeleton className="mb-8 h-7 w-72" />
      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-72" />
    </div>
  );
}
