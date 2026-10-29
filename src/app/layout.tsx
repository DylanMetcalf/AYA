import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { default: "ULTIMA · Experience Operations", template: "%s · ULTIMA" },
  description: "Internal operating platform for ULTIMA, AYA and connected partners.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-ZA">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
