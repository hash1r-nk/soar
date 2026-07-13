import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "YORU",
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
