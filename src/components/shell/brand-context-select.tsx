"use client";

import { useTransition } from "react";
import { setBrandContext } from "@/app/(app)/shell-actions";

export function BrandContextSelect({ brands, current }: { brands: { slug: string; name: string }[]; current: string | null }) {
  const [pending, start] = useTransition();
  return (
    <form className="flex items-center gap-2">
      <label htmlFor="brand-context" className="text-xs text-ink-muted">
        Brand view
      </label>
      <select
        id="brand-context"
        name="brand"
        defaultValue={current ?? "all"}
        disabled={pending}
        onChange={(e) => {
          const fd = new FormData();
          fd.set("brand", e.target.value);
          start(() => setBrandContext(fd));
        }}
        className="h-8 rounded-[var(--radius-md)] border border-line-strong bg-surface px-2 text-[13px]"
      >
        <option value="all">All brands</option>
        {brands.map((b) => (
          <option key={b.slug} value={b.slug}>
            {b.name}
          </option>
        ))}
      </select>
    </form>
  );
}
