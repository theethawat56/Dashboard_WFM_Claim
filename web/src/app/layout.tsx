import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_TITLE ?? "Repair & Claim Dashboard",
  description: "Factory claim negotiation tool — product defect patterns and warranty compensation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
