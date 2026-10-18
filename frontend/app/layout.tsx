import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "PlumbLine",
  description: "AWS/Terraform infrastructure drift detection and investigation",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="border-b border-[#232c38] bg-[#11161d]">
          <div className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-4">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight">
                Plumb<span className="text-sky-400">Line</span>
              </span>
            </Link>
            <nav className="flex gap-6 text-sm text-[#8b98a9]">
              <Link href="/" className="hover:text-white transition-colors">
                Overview
              </Link>
              <Link
                href="/drifts"
                className="hover:text-white transition-colors"
              >
                Drift Events
              </Link>
              <Link
                href="/scans"
                className="hover:text-white transition-colors"
              >
                Scans
              </Link>
            </nav>
            <span className="ml-auto rounded border border-[#232c38] px-2 py-1 text-xs text-[#8b98a9]">
              sandbox · us-east-2
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
