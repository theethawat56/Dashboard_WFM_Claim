import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Factory claim portal",
  description: "Warranty claim decisions for factory partners",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
