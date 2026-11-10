import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const archivo = Archivo({ variable: "--font-sans", subsets: ["latin"], axes: ["wdth"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Tally on NEAR",
  description: "Look up whether Tally checked a PnL card. Every check is a permanent public record on NEAR.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
