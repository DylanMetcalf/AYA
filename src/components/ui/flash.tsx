"use client";

import { CheckCircle2, X } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Shows a one-time success message set by a server action (see server/flash.ts).
 * The cookie is cleared client-side once shown. Messages never contain sensitive data.
 */
export function FlashToast({ message }: { message: string | null }) {
  const [shown, setShown] = useState(message);
  useEffect(() => {
    if (!message) return;
    document.cookie = "ultima_flash=; Max-Age=0; path=/";
    const t = setTimeout(() => setShown(null), 4500);
    return () => clearTimeout(t);
  }, [message]);
  if (!shown) return null;
  return (
    <div role="status" aria-live="polite" className="no-print fixed right-5 bottom-5 z-50 flex max-w-sm items-start gap-2.5 rounded-[var(--radius-lg)] bg-graphite px-4 py-3 text-[13px] text-surface shadow-lg">
      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#6ee7b7]" aria-hidden />
      <span className="flex-1">{shown}</span>
      <button type="button" onClick={() => setShown(null)} aria-label="Dismiss" className="text-graphite-text hover:text-surface"><X size={14} /></button>
    </div>
  );
}
