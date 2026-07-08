import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SOAR Command Center",
  description: "Security Orchestration, Automation & Response Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
