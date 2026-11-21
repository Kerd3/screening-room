import { ImageResponse } from "next/og";
import { BRAND, OG_SIZE, ogFonts } from "@/lib/og";
import { getTitleForMeta } from "@/lib/titleMeta";
import { genreName } from "@/lib/tmdb/genres";

export const alt = "Title preview from Screening Room";
export const size = OG_SIZE;
export const contentType = "image/png";

/** Link preview for a title: its backdrop, with the name set like the app's hero. */
export default async function Image({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  const [d, fonts] = await Promise.all([getTitleForMeta(type, id), ogFonts()]);

  const backdrop = d?.backdropPath ? `https://image.tmdb.org/t/p/w1280${d.backdropPath}` : null;
  const facts = d
    ? [
        d.year ? String(d.year) : null,
        d.mediaType === "movie" ? "Movie" : "Series",
        ...d.genreIds.slice(0, 2).map((g) => genreName(g) ?? null),
      ].filter((f): f is string => Boolean(f))
    : [];
  const rating = d && d.rating > 0 ? d.rating.toFixed(1) : null;
  const title = d?.title ?? "Screening Room";
  const titleSize = title.length > 28 ? 84 : title.length > 16 ? 108 : 132;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: BRAND.velvet }}>
        {backdrop && (
          // eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain <img>
          <img
            src={backdrop}
            alt=""
            width={1200}
            height={630}
            style={{ position: "absolute", top: 0, left: 0, width: 1200, height: 630, objectFit: "cover" }}
          />
        )}
        {/* Explicit size: the image renderer doesn't support the `inset` shorthand.
            Two fades (from the bottom and from the left) keep text legible on bright backdrops. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            display: "flex",
            background: `linear-gradient(to top, ${BRAND.velvet} 0%, rgba(27,23,38,0.92) 38%, rgba(27,23,38,0.35) 75%, rgba(27,23,38,0.1) 100%)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            display: "flex",
            background: "linear-gradient(to right, rgba(27,23,38,0.7) 0%, rgba(27,23,38,0) 65%)",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            width: "100%",
            padding: "64px 72px",
            fontFamily: "Instrument Sans",
          }}
        >
          <div style={{ display: "flex", fontFamily: "Big Shoulders", fontSize: titleSize, lineHeight: 0.9, color: BRAND.paper }}>
            {title}
          </div>
          {facts.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 28, marginTop: 24, fontSize: 32, color: BRAND.paper }}>
              {facts.map((f) => (
                <span key={f}>{f}</span>
              ))}
              {rating && (
                // The fonts have no ★ glyph, so the star is drawn as SVG.
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <svg width="30" height="30" viewBox="0 0 24 24">
                    <path
                      fill={BRAND.tungsten}
                      d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"
                    />
                  </svg>
                  {rating}
                </span>
              )}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 36 }}>
            <div style={{ display: "flex", width: 56, height: 5, borderRadius: 3, background: BRAND.tungsten }} />
            <span style={{ fontFamily: "Big Shoulders", fontSize: 34, color: BRAND.tungsten }}>Screening Room</span>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
