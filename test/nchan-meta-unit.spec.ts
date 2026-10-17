// @ts-nocheck — the suite has no @types/node, matching the other unit specs.
import fs from "fs";
import path from "path";

// docker/nchan_meta.js runs inside NJS, where `ngx` and `require` are globals.
// None of the classification helpers touch either, so the module body can be
// evaluated over stubs and its pure functions exercised directly.
function loadNchanMeta(): any {
  const file = path.resolve(process.cwd(), "docker/nchan_meta.js");
  const source = fs.readFileSync(file, "utf-8").replace(/export default \{[\s\S]*?\};/, "");
  expect(source).not.toContain("export default");
  const ngx = { log: () => {}, WARN: "warn", shared: {}, fetch: () => Promise.reject(new Error("no fetch")) };
  const requireStub = () => {
    throw new Error("require is not available in this test");
  };
  return new Function(
    "ngx",
    "require",
    `${source}
     return { parseUA, cacheSafeUA, classifyForCache, formatCacheValue };`
  )(ngx, requireStub);
}

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
// ChromeOS: the OS regexes in parseUA() have no "CrOS" token, so this is one of
// the real-world cases where the OS is unknown while the browser is not.
const CHROME_OS =
  "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36";

describe("nchan_meta ip_cache user agent retention", () => {
  let meta: any;

  beforeEach(() => {
    meta = loadNchanMeta();
  });

  test("classified user agents are written unchanged", () => {
    const value = meta.formatCacheValue(
      "US",
      "Boydton",
      3,
      "https://tailuge.github.io",
      meta.parseUA(CHROME_WINDOWS),
      CHROME_WINDOWS
    );

    expect(value).toBe("US|Boydton|3|https://tailuge.github.io|Windows|Chrome");
  });

  test("an unclassified OS keeps the raw user agent instead of the Unknown keyword", () => {
    const value = meta.formatCacheValue(
      "US",
      "San Jose",
      1,
      "",
      meta.parseUA(CHROME_OS),
      CHROME_OS
    );
    const parts = value.split("|");

    expect(parts).toHaveLength(6);
    expect(parts[4]).toBe(CHROME_OS);
    expect(parts[5]).toBe("Chrome");
    expect(value).not.toContain("Unknown");
  });

  test("an unclassified browser keeps the raw user agent too", () => {
    const ua = "Mozilla/5.0 (X11; Linux x86_64) UnknownBrowser/1.0";
    const parts = meta.formatCacheValue("GB", "Blackwood", 2, "/", meta.parseUA(ua), ua).split("|");

    expect(parts[4]).toBe("Linux");
    expect(parts[5]).toBe(ua);
  });

  test("a fully unclassified user agent fills both fields with the raw string", () => {
    const ua = "SomeCustomAgent/1.0 (en-US)";
    const parts = meta.formatCacheValue("GR", "Athens", 7, "/", meta.parseUA(ua), ua).split("|");

    expect(parts).toEqual(["GR", "Athens", "7", "/", ua, ua]);
  });

  test("a user agent with pipes cannot add cache fields", () => {
    const ua = "Weird|Agent/1.0";
    const parts = meta.formatCacheValue("NP", "", 1, "", meta.parseUA(ua), ua).split("|");

    expect(parts).toHaveLength(6);
    expect(parts[4]).toBe("Weird Agent/1.0");
    expect(parts[5]).toBe("Weird Agent/1.0");
  });

  test("stored user agents are single-line and length capped", () => {
    const ua = `Bot/1.0\n${"x".repeat(400)}`;
    const stored = meta.cacheSafeUA(ua);

    expect(stored.startsWith("Bot/1.0 x")).toBe(true);
    expect(stored).not.toContain("\n");
    expect(stored.length).toBe(200);
  });

  test("an absent user agent keeps the Unknown keyword, since there is nothing to retain", () => {
    const value = meta.formatCacheValue("XX", "", 1, "", meta.parseUA(""), "");
    expect(value).toBe("XX||1||Unknown|Unknown");
  });
});
