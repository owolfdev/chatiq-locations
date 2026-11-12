import type { Metadata, Viewport } from "next";

import { RegisterPwa } from "@/components/register-pwa";
import "./globals.css";

export const metadata: Metadata = {
  title: "Store mapper",
  description: "Map store aisles for your team",
  applicationName: "ChatIQ Store Mapper",
  appleWebApp: {
    capable: true,
    title: "Mapper",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <RegisterPwa />
        {children}
      </body>
    </html>
  );
}
