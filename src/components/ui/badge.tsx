import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";
const tones: Record<Tone, { box: string; dot: string }> = {
  neutral: { box: "bg-muted text-ink-muted", dot: "bg-ink-faint" },
  success: { box: "bg-success-bg text-success", dot: "bg-success" },
  warning: { box: "bg-warning-bg text-warning", dot: "bg-warning" },
  danger: { box: "bg-danger-bg text-danger", dot: "bg-danger" },
  info: { box: "bg-info-bg text-info", dot: "bg-info" },
  accent: { box: "bg-accent-soft text-accent-text", dot: "bg-accent" },
};

/** Status label. Always carries text, so colour is never the only signal. */
export function Badge({ tone = "neutral", children, className, dot = true }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] leading-4 font-medium whitespace-nowrap", tones[tone].box, className)}>
      {dot && <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", tones[tone].dot)} />}
      {children}
    </span>
  );
}
