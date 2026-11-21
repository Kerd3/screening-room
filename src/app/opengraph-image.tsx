import { ImageResponse } from "next/og";
import { BRAND, OG_SIZE, ogFonts } from "@/lib/og";

export const alt = "Screening Room: browse movies and series, bookmark them, and get picks from what you save";
export const size = OG_SIZE;
export const contentType = "image/png";

/** The site-wide link preview: the app's one bold element, a lamp-lit title. */
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "72px 80px",
          background: `radial-gradient(ellipse 70% 90% at 50% -25%, rgba(240,180,76,0.32), rgba(240,180,76,0) 62%), ${BRAND.velvet}`,
          fontFamily: "Instrument Sans",
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "Big Shoulders",
            fontSize: 164,
            lineHeight: 0.9,
            color: BRAND.paper,
            letterSpacing: "-0.01em",
          }}
        >
          Screening Room
        </div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 36, color: BRAND.usher, maxWidth: 900, lineHeight: 1.3 }}>
          Browse movies and series, bookmark what you want to watch, and get picks from what you save.
        </div>
        <div style={{ display: "flex", marginTop: 40, width: 120, height: 6, borderRadius: 3, background: BRAND.tungsten }} />
      </div>
    ),
    { ...size, fonts: await ogFonts() },
  );
}
