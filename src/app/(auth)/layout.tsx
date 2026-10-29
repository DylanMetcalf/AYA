import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-forest p-12 text-surface lg:flex">
        <div>
          <p className="font-display text-3xl tracking-[0.24em]">ULTIMA</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-sand/80">Experience Operations</p>
        </div>
        <div className="max-w-md">
          <div className="mb-6 h-px w-16 bg-brass" aria-hidden />
          <p className="font-display text-[1.9rem] leading-snug font-light">One coordinated operating system. Multiple connected brands. One seamless guest journey.</p>
          <p className="mt-6 text-xs uppercase tracking-[0.18em] text-sand/70">ULTIMA · AYA · Schmidt Car Hire</p>
        </div>
        <p className="text-[11px] text-stone-300/70">Authorised staff only. Activity is recorded.</p>
      </div>
      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
