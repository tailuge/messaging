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
     return { parseUA, reduceUA, cacheSafeUA, classifyForCache, formatCacheValue };`
  )(ngx, requireStub);
}

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const CHROME_OS =
  "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36";
const UBUNTU_CHROME =
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
// Old Firefox on Linux carries a `U` locale token where newer UAs have the OS.
const FIREFOX_LINUX_LEGACY =
  "Mozilla/5.0 (X11; U; Linux i686; en-US; rv:1.9.2.8) Gecko/20101026 Firefox/3.6.12";
// An OS parseUA() genuinely cannot classify, with a browser it can.
const PLAYSTATION =
  "Mozilla/5.0 (PlayStation; PlayStation 5/2.26) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0 Safari/605.1.15";
const CHROMIUM =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chromium/120.0.6099.71 Chrome/120.0.6099.71 Safari/537.36";
const EDGE_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";
const OPERA_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/114.0.0.0";
const SAMSUNG_ANDROID =
  "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36";
const FIREFOX_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0";
const TAURI =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) tbilliards/1.2.3 Tauri/2.0.0";
// Pinterest's in-app browser: a WebKit app shell with no Safari token at all.
const PINTEREST_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Pinterest/iOS";

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

    expect(value).toBe("US|Boydton|3|https://tailuge.github.io|Win|Chr");
  });

  test("ChromeOS is classified from the X11 platform token", () => {
    const parts = meta.formatCacheValue("US", "San Jose", 1, "", meta.parseUA(CHROME_OS), CHROME_OS)
      .split("|");

    expect(parts[4]).toBe("Chr");
    expect(parts[5]).toBe("Chr");
  });

  test("the reduced user agent in meta.ua uses the short labels", () => {
    // OS and browser labels are independent, so Chrome on ChromeOS is "Chr Chr".
    expect(meta.reduceUA(CHROME_OS)).toBe("Chr Chr");
    expect(meta.reduceUA(CHROME_WINDOWS)).toBe("Win Chr");
  });

  test("browser labels are three letters, with a fourth to split a family", () => {
    expect(meta.parseUA(CHROME_WINDOWS).browser).toBe("Chr");
    expect(meta.parseUA(CHROMIUM).browser).toBe("Chro");
    expect(meta.parseUA(EDGE_WINDOWS).browser).toBe("Edg");
    expect(meta.parseUA(FIREFOX_WINDOWS).browser).toBe("Fir");
    expect(meta.parseUA(OPERA_WINDOWS).browser).toBe("Opr");
    expect(meta.parseUA(SAMSUNG_ANDROID).browser).toBe("Sam");
    expect(meta.parseUA(PLAYSTATION).browser).toBe("Saf");
    expect(meta.reduceUA(TAURI)).toBe("Tau Tau");
  });

  test("the Pinterest in-app browser is classified as Pin", () => {
    expect(meta.parseUA(PINTEREST_IOS)).toEqual({ os: "iOS", browser: "Pin" });
    expect(meta.reduceUA(PINTEREST_IOS)).toBe("iOS Pin");
  });

  test("a real browser token still wins over the late Pinterest rule", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Pinterest/1.0";
    expect(meta.parseUA(ua).browser).toBe("Chr");
  });

  test("X11 platform tokens give three-letter OS labels", () => {
    expect(meta.parseUA(CHROME_OS).os).toBe("Chr");
    expect(meta.parseUA(UBUNTU_CHROME).os).toBe("Ubu");
    expect(meta.parseUA(FIREFOX_LINUX_LEGACY).os).toBe("Lnx");
    expect(
      meta.parseUA("Mozilla/5.0 (X11; FreeBSD amd64) Gecko/20100101 Firefox/115.0").os
    ).toBe("Fre");
    expect(meta.parseUA(CHROME_WINDOWS).os).toBe("Win");
  });

  test("an unclassified OS keeps the raw user agent instead of the Unknown keyword", () => {
    const value = meta.formatCacheValue("US", "San Jose", 1, "", meta.parseUA(PLAYSTATION), PLAYSTATION);
    const parts = value.split("|");

    expect(parts).toHaveLength(6);
    expect(parts[4]).toBe(PLAYSTATION);
    expect(parts[5]).toBe("Saf");
    expect(value).not.toContain("Unknown");
  });

  test("an unclassified browser keeps the raw user agent too", () => {
    const ua = "Mozilla/5.0 (X11; Linux x86_64) UnknownBrowser/1.0";
    const parts = meta.formatCacheValue("GB", "Blackwood", 2, "/", meta.parseUA(ua), ua).split("|");

    expect(parts[4]).toBe("Lnx");
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
