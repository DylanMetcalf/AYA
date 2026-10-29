import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg py-20 text-center">
      <p className="title text-xl">Not found</p>
      <p className="mt-2 text-sm text-ink-muted">This record does not exist, or you do not have access to it.</p>
      <ButtonLink className="mt-6" href="/" variant="secondary">Back to the Command Centre</ButtonLink>
    </div>
  );
}
