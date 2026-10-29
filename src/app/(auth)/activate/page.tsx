import type { Metadata } from "next";
import { ActivateForm } from "./activate-form";

export const metadata: Metadata = { title: "Activate account" };

export default async function ActivatePage({ searchParams }: PageProps<"/activate">) {
  const { token } = await searchParams;
  return (
    <>
      <h1 className="title text-[26px] text-ink">Activate your account</h1>
      <p className="mt-2 mb-8 text-sm text-ink-muted">Choose a password of at least 12 characters. A passphrase works well.</p>
      <ActivateForm token={typeof token === "string" ? token : ""} />
    </>
  );
}
