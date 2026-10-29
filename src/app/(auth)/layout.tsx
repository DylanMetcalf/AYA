import type { ReactNode } from "react";
import { UltimaMark } from "@/components/shell/sidebar";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-graphite p-12 text-surface lg:flex">
        <UltimaMark />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:56px_56px]" />
        <div className="relative max-w-md">
          <p className="mb-4 text-[12px] font-medium tracking-[0.14em] text-graphite-text uppercase">ULTIMA Operations</p>
          <p className="title text-[2rem] leading-[1.15]">Plan, cost and run every journey from one coordinated system.</p>
          <p className="mt-5 text-[14px] leading-relaxed text-graphite-text">ULTIMA · AYA · Schmidt Car Hire — one master journey, clear responsibilities.</p>
        </div>
        <p className="relative text-[12px] text-graphite-text">Authorised staff only. Activity is recorded.</p>
      </div>
      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
