import type { Metadata } from "next";
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import SmoothScroll from "./smooth-scroll";
import "./globals.css";

// Free stand-ins for the production faces. Euclid Circular A is licensed and
// added via @font-face on the real site — it takes over automatically because
// it is listed first in the CSS font stack (see globals.css --font-sans).
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

// Data / stats / coordinates — ships as-is, no licensing needed.
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Railway Manifest Extractor",
  description: "Extract structured data from scanned railway shipping documents with Gemini.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${plexMono.variable}`}>
      <body>
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
