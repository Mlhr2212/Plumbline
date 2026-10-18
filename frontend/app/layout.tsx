import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});
const jbmono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jbmono",
});

export const metadata: Metadata = {
  title: {
    default: "PlumbLine",
    template: "%s · PlumbLine",
  },
  description: "AWS/Terraform infrastructure drift detection and investigation",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [health, overview] = await Promise.all([
    api.health().catch(() => null),
    api.overview().catch(() => null),
  ]);
  return (
    <html lang="en" className={`${inter.variable} ${jbmono.variable}`}>
      <body className="min-h-screen font-sans text-[13px] leading-normal">
        <AppShell overview={overview} apiOk={health?.status === "ok"}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
