/**
 * The visitor's likely country (ISO 3166-1 alpha-2): Vercel's IP-geolocation
 * header first, then the region in the browser language ("en-GB" -> GB),
 * then the US.
 */
export function detectRegion(headers: Headers): string {
  const geo = headers.get("x-vercel-ip-country")?.toUpperCase();
  if (geo && /^[A-Z]{2}$/.test(geo)) return geo;
  const lang = headers.get("accept-language")?.match(/^[a-z]{2,3}-([a-z]{2})\b/i)?.[1];
  return lang ? lang.toUpperCase() : "US";
}
