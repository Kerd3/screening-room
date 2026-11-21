import type { Metadata } from "next";
import { Big_Shoulders, Instrument_Sans } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const display = Big_Shoulders({
  variable: "--font-big-shoulders",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  adjustFontFallback: false, // next/font has no metrics for this family yet
});

const sans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: { default: "Screening Room", template: "%s | Screening Room" },
  description:
    "Browse movies and TV series, bookmark what you want to watch, and get recommendations from what you save.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
