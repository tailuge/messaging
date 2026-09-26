#!/usr/bin/env node
// Seed generator for the reveal decks (`<ul id="challenge-data">` in
// src/client/reveal/index.html). Collects one entry per famous female
// celebrity — South Korean — one per Taiwanese pop star of either gender, plus
// a "watches" deck of premium watch models, a "tokyo" deck of that city's
// landmarks and a "taipei" deck of Taipei's and Taiwan's, and writes a
// human-review page to docker/html/decks.html,
// served by nginx alongside the client, so the
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
//   node scripts/reveal-kidols.mjs --deck taiwan   # just one deck
//   node scripts/reveal-kidols.mjs --deck watches --sort views
//   node scripts/reveal-kidols.mjs --limit 100     # a longer list
//   node scripts/reveal-kidols.mjs --sort views    # rank by 60-day pageviews, not article size
//   node scripts/reveal-kidols.mjs --min-score 5000 # drop the less famous tail
//   node scripts/reveal-kidols.mjs --depth 0       # seeds only, no subcategory walking
//   node scripts/reveal-kidols.mjs --no-licence    # skip the attribution lookup (Commons)
//   node scripts/reveal-kidols.mjs --out path.html # write the review page elsewhere
//   node scripts/reveal-kidols.mjs --json          # JSON records to stdout instead
//
// Everything except an explicit `--json` goes to the review page, and progress
// goes to stderr, so stdout stays clean.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://en.wikipedia.org/w/api.php";
// The image files live here; only their attribution metadata is read.
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT =
  "tailuge-reveal-kidols/1.0 (https://billiards.tailuge.workers.dev/reveal/)";

// How many category requests are in flight at once. Wikipedia is fine with this
// at our request rate; it is what keeps the walk to a few seconds. The cars deck
// asks for far more categories than the others and is the one that gets
// throttled, so the retry backoff above is what keeps a full run reliable.
const CONCURRENCY = 4;// One deck per regional celebrity category, plus the Tokyo, Taipei, watches and
// cars decks.
// `seeds` are the categories walked (verbatim Wikipedia names, without the
// "Category:" prefix); `exclude` is
// walked at depth 0 only and dropped, because the subcategory walk below the
// seeds reaches bands, groups and labels that are not people. `skip` drops
// individual articles that category membership cannot — mostly men who are
// categorised with their female counterparts. The cars deck is the exception:
// it pins `titles` instead, because "the dream cars" is not a category.
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
    // Taiwanese pop stars of either gender, ranked by the same article-size
    // default as the Korean deck. Seeded from the pop-family categories only
    // (pop, Mandopop, Hokkien pop, K-pop) rather than the wider
    // "Taiwanese singers" tree, so rock, folk and classical singers stay out.
    // Because the pop categories hold men and women side by side, both genders
    // arrive without a gender split; a person can also arrive through their
    // band's member subcategory ("F4 (band) members"), which is where most of
    // the boy-band and girl-group singers are filed. Walking the parent pop
    // category also reaches its three genre subcategories, so they are seeded
    // directly only to keep their own subcategories in the walk.
    id: "taiwan",
    label: "Taiwanese pop stars",
    seeds: [
      "Taiwanese pop singers",
      "Taiwanese Mandopop singers",
      "Taiwanese Hokkien pop singers",
      "Taiwanese K-pop singers",
    ],
    // The groups themselves, their labels, and the musical-theatre category
    // that the pop singers tree drags in. "Taiwanese musical quartets" and
    // "Taiwanese hip hop groups" do not exist as categories, so they are not
    // listed; a missing exclude is harmless, it just fetches nothing.
    exclude: [
      "Taiwanese boy bands",
      "Taiwanese girl groups",
      "Taiwanese musical groups",
      "Taiwanese pop music groups",
      "Taiwanese musical duos",
      "Taiwanese musical trios",
      "Taiwanese rock music groups",
      "Taiwanese record labels",
      "Taiwanese musical theatre actors",
    ],
    // A-yue (張震嶽), on the article "Chang Chen-yue": a headline Taiwanese
    // singer the pop-category walk misses because he is not filed under them.
    // `force` fetches the title directly and keeps it in the deck even when its
    // article size would not rank it inside the top LIMIT; redirected or
    // missing names are dropped, so a title with no article (or no image) can
    // be listed without breaking the run.
    force: ["Chang Chen-yue"],
  },
  {
    // Tokyo landmarks and buildings. Unlike the cars deck this is a real
    // category tree, so it walks rather than pinning titles. The seeds are the
    // content categories that actually hold landmark articles: "Tourist
    // attractions in Tokyo" carries the headline sights and, one level down,
    // the museums, parks, theatres, sports venues and palaces; the shrines and
    // temples sit two levels below it, so they are seeded directly. Skyscrapers
    // and office buildings are reached through their per-ward and skyscraper
    // subcategories at depth 1.
    id: "tokyo",
    label: "Tokyo landmarks",
    seeds: [
      "Tourist attractions in Tokyo",
      "Shinto shrines in Tokyo",
      "Buddhist temples in Tokyo",
      "Skyscrapers in Tokyo",
      "Office buildings in Tokyo",
      "Hotels in Tokyo",
      "Retail buildings in Tokyo",
    ],
    // "Tourist attractions in Tokyo" also files the city's natural features,
    // festivals and universities, and Akihabara is a shopping district rather
    // than a building. None of them belong in a deck of landmarks someone
    // recognises from a photo of the building itself.
    exclude: [
      "Lakes of Tokyo",
      "Mountains of Tokyo",
      "Rivers of Tokyo",
      "Festivals in Tokyo",
      "Universities and colleges in Tokyo",
      "Akihabara",
    ],
    // Historical events arrive through Edo Castle, which is itself skipped by
    // request (the palace grounds card is carried by the Imperial Palace
    // article instead), and the Izu Islands through the tourist categories, and
    // the anime fair through a venue. The Baseball Hall of Fame is a genuine
    // museum but its article is mostly inductee lists, so its size would float
    // it to the top of the deck ahead of the buildings themselves.
    skip: [
      "Sakuradamon incident (1932)",
      "Sakuradamon Incident (1860)",
      "Edo Castle",
      "Small Worlds Miniature Museum",
      "Ōoku",
      "Izu Islands",
      "Tokyo International Anime Fair",
      "Japanese Baseball Hall of Fame",
    ],
  },
  {
    // Taipei landmarks, buildings and tourist spots — deliberately
    // Taipei-centric: the island-wide trees were tried first and made an
    // islands deck, with Kinmen, Matsu, Penghu and the South China Sea
    // disputes swamping the city. Same shape as the tokyo deck: a real
    // category tree, walked at depth 1. "Tourist attractions in Taipei"
    // carries the headline sights and, one level down, the museums, parks,
    // gates, squares, sports venues, night markets and shopping malls;
    // "Buildings and structures in Taipei" reaches the hotels and offices.
    // The skyscrapers and the temples are seeded directly because their
    // categories sit one level too deep under those trees (office/hotel/
    // residential skyscrapers under "Skyscrapers in Taipei"; "Temples in
    // Taipei" under "Religious buildings and structures in Taipei").
    id: "taipei",
    label: "Taipei landmarks",
    seeds: [
      "Tourist attractions in Taipei",
      "Buildings and structures in Taipei",
      "Skyscrapers in Taipei",
      "Buddhist temples in Taipei",
      "Taoist temples in Taipei",
      "Night markets in Taipei",
    ],
    // Schools, hospitals, universities and libraries are buildings, but
    // nobody recognises them from their photos (the Rare Book Preservation
    // Society arrives through the libraries). Plain metro stations are the
    // same, so Taipei Main Station goes with them; Songshan Airport arrives
    // through the buildings tree.
    exclude: [
      "Schools in Taipei",
      "Hospitals in Taipei",
      "Universities and colleges in Taipei",
      "Libraries in Taipei",
      "Railway stations in Taipei",
      "Airports in Taiwan",
    ],
    // Events and phenomena that sit in the tourist category directly, with
    // no festival category to filter on. The "List of" index pages are
    // caught by SKIP_TITLE instead. Bishanyan (碧山巖) has no English
    // Wikipedia article to seed, and Huaxi Street night market is covered
    // by its article's other name, "Snake Alley (Taipei)".
    skip: [
      "Formoz Festival",
      "Taipei Marathon",
      "New Taipei City Wan Jin Shi Marathon",
      "Taipei New Year's Eve Party",
      "PokéPark",
      "Rainbow crossings in Taipei",
      "Taipei Grand Trail",
      // Zoo animals, a garden nobody guesses from a photo, and a diplomatic
      // office rather than a landmark.
      "Apostolic Nunciature to China",
      "Jiannan Butterfly Garden",
      "Tuan Tuan and Yuan Yuan",
      "Lin Wang",
    ],
  },
  {
    // Watches, not people. Same shape as the decks above, but seeded from the
    // handful of Wikipedia categories that actually hold watch articles —
    // "Watch models" plus the per-brand ones — because there is no "Luxury
    // watches" tree. A hand-written list of model names was tried first and
    // does not work: most of those models have no article at all (Rolex
    // Explorer resolves, Nautilus and Royal Oak do not), and "Cartier Santos"
    // redirects to an unrelated chart. Walking real categories gets real
    // articles, so the deck is a category walk like the rest.
    id: "watches",
    label: "Premium watches",
    // `seeds` are category names, not article titles. "Watch models" is the
    // only real tree of individual references; everything else is the brand
    // article's category, which brings its models with it. The Seiko/Swatch/
    // Casio seeds are there so the deck is not all Swiss luxury.
    seeds: [
      "Watch models",
      "Rolex watches",
      "Omega watches",
      "Breitling SA",
      "Casio brands",
      "The Swatch Group",
      "Seiko",
      "Cartier (brand)",
      "Audemars Piguet",
      "Patek Philippe",
    ],
    // The brand articles seed their own subtrees, and a watch company pulls in
    // its investors, its racing sponsorships and its designers. Drop the parent
    // brands wholesale (so Cartier the maison and Patek Philippe the company
    // are out, but Cartier Tank and the Calatrava stay) plus the people and
    // conglomerate categories, and skip the handful of named non-watches that
    // survive because they sit in no excludable category.
    exclude: [
      "Watch brands",
      "Watchmaking conglomerates",
      "Rolex",
      "Rolex people",
      "Citizen Watch",
      "Fossil Group",
      "Timex watches",
      "Soviet watch brands",
      "Ukrainian watch brands",
      "Watchmakers",
      "Watch designers",
      "Watch collecting",
      // The "Seiko" and "The Swatch Group" seeds are the reason for most of
      // these: both are company categories, so they drag in sister companies,
      // suppliers (ETA, Valjoux), a Swatch retailer, Epson and two executives.
      // Their watch articles are reached through "Watch models" and
      // "Casio brands" instead. "Swiss watchmakers (people)" is a person list.
      "Watch manufacturing companies of Japan",
      "Casio",
      "Japanese companies established in 1881",
      "Retail companies established in 1881",
      "Watch movement manufacturers",
      "Swiss watchmakers (people)",
      "Watch manufacturing companies of Switzerland",
      "Watch manufacturing companies of the United States",
      "Defunct watchmaking companies",
      "Amorphous metals",
      // Casio makes far more than watches; these are its cameras and music
      // players, which sit in "Casio brands" alongside the F-91W.
      "Casio digital cameras",
      "Casio musical instruments",
    ],
    skip: [
      "CVC Capital Partners",
      "Partners Group",
      "Antoni Patek",
      "Adrien Philippe",
      "Léon Breitling",
      "Gallet & Company",
      // A watch designer who arrives with no excludable category to filter on.
      "Elmar Mock",
      "Hans Wilsdorf Foundation",
      "Paris Masters",
      "24 Hours of Daytona",
      "Bucherer",
      "Epson",
      "Swatch",
      "Cartier (brand)",
      "Audemars Piguet",
      "Patek Philippe",
      // Generic/incidental subjects rather than a watch: "Watch" is the whole
      // topic (its image is a Casio Oceanus), and RockWatch was an aborted
      // 1980s smartwatch. Epson and Wako arrive with no watch category to filter
      // on, so they can only be named.
      "Watch",
      "RockWatch",
      "Epson",
      "Epson Robots",
      "Epson MX-80",
      "Wako (retailer)",
      "Nicolas Hayek",
      // Manufacturer/parent-company articles, not watches. They are highly
      // read, so views-ranking floats them to the hardest end of the deck where
      // a card should be a watch. Their model articles come in from the seeds.
      "Omega SA",
      "Longines",
      "Tissot",
      "Movado",
      "Seiko",
      "Tritium",
      "Lume",
      "Super-LumiNova",
      // "Spring Drive" and "Omega 28.9 chronograph" are calibres/movements, not
      // watches a player would recognise by its picture.
      "Spring Drive",
      "Omega 28.9 chronograph",
      // The Rolex Yacht-Master card's picture is a street photo of a Basel
      // building that happens to be in frame; nothing to reveal.
      "Rolex Yacht-Master",
      // Reviewed on the generated page and dropped by hand: the Casio Loopy is
      // a child's console-and-watch set rather than a watch, and MoonSwatch and
      // the Breitling Orbiter are Swatch/Breitling lines nobody picks out of a
      // line-up of watches.
      "Casio Loopy",
      "MoonSwatch",
      "Breitling Orbiter",
    ],
  },
  {
    // The dream cars, pinned by article title. This is the one deck that is a
    // hand-written list rather than a category walk: Wikipedia has no category
    // for "the cars you wanted as a kid", and the per-marque "vehicles" trees
    // are full of runabouts and near-duplicate generation articles. A category
    // walk was tried first and produced 677 candidates of which the recognisable
    // handful was a small fraction.
    //
    // Names are the ones on the articles, not the colloquial ones: the R34
    // Skyline and the A80 Supra are both covered by the model article above, and
    // the FD RX-7 by "Mazda RX-7". "DeLorean DMC-12" is a redirect to
    // "DMC DeLorean" and keeps the name it was asked for.
    id: "cars",
    label: "Dream cars",
    titles: [
      "Nissan Skyline GT-R (R34)",
      "Toyota Supra",
      "Mazda RX-7",
      "Mitsubishi Lancer Evolution",
      "Subaru Impreza",
      "Honda NSX",
      "Nissan Silvia",
      "Toyota AE86",
      "Honda S2000",
      "Nissan 350Z",
      "Nissan 300ZX",
      "Mitsubishi Eclipse",
      "Toyota MR2",
      "Mazda RX-8",
      "Mitsubishi 3000GT",
      "Honda Civic Type R",
      "Ford Mustang",
      "Chevrolet Camaro",
      "Dodge Viper",
      "Dodge Charger",
      "Porsche 911",
      "Ferrari F40",
      "Ferrari Testarossa",
      "Lamborghini Countach",
      "Lamborghini Diablo",
      "Lamborghini Murciélago",
      "McLaren F1",
      "Ford GT",
      "BMW M3",
      "Audi Quattro",
      "Lancia Delta",
      "DeLorean DMC-12",
    ],
  },
];

const SKIP_TITLE = /^(List of|Outline of|Index of)\b/i;

// Generation-specific articles are near-duplicate cards that nobody guesses from
// a picture, and the model trees are full of them: both the chassis codes
// ("Toyota Corolla (E210)", "Mazda MX-5 (ND)") and the spelled-out forms
// ("Honda Civic (eighth generation)", "Toyota RAV4 (second generation)").
const GENERATION_TITLE =
  /\((?:[A-Z]{1,3}\d{2,3}[A-Z]?|(?:[a-z]+ )?generation|(?:[a-z]+ )?series|phase \d|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\)$/i;


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

// Wikipedia throttles bursts, and the wider decks (the cars one walks a couple
// of thousand articles across dozens of categories) trip it often enough that a
// short fixed backoff is not enough: back off further each attempt and add
// jitter, so concurrent workers that were all throttled do not retry in lockstep
// and keep throttling each other.
async function api(params, { retries = 7, host = API } = {}) {
  const url = new URL(host);
  for (const [key, value] of Object.entries({
    format: "json",
    formatversion: "2",
    ...params,
  })) {
    url.searchParams.set(key, String(value));
  }
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
    } catch (error) {
      if (attempt === retries) throw error;
      await sleep(backoff(attempt));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      await sleep(backoff(attempt));
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return res.json();
  }
  throw new Error(`Gave up on ${url.searchParams.get("gcmtitle") ?? url}`);
}

const backoff = (attempt) =>
  Math.min(1500 * 2 ** attempt, 30000) + Math.random() * 750;

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
      // Without this, category members that are redirects score 0 views and 0
      // bytes, so redirect articles (TAG Heuer Monaco -> TAG Heuer, Reverso ->
      // Reverso (watch)) silently fall to the bottom of a --sort views deck.
      redirects: "1",
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
// that lost do not need attribution. Asked of Commons rather than
// en.wikipedia.org: the images all live on Commons, and enwiki's copy of the
// imageinfo is incomplete for some of them (it returns an empty
// LicenseShortName for Omega Bullhead.JPG where Commons says CC BY-SA 4.0), so
// a lookup there silently loses the attribution the licence requires.
async function fetchLicenses(records) {
  const names = new Set();
  for (const record of records) {
    if (record.pageimage) names.add(fileKey(record.pageimage));
  }
  const titles = [...names].map((name) => `File:${name}`);
  const byFile = new Map();

  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const data = await api(
      {
        action: "query",
        titles: batch.join("|"),
        prop: "imageinfo",
        iiprop: "extmetadata|user|url",
        iiextmetadatafilter: LICENSE_FIELDS.join("|"),
      },
      { host: COMMONS_API },
    );
    for (const page of data.query?.pages ?? []) {
      // A title can be a Commons redirect or a file that was since renamed; skip
      // only when there is no imageinfo to read at all.
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

// A deck given `titles` is a fixed, hand-picked list rather than a category
// walk: the titles are fetched directly in one batched call. This is the only
// way to get a deck of specific models, because Wikipedia has no category that
// holds "the good cars" — the per-marque trees are full of runabouts and
// generation duplicates. `redirects` is set so a requested name that is a
// redirect resolves to its article, and so pageviews are populated at all.
async function fetchTitles(titles) {
  const byName = new Map();
  let cont;
  do {
    const data = await api({
      action: "query",
      titles: titles.join("|"),
      redirects: "1",
      prop: "pageimages|info|pageviews|pageprops",
      piprop: "thumbnail|original|name",
      pithumbsize: 1280,
      ppprop: "disambiguation|wikibase_item",
      ...(cont ? { continue: cont } : {}),
    });
    // Follow the redirect/normalisation chain back to the name that was asked
    // for, so "DeLorean DMC-12" is credited to the "DMC DeLorean" it resolves to.
    const resolved = new Map();
    for (const entry of data.query?.normalized ?? []) resolved.set(entry.to, entry.from);
    for (const entry of data.query?.redirects ?? []) resolved.set(entry.to, entry.from);
    for (const page of data.query?.pages ?? []) {
      const asked = resolved.get(page.title) ?? page.title;
      byName.set(asked, { ...toRecord(page), asked });
    }
    cont = data.continue?.continue;
  } while (cont);
  return byName;
}

async function buildDeck(deck) {
  console.error(`\n=== ${deck.label} ===`);

  let candidates;
  let found = 0;
  let excluded = 0;
  if (deck.titles) {
    console.error(`Fetching ${deck.titles.length} pinned titles…`);
    const found = await fetchTitles(deck.titles);
    candidates = [];
    for (const title of deck.titles) {
      const person = found.get(title);
      if (!person) {
        console.error(`  no such article: ${title}`);
        continue;
      }
      if (!person.image) {
        console.error(`  no image: ${title}`);
        continue;
      }
      if ((deck.skip ?? []).includes(person.asked)) continue;
      if (person[SORT_KEY] < MIN_SCORE) continue;
      // Keep the name that was asked for, so the card reads the way the deck
      // was written rather than whatever the redirect resolved to.
      candidates.push({ ...person, name: person.asked });
    }
  } else {
    console.error(`Collecting people (depth ${DEPTH}, ${CONCURRENCY} at a time)…`);
    const people = await walkCategories(deck.seeds, DEPTH, {
      withDetails: true,
    });

    console.error(`\nCollecting groups and labels to exclude…`);
    const groups = await walkCategories(deck.exclude, 0, {
      withDetails: false,
    });

    candidates = people
      .filter(
        (person) =>
          !groups.has(person.name) &&
          person.image &&
          !person.disambiguation &&
          !SKIP_TITLE.test(person.name) &&
          !GENERATION_TITLE.test(person.name) &&
          !(deck.skip ?? []).includes(person.name) &&
          person[SORT_KEY] >= MIN_SCORE,
      )
      .sort((a, b) => b[SORT_KEY] - a[SORT_KEY]);
    found = people.length;
    excluded = groups.size;

    // Titles the walk missed, fetched directly and marked so the selection
    // below keeps them in the deck whatever they rank. A name already reached
    // by the walk is marked rather than duplicated.
    if (deck.force?.length) {
      console.error(`\nForcing in ${deck.force.length} title(s)…`);
      const forced = await fetchTitles(deck.force);
      for (const title of deck.force) {
        const person = forced.get(title);
        if (!person) {
          console.error(`  no such article: ${title}`);
          continue;
        }
        if (!person.image) {
          console.error(`  no image: ${title}`);
          continue;
        }
        if ((deck.skip ?? []).includes(person.asked)) continue;
        const existing = candidates.find((c) => c.name === person.asked);
        if (existing) {
          existing.forced = true;
          continue;
        }
        candidates.push({ ...person, name: person.asked, forced: true });
      }
    }
  }

  if (!candidates.length) throw new Error(`${deck.label}: no candidates with an image found`);

  const ranked = candidates.sort((a, b) => b[SORT_KEY] - a[SORT_KEY]);
  const selected = ranked.slice(0, LIMIT);
  // A forced title that did not rank high enough displaces the weakest
  // non-forced entries instead of being dropped by the LIMIT slice.
  const missing = ranked.filter((c) => c.forced && !selected.includes(c));
  if (missing.length) {
    selected.splice(Math.max(selected.length - missing.length, 0), missing.length, ...missing);
  }
  const max = selected[0][SORT_KEY] || 1;

  let byFile = new Map();
  if (WITH_LICENCE) {
    console.error(`\nFetching image licences…`);
    byFile = await fetchLicenses(selected);
  }

  // The deck is authored in ascending data-rating order, so reverse the ranking.
  const entries = selected
    .map((person) => ({
      ...person,
      ...byFile.get(fileKey(person.pageimage ?? "")),
      rating: Math.min(person[SORT_KEY] / max, 1),
    }))
    .reverse();

  const metric = SORT_KEY === "views" ? "60-day pageviews" : "article size";
  const how = deck.titles
    ? `${deck.titles.length} pinned titles`
    : `${found} people -> ${excluded} excluded`;
  console.error(`${how} -> ${entries.length} entries with image/wiki, ranked by ${metric}`);
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
