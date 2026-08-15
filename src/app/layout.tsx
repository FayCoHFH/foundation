import type { Metadata, Viewport } from "next";
import { Literata, Source_Sans_3 } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const literata = Literata({ subsets: ["latin"], variable: "--font-literata" });
const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
});

export const metadata: Metadata = {
  title: {
    default: "Fayette County Habitat for Humanity",
    template: "%s | Fayette County Habitat for Humanity",
  },
  description:
    "Foundation environment for the Fayette County Habitat for Humanity digital platform.",
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f7f5f0",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${literata.variable} ${sourceSans.variable}`}>
        {children}
      </body>
    </html>
  );
}
