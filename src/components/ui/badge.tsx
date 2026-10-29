import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "forest" | "brass";
const tones: Record<Tone, string> = {
  neutral: "bg-stone-100 text-ink-muted",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  forest: "bg-forest-50 text-forest",
  brass: "bg-stone-50 text-brass-text ring-1 ring-inset ring-sand",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}
