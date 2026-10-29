"use client";

import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <p className="font-display text-2xl">Something went wrong</p>
      <p className="mt-2 text-sm text-ink-muted">
        The problem has been logged{error.digest ? ` (reference ${error.digest})` : ""}. Nothing was changed unless you saw a confirmation.
      </p>
      <Button className="mt-6" variant="secondary" onClick={reset}>Try again</Button>
    </div>
  );
}
