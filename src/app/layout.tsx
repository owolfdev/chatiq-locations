import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "ChatIQ Locations",
  description: "Isolated locations sibling — places, zones, publish, extraction",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
