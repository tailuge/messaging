#!/usr/bin/env node
// Seed generator for the K-idols deck (`<ul id="challenge-data">` in
// src/client/reveal/index.html). Prints ready-to-paste <li> entries — one per
// famous female South Korean actress / singer / celebrity — to stdout.
//
// Only JSON metadata is ever requested — no image, thumbnail or wiki page is
// downloaded. A single concurrent pass over `generator=categorymembers` with
// `prop=pageimages|info|pageviews|pageprops` gives every card its data:
//   * `pageimages` -> the canonical Wikimedia image URL and the Commons file name
//                     (never the image itself)
//   * `info`       -> article size
//   * `pageviews`  -> views over the last 60 days
//   * `pageprops`  -> disambiguation flag and the Wikidata QID
//
// Each card carries both raw metrics — `data-bytes` (article size) and
// `data-views` (60-day pageviews) — while `data-rating` normalises whichever one
// ranks the deck (ascending, exactly like the existing entries).
//
// Attribution: Commons images are mostly CC BY / CC BY-SA, which require credit,
// so the selected images get one extra metadata call (`prop=imageinfo`,
// `iiprop=extmetadata`) that adds `data-image-license`, `data-image-license-url`,
// `data-image-author`, `data-image-page` (the Commons file page to link) and,
// when Commons flags one, `data-image-restrictions` (e.g. personality rights).
//
// Usage:
//   node scripts/reveal-kidols.mjs                 # top 47, paste into index.html
//   node scripts/reveal-kidols.mjs --limit 100     # a longer list
//   node scripts/reveal-kidols.mjs --sort bytes    # rank by article size, not pageviews
//   node scripts/reveal-kidols.mjs --min-score 5000 # drop the less famous tail
//   node scripts/reveal-kidols.mjs --depth 0       # seeds only, no subcategory walking
//   node scripts/reveal-kidols.mjs --no-licence    # skip the attribution lookup
//   node scripts/reveal-kidols.mjs --json          # JSON records instead of HTML
//
// Progress goes to stderr, so `node scripts/reveal-kidols.mjs > deck.html` writes
// only the markup.

const API = "https://en.wikipedia.org/w/api.php";
const USER_AGENT =
  "tailuge-reveal-kidols/1.0 (https://billiards.tailuge.workers.dev/reveal/)";

// How many category requests are in flight at once. Wikipedia is fine with this
// at our request rate; it is what keeps the walk to a few seconds.
const CONCURRENCY = 6;

// verbatim Wikipedia category names (without the "Category:" prefix).
const SEED_CATEGORIES = [
  "South Korean actresses",
  "South Korean film actresses",
  "South Korean television actresses",
  "20th-century South Korean actresses",
  "21st-century South Korean actresses",
  "South Korean women singers",
  "South Korean women pop singers",
  "South Korean female idols",
  "South Korean women dancers",
  "South Korean female models",
  "South Korean women television presenters",
];

// Groups and labels the above categories reach: the deck is one card per person,
// so anything collected here is removed from the candidates.
const EXCLUDE_CATEGORIES = [
  "South Korean girl groups",
  "South Korean boy bands",
  "South Korean musical groups",
  "South Korean pop music groups",
  "K-pop music groups",
  "South Korean idol groups",
  "South Korean hip hop groups",
  "South Korean musical duos",
  "South Korean musical trios",
  "South Korean musical quartets",
  "South Korean musical quintets",
  "South Korean rock music groups",
  "South Korean record labels",
];

const SKIP_TITLE = /^(List of|Outline of|Index of)\b/i;

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};

const LIMIT = Number(argValue("--limit", 47));
const DEPTH = Number(argValue("--depth", 1));
const MIN_SCORE = Number(argValue("--min-score", 0));
const SORT_KEY = argValue("--sort", "views");
const AS_JSON = args.includes("--json");
const WITH_LICENCE = !args.includes("--no-licence");
const CREATED = new Date().toISOString().slice(0, 10);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(params, { retries = 4 } = {}) {
  const url = new URL(API);
  for (const [key, value] of Object.entries({
    format: "json",
    formatversion: "2",
    ...params,
  })) {
    url.searchParams.set(key, String(value));
  }
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (res.status === 429 || res.status >= 500) {
      await sleep(500 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${API}`);
    return res.json();
  }
  throw new Error(`Gave up on ${url.searchParams.get("gcmtitle") ?? url}`);
}

// pageimages appends ?utm_source=… tracking; the deck's URLs are bare, so drop it.
function cleanImageUrl(url) {
  if (!url) return null;
  const parsed = new URL(url);
  const kept = Array.from(parsed.searchParams).filter(
    ([key]) => !key.startsWith("utm_"),
  );
  parsed.search = kept.length ? `?${new URLSearchParams(kept)}` : "";
  return parsed.toString();
}

function toRecord(page) {
  return {
    name: page.title,
    image:
      cleanImageUrl(page.thumbnail?.source) ??
      cleanImageUrl(page.original?.source) ??
      null,
    // Commons file name, so the licence can be looked up from the file page.
    pageimage: page.pageimage ?? null,
    bytes: page.length ?? 0,
    views: Object.values(page.pageviews ?? {}).reduce((sum, n) => sum + n, 0),
    wikidata: page.pageprops?.wikibase_item ?? null,
    disambiguation: page.pageprops ? "disambiguation" in page.pageprops : false,
  };
}

// One category -> its article titles (+ records, when details are wanted) and its
// subcategories, paginating with gcmcontinue. Everything comes from this one call.
async function fetchCategory(name, withDetails) {
  const titles = [];
  const records = [];
  const subcats = [];
  let cont;
  do {
    const data = await api({
      action: "query",
      generator: "categorymembers",
      gcmtitle: `Category:${name}`,
      gcmtype: "page|subcat",
      gcmlimit: 500,
      ...(cont ? { gcmcontinue: cont } : {}),
      ...(withDetails
        ? {
            prop: "pageimages|info|pageviews|pageprops",
            piprop: "thumbnail|original|name",
            pithumbsize: 1280,
            ppprop: "disambiguation|wikibase_item",
          }
        : {}),
    });
    for (const page of data.query?.pages ?? []) {
      if (page.ns === 14) {
        subcats.push(page.title.replace(/^Category:/, ""));
      } else if (page.ns === 0) {
        titles.push(page.title);
        if (withDetails) records.push(toRecord(page));
      }
    }
    cont = data.continue?.gcmcontinue;
  } while (cont);
  return { titles, subcats, records };
}

async function mapLimit(items, limit, fn) {
  const results = Array.from({ length: items.length });
  let next = 0;
  await Promise.all(
    Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        while (next < items.length) {
          const i = next++;
          results[i] = await fn(items[i]);
        }
      },
    ),
  );
  return results;
}

// Breadth-first walk, one level of categories at a time so a whole level is
// fetched concurrently. Returns records when `withDetails`, else just titles.
async function walkCategories(seeds, maxDepth, { withDetails }) {
  const records = new Map();
  const titles = new Set();
  const visited = new Set();
  let wave = seeds.map((name) => ({ name, depth: 0 }));

  while (wave.length) {
    const level = wave.filter(({ name }) => !visited.has(name));
    for (const { name } of level) visited.add(name);
    wave = [];
    if (!level.length) break;

    const results = await mapLimit(level, CONCURRENCY, async ({ name, depth }) => {
      const res = await fetchCategory(name, withDetails);
      console.error(
        `  ${name}: ${res.titles.length} articles${depth < maxDepth ? `, ${res.subcats.length} subcategories` : ""}`,
      );
      return { ...res, depth };
    });

    for (const { depth, titles: t, subcats, records: r } of results) {
      for (const title of t) titles.add(title);
      for (const record of r) records.set(record.name, record);
      if (depth < maxDepth) {
        for (const sub of subcats) wave.push({ name: sub, depth: depth + 1 });
      }
    }
  }

  return withDetails ? [...records.values()] : new Set(titles);
}

// Attribution metadata worth keeping. `Artist`/`Credit` come back as HTML, so
// they are flattened to text; `Restrictions` flags things like personality rights.
const LICENSE_FIELDS = [
  "LicenseShortName",
  "LicenseUrl",
  "UsageTerms",
  "Artist",
  "Credit",
  "AttributionRequired",
  "Restrictions",
];

// "File:Some_name.jpg" and "Some name.jpg" resolve to the same Commons file.
function fileKey(title) {
  const name = title.replace(/^File:/, "").replace(/_/g, " ").trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// One request per 50 images, run over the final selection only — the candidates
// that lost do not need attribution.
async function fetchLicenses(records) {
  const names = new Set();
  for (const record of records) {
    if (record.pageimage) names.add(fileKey(record.pageimage));
  }
  const titles = [...names].map((name) => `File:${name}`);
  const byFile = new Map();

  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const data = await api({
      action: "query",
      titles: batch.join("|"),
      prop: "imageinfo",
      iiprop: "extmetadata|user|url",
      iiextmetadatafilter: LICENSE_FIELDS.join("|"),
    });
    for (const page of data.query?.pages ?? []) {
      // The file page usually lives on Commons, so en.wikipedia reports it as
      // "missing" while still serving the imageinfo — only skip when there is none.
      const info = page.imageinfo?.[0];
      if (!info) continue;
      const meta = info.extmetadata ?? {};
      const value = (key) => stripHtml(meta[key]?.value);
      const attribution = value("Artist") || value("Credit");
      byFile.set(fileKey(page.title), {
        license: value("LicenseShortName") || value("UsageTerms"),
        licenseUrl: value("LicenseUrl"),
        author: attribution.length > 120 ? `${attribution.slice(0, 117)}…` : attribution,
        page: info.descriptionurl ?? null,
        restrictions: value("Restrictions"),
      });
    }
    console.error(
      `  licences ${Math.min(i + 50, titles.length)}/${titles.length}`,
    );
  }
  return byFile;
}

const escapeHtml = (text) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const wikiUrl = (title) =>
  `https://en.wikipedia.org/wiki/${encodeURI(title.replace(/ /g, "_"))}`;

// 0.1711 / 0.208 / 0.39 / 1 — four decimals, trailing zeros trimmed, like the seed data.
const formatRating = (rating) => String(Number(rating.toFixed(4)));

function renderHtml(entries) {
  const blocks = entries.map((entry) => {
    const attrs = [
      `                href="${escapeHtml(wikiUrl(entry.name))}"`,
      `                data-image="${escapeHtml(entry.image)}"`,
      `                data-bytes="${entry.bytes}"`,
      `                data-views="${entry.views}"`,
      `                data-rating="${formatRating(entry.rating)}"`,
      `                data-created="${CREATED}"`,
    ];
    for (const [name, value] of [
      ["data-image-license", entry.license],
      ["data-image-license-url", entry.licenseUrl],
      ["data-image-author", entry.author],
      ["data-image-page", entry.page],
      ["data-image-restrictions", entry.restrictions],
    ]) {
      if (value) attrs.push(`                ${name}="${escapeHtml(value)}"`);
    }
    return `            <li>
              <a
${attrs.join("\n")}
                >${escapeHtml(entry.name)}</a
              >
            </li>`;
  });
  return ['          <ul id="challenge-data">', ...blocks, "          </ul>"].join(
    "\n",
  );
}

async function main() {
  if (!["views", "bytes"].includes(SORT_KEY)) {
    throw new Error(`--sort must be "views" or "bytes", got "${SORT_KEY}"`);
  }

  console.error(`Collecting people (depth ${DEPTH}, ${CONCURRENCY} at a time)…`);
  const people = await walkCategories(SEED_CATEGORIES, DEPTH, {
    withDetails: true,
  });

  console.error(`\nCollecting groups and labels to exclude…`);
  const groups = await walkCategories(EXCLUDE_CATEGORIES, 0, {
    withDetails: false,
  });

  const candidates = people
    .filter(
      (person) =>
        !groups.has(person.name) &&
        person.image &&
        !person.disambiguation &&
        !SKIP_TITLE.test(person.name) &&
        person[SORT_KEY] >= MIN_SCORE,
    )
    .sort((a, b) => b[SORT_KEY] - a[SORT_KEY])
    .slice(0, LIMIT);

  if (!candidates.length) throw new Error("No candidates with an image found");
  const max = candidates[0][SORT_KEY] || 1;

  let byFile = new Map();
  if (WITH_LICENCE) {
    console.error(`\nFetching image licences…`);
    byFile = await fetchLicenses(candidates);
  }

  // The deck is authored in ascending data-rating order, so reverse the ranking.
  const entries = candidates
    .map((person) => ({
      ...person,
      ...byFile.get(fileKey(person.pageimage ?? "")),
      rating: Math.min(person[SORT_KEY] / max, 1),
    }))
    .reverse();

  const metric = SORT_KEY === "views" ? "60-day pageviews" : "article size";
  console.error(
    `\n${people.length} people -> ${groups.size} excluded -> ${entries.length} entries with image/wiki, ranked by ${metric}`,
  );

  if (AS_JSON) {
    console.log(JSON.stringify(entries, null, 2));
  } else {
    console.log(renderHtml(entries));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
