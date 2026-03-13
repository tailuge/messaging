const GLOBE = "🌐";

/**
 * Converts a 2-letter country code to a flag emoji.
 * Invalid codes (e.g., "XX", empty, or non-2-char strings) return the globe emoji.
 */
export function countryToFlag(country: string | undefined): string {
  if (!country || country.length !== 2 || !/^[A-Za-z]{2}$/.test(country)) {
    return GLOBE;
  }
  return country
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}
