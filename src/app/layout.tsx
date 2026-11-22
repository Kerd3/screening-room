import type { Metadata } from "next";
import { Big_Shoulders, Instrument_Sans } from "next/font/google";
import { preconnect } from "react-dom";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Providers } from "@/components/Providers";
import { siteUrl } from "@/lib/og";
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

const description =
  "Browse movies and TV series, bookmark what you want to watch, and get recommendations from what you save.";

export const metadata: Metadata = {
  // Absolute base for preview-image and canonical URLs.
  metadataBase: new URL(siteUrl()),
  title: { default: "Screening Room", template: "%s | Screening Room" },
  description,
  applicationName: "Screening Room",
  openGraph: {
    type: "website",
    siteName: "Screening Room",
    title: "Screening Room",
    description,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: "Screening Room", description },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Nearly every page shows TMDB images; open that connection early.
  preconnect("https://image.tmdb.org");
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
        {/* Real-visitor load times (Core Web Vitals) in the Vercel dashboard. A tiny
            script; it only reports on Vercel deployments with Speed Insights enabled. */}
        <SpeedInsights />
      </body>
    </html>
  );
}
