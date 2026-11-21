/**
 * Shared pieces for link-preview (Open Graph) images: the brand palette and
 * the display font, loaded as TTF (ImageResponse can't read WOFF2).
 */
export const OG_SIZE = { width: 1200, height: 630 };

export const BRAND = {
  velvet: "#1b1726",
  stall: "#241f33",
  paper: "#ede6d8",
  usher: "#9c94a8",
  tungsten: "#f0b44c",
};

const fontCache = new Map<string, Promise<ArrayBuffer | null>>();

/**
 * Fetches a Google Font as TTF. Requesting the CSS without a browser user
 * agent makes Google return TTF URLs. Returns null on failure, so an image
 * still renders (in the default font) if Google Fonts is unreachable.
 */
export function loadGoogleFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  const key = `${family}:${weight}`;
  let p = fontCache.get(key);
  if (!p) {
    p = (async () => {
      try {
        const css = await (
          await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}`)
        ).text();
        const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
        if (!url) return null;
        return await (await fetch(url)).arrayBuffer();
      } catch {
        return null;
      }
    })();
    fontCache.set(key, p);
  }
  return p;
}

export async function ogFonts() {
  const [display, sans] = await Promise.all([
    loadGoogleFont("Big Shoulders", 800),
    loadGoogleFont("Instrument Sans", 500),
  ]);
  return [
    ...(display ? [{ name: "Big Shoulders", data: display, weight: 800 as const, style: "normal" as const }] : []),
    ...(sans ? [{ name: "Instrument Sans", data: sans, weight: 500 as const, style: "normal" as const }] : []),
  ];
}

/** Site URL for absolute links in metadata (Vercel sets the production domain). */
export function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}
