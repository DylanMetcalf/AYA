import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Semantic data table. Wrap in a scroll container so wide tables never break the layout. */
export function Table({ className, ...p }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-surface">
      <table className={cn("w-full border-collapse text-sm", className)} {...p} />
    </div>
  );
}
export const Th = ({ className, ...p }: ComponentProps<"th">) => (
  <th scope="col" className={cn("border-b border-line bg-subtle px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted", className)} {...p} />
);
export const Td = ({ className, ...p }: ComponentProps<"td">) => (
  <td className={cn("border-b border-muted px-4 py-3 align-top text-ink", className)} {...p} />
);
