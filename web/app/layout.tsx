import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteMotion } from "./motion";

// Tally's own type (tallypnl.com): Geist for text, Geist Mono for the fingerprint and ids.
const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tally on NEAR",
  description: "Look up whether Tally checked a PnL card. Every check is a permanent public record on NEAR.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <div className="bg" aria-hidden>
          <i />
        </div>
        <SiteMotion />
        {children}
      </body>
    </html>
  );
}
