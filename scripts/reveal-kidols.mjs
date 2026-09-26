#!/usr/bin/env node
// Seed generator for the reveal decks (`<ul id="challenge-data">` in
// src/client/reveal/index.html). Collects one entry per famous female
// celebrity — South Korean, Japanese, Chinese — and writes a human-review page
// to docker/html/decks.html, served by nginx alongside the client, so the
// candidate links, images and licences can be eyeballed in a browser before any
// of it is pasted into index.html. Each deck gets its own collapsed section and
// its images are only fetched once that section is opened.
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
//   node scripts/reveal-kidols.mjs                 # all decks, top 32 by article size
//   node scripts/reveal-kidols.mjs --deck japan    # just one deck
//   node scripts/reveal-kidols.mjs --limit 100     # a longer list
//   node scripts/reveal-kidols.mjs --sort views    # rank by 60-day pageviews, not article size
//   node scripts/reveal-kidols.mjs --min-score 5000 # drop the less famous tail
//   node scripts/reveal-kidols.mjs --depth 0       # seeds only, no subcategory walking
//   node scripts/reveal-kidols.mjs --no-licence    # skip the attribution lookup
//   node scripts/reveal-kidols.mjs --out path.html # write the review page elsewhere
//   node scripts/reveal-kidols.mjs --json          # JSON records to stdout instead
//
// Everything except an explicit `--json` goes to the review page, and progress
// goes to stderr, so stdout stays clean.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://en.wikipedia.org/w/api.php";
const USER_AGENT =
  "tailuge-reveal-kidols/1.0 (https://billiards.tailuge.workers.dev/reveal/)";

// How many category requests are in flight at once. Wikipedia is fine with this
// at our request rate; it is what keeps the walk to a few seconds.
const CONCURRENCY = 6;

// One deck per regional celebrity category. `seeds` are the categories walked
// (verbatim Wikipedia names, without the "Category:" prefix); `exclude` is
// walked at depth 0 only and dropped, because the subcategory walk below the
// seeds reaches bands, groups and labels that are not people. `skip` drops
// individual articles that category membership cannot — mostly men who are
// categorised with their female counterparts.
const DECKS = [
  {
    id: "korea",
    label: "South Korean celebrities",
    seeds: [
      "South Korean actresses",
      "South Korean film actresses",
      "South Korean television actresses",
      "21st-century South Korean actresses",
      "South Korean women singers",
      "South Korean women pop singers",
      "South Korean female idols",
      "South Korean female models",
      "South Korean women television presenters",
    ],
    exclude: [
      "South Korean men actors",
      "South Korean male models",
      "South Korean male musicians",
      "South Korean girl groups",
      "South Korean boy bands",
      "South Korean musical groups",
      "South Korean pop music groups",
      "K-pop music groups",
      "South Korean idol groups",
      "South Korean musical theatre actresses",
      "South Korean hip hop groups",
      "South Korean musical duos",
      "South Korean musical trios",
      "South Korean musical quartets",
      "South Korean musical quintets",
      "South Korean rock music groups",
      "South Korean record labels",
    ],
    skip: ["Choi Jin-sil"],
  },
  {
    id: "japan",
    label: "Japanese celebrities",
    seeds: [
      "Japanese women actors",
      "Japanese film actresses",
      "Japanese television actresses",
      "Japanese women singers",
      "Japanese women pop singers",
      "Japanese female models",
      "Japanese women television presenters",
    ],
    exclude: [
      "Japanese men actors",
      "Japanese male models",
      "Japanese male musicians",
      "Japanese girl groups",
      "Japanese boy bands",
      "Japanese musical groups",
      "Japanese pop music groups",
      "Japanese idol groups",
      "Japanese musical theatre actresses",
      "Japanese hip hop groups",
      "Japanese musical duos",
      "Japanese musical trios",
      "Japanese musical quartets",
      "Japanese rock music groups",
      "Japanese women rock singers",
      "Japanese record labels",
    ],
    skip: ["Asuka (wrestler)", "Hamuko Hoshi", "Yuzuki Aikawa", "Tsukasa Fujimoto"],
  },
  {
    id: "china",
    label: "Chinese celebrities",
    seeds: [
      "Chinese women actors",
      "Chinese film actresses",
      "Chinese television actresses",
      "Chinese women singers",
      "Chinese women pop singers",
      "Chinese female models",
      "Chinese women television presenters",
    ],
    exclude: [
      "Chinese men actors",
      "Chinese male models",
      "Chinese male musicians",
      "Chinese girl groups",
      "Chinese boy bands",
      "Chinese musical groups",
      "Chinese pop music groups",
      "Chinese idol groups",
      "Chinese musical theatre actresses",
      "Chinese hip hop groups",
      "Chinese musical duos",
      "Chinese musical trios",
      "Chinese musical quartets",
      "Chinese rock music groups",
      "Chinese record labels",
    ],
    skip: ["Sylvia Chang", "Priscilla Chan (singer)"],
  },
];

const SKIP_TITLE = /^(List of|Outline of|Index of)\b/i;

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};

// Deck size and ranking metric the decks ship with: the 32 biggest articles by
// size, which each deck still emits in ascending data-rating order.
const DECK_IDS = argValue("--deck", DECKS.map((d) => d.id).join(","));
const DECK_LIST = DECK_IDS.split(",")
  .map((id) => id.trim())
  .filter(Boolean)
  .map((id) => {
    const deck = DECKS.find((d) => d.id === id);
    if (!deck) throw new Error(`--deck must be one of ${DECKS.map((d) => d.id).join(", ")}, got "${id}"`);
    return deck;
  });
const LIMIT = Number(argValue("--limit", 32));
const DEPTH = Number(argValue("--depth", 1));
const MIN_SCORE = Number(argValue("--min-score", 0));
const SORT_KEY = argValue("--sort", "bytes");
const AS_JSON = args.includes("--json");
const WITH_LICENCE = !args.includes("--no-licence");

// Review page, served by nginx from /usr/share/nginx/html (see docker/Dockerfile).
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = resolve(
  SCRIPT_DIR,
  argValue("--out", "../docker/html/decks.html"),
);
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
// Either way it returns a `sources` map of article title -> the categories it
// was found under, so the review page can show where a candidate came from.
async function walkCategories(seeds, maxDepth, { withDetails }) {
  const records = new Map();
  const titles = new Set();
  const sources = new Map();
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
      return { ...res, depth, name };
    });

    for (const { depth, name, titles: t, subcats, records: r } of results) {
      for (const title of t) {
        titles.add(title);
        // A person can sit in several categories; keep them all, they are what
        // makes the review page's "found under" column worth reading.
        if (!sources.has(title)) sources.set(title, new Set());
        sources.get(title).add(name);
      }
      for (const record of r) records.set(record.name, record);
      if (depth < maxDepth) {
        for (const sub of subcats) wave.push({ name: sub, depth: depth + 1 });
      }
    }
  }

  if (withDetails) {
    for (const record of records.values()) {
      record.categories = [...(sources.get(record.name) ?? [])];
    }
    return [...records.values()];
  }
  return new Set(titles);
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

// One row per candidate, with everything a human needs to check it — the article,
// the image actually used, its licence/author, and the raw metrics the deck ranks
// on. Images are parked in data-src: the section script below only moves them to
// src when the deck section is opened, so a closed deck costs no image requests.
function renderRows(entries) {
  return entries
    .map((entry, i) => {
      const link = (href, text) =>
        href
          ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(text ?? href)}</a>`
          : `<span class="none">—</span>`;
      // One category is enough here — a person sits in several, and listing them
      // all just makes the column tall. Alphabetical keeps it stable across runs.
      const cat = [...(entry.categories ?? [])].sort()[0];
      const catCell = cat
        ? `<a href="https://en.wikipedia.org/wiki/Category:${encodeURI(cat.replace(/ /g, "_"))}" target="_blank" rel="noopener">${escapeHtml(cat)}</a>`
        : `<span class="none">—</span>`;
      return `      <tr>
        <td class="num">${i + 1}</td>
        <td class="name">${link(wikiUrl(entry.name), entry.name)}</td>
        <td class="img">${entry.image ? `<a href="${escapeHtml(entry.image)}" target="_blank" rel="noopener"><img data-src="${escapeHtml(entry.image)}" alt="${escapeHtml(entry.name)}" width="64" height="64"></a>` : `<span class="none">—</span>`}</td>
        <td class="small">${catCell}</td>
        <td class="small">${entry.page ? `<a href="${escapeHtml(entry.page)}" target="_blank" rel="noopener" title="${escapeHtml(entry.pageimage ?? entry.page)}">🔗</a>` : ""}</td>
        <td class="small">${link(entry.licenseUrl, entry.license ?? "")}</td>
        <td class="small">${escapeHtml(entry.author ?? "") || `<span class="none">—</span>`}</td>
        <td class="small">${entry.restrictions ? `<span class="warn">${escapeHtml(entry.restrictions)}</span>` : ""}</td>
        <td class="num">${entry.bytes.toLocaleString("en")}</td>
        <td class="num">${entry.views.toLocaleString("en")}</td>
        <td class="num">${formatRating(entry.rating)}</td>
      </tr>`;
    })
    .join("\n");
}

function renderDeck(deck, { metric, minScore, depth }) {
  return `<details class="deck" id="${deck.id}">
  <summary>${escapeHtml(deck.label)} — ${deck.entries.length} entries</summary>
  <p class="meta">generated ${CREATED} · ranked by ${escapeHtml(metric)} · depth ${depth}${minScore ? ` · min score ${minScore}` : ""}</p>
  <table>
    <thead>
      <tr>
        <th class="num">#</th><th>article</th><th>image</th><th>found under</th><th>file page</th>
        <th>licence</th><th>author</th><th>restrictions</th>
        <th class="num">bytes</th><th class="num">views</th><th class="num">rating</th>
      </tr>
    </thead>
    <tbody>
${renderRows(deck.entries)}
    </tbody>
  </table>
  <details>
    <summary>Deck markup — paste into <code>&lt;ul id="challenge-data"&gt;</code> in <code>src/client/reveal/index.html</code></summary>
    <pre>${escapeHtml(renderHtml(deck.entries))}</pre>
  </details>
</details>`;
}

// Standalone review page: one collapsed section per deck, served by nginx from
// /decks.html.
function renderReviewPage(decks, { metric, minScore, depth }) {
  const total = decks.reduce((sum, deck) => sum + deck.entries.length, 0);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reveal deck candidates</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.5 system-ui, sans-serif; margin: 1.5rem; }
  h1 { font-size: 1.25rem; }
  p.meta { opacity: 0.7; margin: 0 0 0.5rem; font-size: 0.85rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border-bottom: 1px solid #8884; padding: 0.35rem 0.5rem; text-align: left; vertical-align: middle; }
  td.name { white-space: nowrap; }
  th { position: sticky; top: 0; background: Canvas; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.small { font-size: 0.8rem; max-width: 22rem; overflow-wrap: anywhere; }
  td.img img { object-fit: cover; border-radius: 4px; }
  .none { opacity: 0.4; }
  .warn { color: #c60; }
  details.deck { margin-bottom: 1.5rem; }
  details.deck > summary { font-size: 1.1rem; font-weight: 600; cursor: pointer; }
  details { margin-top: 1rem; }
  pre { white-space: pre; overflow-x: auto; background: #8881; padding: 0.75rem; }
</style>
</head>
<body>
<h1>Reveal deck candidates</h1>
<p class="meta">${total} entries across ${decks.length} ${decks.length === 1 ? "deck" : "decks"} · generated ${CREATED}</p>
${decks.map((deck) => renderDeck(deck, { metric, minScore, depth })).join("\n")}
<script>
  // Images sit in data-src until their section is opened, so a deck nobody looks
  // at costs nothing.
  for (const section of document.querySelectorAll("details.deck")) {
    section.addEventListener("toggle", () => {
      if (!section.open) return;
      for (const img of section.querySelectorAll("img[data-src]")) {
        img.src = img.dataset.src;
        img.removeAttribute("data-src");
      }
    });
  }
</script>
</body>
</html>
`;
}

async function buildDeck(deck) {
  console.error(`\n=== ${deck.label} ===`);
  console.error(`Collecting people (depth ${DEPTH}, ${CONCURRENCY} at a time)…`);
  const people = await walkCategories(deck.seeds, DEPTH, {
    withDetails: true,
  });

  console.error(`\nCollecting groups and labels to exclude…`);
  const groups = await walkCategories(deck.exclude, 0, {
    withDetails: false,
  });

  const candidates = people
    .filter(
      (person) =>
        !groups.has(person.name) &&
        person.image &&
        !person.disambiguation &&
        !SKIP_TITLE.test(person.name) &&
        !(deck.skip ?? []).includes(person.name) &&
        person[SORT_KEY] >= MIN_SCORE,
    )
    .sort((a, b) => b[SORT_KEY] - a[SORT_KEY])
    .slice(0, LIMIT);

  if (!candidates.length) throw new Error(`${deck.label}: no candidates with an image found`);
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
    `${people.length} people -> ${groups.size} excluded -> ${entries.length} entries with image/wiki, ranked by ${metric}`,
  );
  return { ...deck, entries };
}

async function main() {
  if (!["views", "bytes"].includes(SORT_KEY)) {
    throw new Error(`--sort must be "views" or "bytes", got "${SORT_KEY}"`);
  }

  const built = [];
  for (const deck of DECK_LIST) built.push(await buildDeck(deck));

  if (AS_JSON) {
    console.log(
      JSON.stringify(
        built.length === 1 ? built[0].entries : Object.fromEntries(built.map((d) => [d.id, d.entries])),
        null,
        2,
      ),
    );
    return;
  }

  const metric = SORT_KEY === "views" ? "60-day pageviews" : "article size";
  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, renderReviewPage(built, { metric, minScore: MIN_SCORE, depth: DEPTH }));
  console.error(
    `\nWrote ${built.length} ${built.length === 1 ? "deck" : "decks"}, ${built.reduce((n, d) => n + d.entries.length, 0)} entries to ${OUT_FILE}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
