import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/current";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getActor()) redirect("/");
  const { next } = await searchParams;
  return (
    <>
      <p className="mb-10 font-display text-2xl tracking-[0.24em] text-forest lg:hidden">ULTIMA</p>
      <h1 className="font-display text-3xl text-ink">Sign in</h1>
      <p className="mt-2 mb-8 text-sm text-ink-muted">Use the account your administrator created for you.</p>
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </>
  );
}
