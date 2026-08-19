import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { getDiscoverabilityPolicy } from "@/platform/config/discoverability";
import "./globals.css";

const discoverabilityPolicy = getDiscoverabilityPolicy();

export const metadata: Metadata = {
  title: {
    default: "Fayette County Habitat for Humanity",
    template: "%s | Fayette County Habitat for Humanity",
  },
  description:
    "Foundation environment for the Fayette County Habitat for Humanity digital platform.",
  robots: discoverabilityPolicy.robots,
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#FFFFFF",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
