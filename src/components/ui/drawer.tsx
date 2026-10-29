"use client";

import { X } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

const DrawerContext = createContext<(() => void) | null>(null);
/** Close function of the enclosing drawer (null outside a drawer). ActionForm uses it to close on success. */
export const useDrawerClose = () => useContext(DrawerContext);

/** Side drawer built on native <dialog> (focus trap, Esc to close). Content mounts only while open. */
export function Drawer({ trigger, title, description, children, wide }: { trigger: { label: ReactNode; variant?: "primary" | "secondary" | "ghost"; size?: "sm" | "md" }; title: string; description?: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  return (
    <>
      <Button variant={trigger.variant ?? "secondary"} size={trigger.size ?? "sm"} onClick={() => setOpen(true)}>{trigger.label}</Button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        aria-labelledby="drawer-title"
        className={`fixed inset-y-0 right-0 left-auto m-0 h-full max-h-none w-full ${wide ? "max-w-2xl" : "max-w-lg"} border-l border-line bg-surface p-0 text-ink shadow-2xl`}
      >
        {open && (
          <DrawerContext.Provider value={() => setOpen(false)}>
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
                <div>
                  <h2 id="drawer-title" className="title text-[17px]">{title}</h2>
                  {description && <p className="mt-0.5 text-[13px] text-ink-muted">{description}</p>}
                </div>
                <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded p-1 text-ink-faint hover:bg-muted hover:text-ink"><X size={18} /></button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            </div>
          </DrawerContext.Provider>
        )}
      </dialog>
    </>
  );
}
