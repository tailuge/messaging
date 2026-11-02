// The challenge page is a mostly-static document; this module adds the shared
// site header (logo, user badge, lobby presence and the incoming-challenge
// flag) so it matches the map and reveal pages, and drives the page's own
// score/gallery behaviour.
import "../topbar.js";
import { logUsage } from "../logusage.js";
import { API_BASE, SCOREBOARD_URL, replayUrl } from "../utils.js";
import { userStore } from "../user-store.js";

logUsage("challenge");

// The dishes are read from the page's own markup: the `#kfood-data` list in
// the footer fold-down carries each entry's name, emoji, photo, credit and
// wiki link. The list is authored easiest-first, and a run's score unlocks one
// dish per point, so list order is also unlock order.
function readFoodItems(dataId) {
  const ul = document.getElementById(dataId);
  if (!ul) return [];
  return [...ul.querySelectorAll("a[data-image]")].map((a) => ({
    nameKr: a.textContent.trim(),
    // One-line flavour text, kept beside the dish it describes.
    desc: a.getAttribute("data-desc") || "",
    emoji: a.getAttribute("data-emoji") || "🍽️",
    imageUrl: (a.getAttribute("data-image") || "").trim(),
    wikiUrl: a.getAttribute("href") || "",
  }));
}

const foodItems = readFoodItems("kfood-data");

// One point per dish, so the whole deck takes one point each.
const MAX_SCORE = foodItems.length;

// Elements
const scoreDisplay = document.getElementById("score-display");
const scoreMax = document.getElementById("score-max");
const foodNameKr = document.getElementById("food-name-kr");
const foodDesc = document.getElementById("food-desc");
const foodEmoji = document.getElementById("food-emoji");
const wikiLink = document.getElementById("wiki-link");
const reqScore = document.getElementById("required-score");
const galleryGrid = document.getElementById("gallery-grid");
const foodCard = document.getElementById("food-card");
const breakList = document.getElementById("break-list");
const breakStatus = document.getElementById("break-status");

let currentIndex = -1;
// The dish the user picked from the collection; null means "follow the score".
let selectedIndex = null;

// Build Gallery Grid. Every dish starts as its emoji; the photo swaps in once
// the dish is unlocked (see `update`).
function initGallery() {
  galleryGrid.replaceChildren();
  foodItems.forEach((item, idx) => {
    const el = document.createElement("button");
    el.type = "button";
    el.id = `gallery-${idx}`;
    el.className = "gallery-item";
    el.title = item.nameKr;
    el.setAttribute("aria-label", item.nameKr);
    el.addEventListener("click", () => selectDish(idx));

    const emoji = document.createElement("span");
    emoji.className = "gallery-emoji";
    emoji.textContent = item.emoji;
    emoji.setAttribute("aria-hidden", "true");

    const img = document.createElement("img");
    img.className = "gallery-img";
    img.loading = "lazy";
    // The tile is a picture of one dish, so it carries a name for search and
    // for a reader whose images load before the photo is revealed.
    img.alt = `${item.nameKr} 사진`;
    if (item.imageUrl) img.src = item.imageUrl;

    el.append(emoji, img);
    galleryGrid.appendChild(el);
  });
}

// The dish's photo only once it has been obtained; until then its emoji stands
// in for it, so a locked dish never shows the picture it is hiding.
function renderFoodArt(food, obtained) {
  foodEmoji.replaceChildren();
  if (obtained && food.imageUrl) {
    const img = document.createElement("img");
    img.src = food.imageUrl;
    img.alt = food.nameKr;
    img.loading = "lazy";
    foodEmoji.appendChild(img);
    return;
  }
  const emoji = document.createElement("span");
  emoji.textContent = food.emoji;
  emoji.setAttribute("aria-hidden", "true");
  foodEmoji.appendChild(emoji);
}

// Update View
function update(score) {
  if (!foodItems.length) return;
  scoreDisplay.textContent = score;
  scoreMax.textContent = `/ ${MAX_SCORE}`;

  // One point unlocks one dish, in list order. Score 0 means no sagu run yet:
  // nothing is unlocked, but the card previews the first dish up for grabs.
  const unlockedCount = Math.min(foodItems.length, Math.max(0, score));
  const activeIdx = Math.max(0, unlockedCount - 1);
  // Clicking a tile shows that dish in the card above; a new best score hands
  // the card back to the newest dish.
  const shownIdx = selectedIndex ?? activeIdx;
  const food = foodItems[shownIdx];
  const obtained = shownIdx < unlockedCount;

  // Card Pop Animation
  if (currentIndex !== shownIdx) {
    currentIndex = shownIdx;
    foodCard.classList.remove("animate-pop");
    void foodCard.offsetWidth;
    foodCard.classList.add("animate-pop");
  }

  // Text & Link updates
  reqScore.textContent = shownIdx + 1;
  foodNameKr.textContent = food.nameKr;
  foodDesc.textContent = food.desc;
  foodDesc.hidden = !food.desc;
  renderFoodArt(food, obtained);
  wikiLink.href = food.wikiUrl;

  // Gallery update
  foodItems.forEach((_, idx) => {
    const itemEl = document.getElementById(`gallery-${idx}`);
    if (itemEl) {
      itemEl.classList.toggle("unlocked", idx < unlockedCount);
      itemEl.classList.toggle("selected", idx === shownIdx);
      itemEl.setAttribute("aria-pressed", idx === shownIdx ? "true" : "false");
    }
  });
}

// Show one dish in the card above, obtained or not: a locked dish keeps its
// emoji and its (higher) target score.
function selectDish(idx) {
  if (idx < 0 || idx >= foodItems.length) return;
  selectedIndex = idx;
  update(bestScore);
}

// The rail lists the sagu HiScores from `/api/hiscores/sagu`, the one-rule feed
// this page needs: the lobby's `/api/summary` would also read the other four
// rules' sets, the ELO hashes and the recent matches. Rows arrive best first.
// The list the rail is drawn from; the top-20 gate reads it before uploading.
let saguScores = [];

// Draw the rail from `saguScores` alone, so a run uploaded this session can be
// shown without waiting for the server's cached feed to catch up.
function renderSaguHiscores() {
  breakList.replaceChildren();
  if (!saguScores.length) {
    breakStatus.textContent = "아직 기록이 없습니다. 첫 기록을 남겨보세요.";
    return;
  }
  breakStatus.textContent = "";
  saguScores.forEach((entry, idx) => {
    const row = document.createElement("li");

    const rank = document.createElement("span");
    rank.className = "break-rank";
    rank.textContent = idx + 1;

    const name = document.createElement("span");
    name.className = "break-name";
    name.textContent = entry?.name ?? "";
    name.title = entry?.name ?? "";

    // Same replay link the lobby uses: the rank endpoint redirects to the
    // stored replay, and the link opens in this tab.
    // The dish a score unlocks: score N is the Nth dish in list order.
    const dish = foodItems[Number(entry?.score) - 1];
    const emoji = document.createElement("span");
    emoji.className = "break-emoji";
    emoji.textContent = dish?.emoji ?? "";
    emoji.title = dish?.nameKr ?? "";
    emoji.setAttribute("aria-hidden", "true");

    const score = document.createElement("a");
    score.className = "break-score";
    score.textContent = entry?.score ?? "";
    if (entry?.id) {
      score.href = replayUrl(
        `${SCOREBOARD_URL}/api/rank/${entry.id}?ruletype=sagu&lod=${userStore.lod}`,
        userStore.clientId,
        userStore.userName
      );
    }

    row.append(rank, emoji, name, score);
    breakList.appendChild(row);
  });
}

// Read the feed once per page load. It is deliberately not re-read after an
// upload: see addLocalSaguScore.
function loadSaguHiscores() {
  fetch(`${API_BASE}/api/hiscores/sagu`, { mode: "cors" })
    .then((response) => response.json())
    .then((data) => {
      saguScores = Array.isArray(data?.hiscores) ? data.hiscores : [];
      renderSaguHiscores();
    })
    .catch(() => {
      breakStatus.textContent = "기록을 불러오지 못했어요.";
    });
}

// Fold a run this page just uploaded into its own copy of the scoreboard. The
// feed is cached — the scoreboard host keeps its own copy, and the arena host
// serves /api/hiscores/sagu from a cache zone — so refetching straight after a
// successful upload would usually hand back the old list, without the new row.
// The row goes in best first, replacing that player's earlier entry, and the
// list stops at the length the rail shows.
function addLocalSaguScore(entry) {
  const rows = saguScores.filter((row) =>
    entry.id ? row?.id !== entry.id : row?.name !== entry.name
  );
  const at = rows.findIndex((row) => Number(row?.score) < entry.score);
  rows.splice(at === -1 ? rows.length : at, 0, entry);
  saguScores = rows.slice(0, HISCORE_TOP_N);
}

// Sagu runs in speedrun mode (see speedrun/index.html): the shot that
// ends the break posts a speedrun-result carrying the break and score.
// Opening position as flat x,y pairs in rack order (2 cue balls, 2 reds),
// plus the shot to play from it: the same `init` / `initShot` format the
// game parses itself (src/utils/rack.ts, src/controller/aim.ts), so no
// speedrun card is needed.
const SAGU_BALLS = [
  [-1.171447, 0.167467],
  [1.375163, -0.624586],
  [-1.443794, 0.318252],
  [-1.32848, 0.335773],
];
const SAGU_SHOT = {
  cueBallId: 0,
  angle: 2.446864,
  power: 0.524,
  offset: { x: 0, y: 0, z: 0 },
  elevation: 0,
};
// Physics the position was tuned with; drop this line to play the defaults.
const SAGU_PHYSICS =
  "&cushionModel=mathavan&%CE%BCs=0.2&%CE%BCw=0.175&ee=0.85&mu=0.0055" +
  "&muS=0.126&stronge_omega_ratio=1.76&stronge_e_n=0.77&stronge_%CE%BC=0.25";

// Locally the game is served on port 8080; on the deployed site it sits one
// level up from /challenge/.
const SAGU_GAME_BASE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
  ? `http://${location.hostname}:8080/index.html`
  : "../index.html";
// Identity is read when the game is launched, not at module load, the same way the map
// page builds its club URL: the run is uploaded under the player's name, and a rename in
// the header should carry into the next launch.
const saguUrl = () =>
  SAGU_GAME_BASE +
  "?ruletype=sagu&speedrun&practice&raceTo=" +
  MAX_SCORE +
  SAGU_PHYSICS +
  `&init=${encodeURIComponent(JSON.stringify(SAGU_BALLS.flat()))}` +
  `&initShot=${encodeURIComponent(JSON.stringify(SAGU_SHOT))}` +
  `&userId=${encodeURIComponent(userStore.clientId)}` +
  `&userName=${encodeURIComponent(userStore.userName)}`;
const saguOverlay = document.getElementById("sagu-overlay");
const saguFrame = document.getElementById("sagu-frame");
const saguResult = document.getElementById("sagu-result");

function closeSagu() {
  saguOverlay.classList.remove("active");
  saguFrame.src = "about:blank";
}

// The best run is what counts: a weaker run must not take unlocked food
// away again.
let bestScore = 0;

function scoreFromSagu(score) {
  const runScore = Math.min(MAX_SCORE, Math.max(0, Number(score) || 0));
  bestScore = Math.max(bestScore, runScore);
  // A finished run takes the card back to the newest dish it unlocked.
  selectedIndex = null;
  update(bestScore);
}

// Sagu HiScore upload. The scoreboard keeps the top 20 of the rail list; a run
// is uploaded only when it would rank there, or when the list is not yet full.
const HISCORE_TOP_N = 20;
const UPLOAD_RETRY_MS = 2000;

// Replay states already sent this session, so one run never uploads twice.
const sentStates = new Set();
// Bumped on each run so a slow upload does not overwrite the next run's note.
let runCounter = 0;

function wouldRankInTopN(score) {
  if (saguScores.length < HISCORE_TOP_N) return true;
  return score >= Number(saguScores[HISCORE_TOP_N - 1].score);
}

function showUploadNote(run, text) {
  if (run === runCounter) saguResult.textContent += ` · ${text}`;
}

async function maybeUploadSaguScore(data, run) {
  const { score, replayData } = data;
  // Any run that scored at least one dish is worth a hiscore; a zero-score run
  // is not, because it carries no break to replay.
  if (!(score > 0)) return;
  if (!replayData || sentStates.has(replayData)) return;
  if (!wouldRankInTopN(score)) return;

  const key = `sagu.hiscore.${userStore.clientId}`;
  if (Number(localStorage.getItem(key) || 0) >= score) return;
  sentStates.add(replayData);

  const name =
    [...(userStore.userName || "").trim()].slice(0, 12).join("") || "Anon";
  const url = `${SCOREBOARD_URL}/api/hiscore?ruletype=sagu&id=${encodeURIComponent(name)}`;
  const body = `?ruletype=sagu&state=${encodeURIComponent(replayData)}&score=${score}&v=1`;

  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        mode: "cors",
        cache: "no-cache",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        redirect: "follow",
        referrerPolicy: "no-referrer",
        body,
      });
    } catch (err) {
      // A thrown fetch can be a CORS/redirect failure after the server already
      // stored the run, so retrying here would post a duplicate.
      console.warn("sagu hiscore upload error:", err);
      break;
    }
    if (res.ok) {
      localStorage.setItem(key, String(score));
      showUploadNote(run, "기록 등록 완료");
      // The stored row's id comes back from the server when it sends one; a row
      // without it is listed unlinked rather than linked to a missing id.
      const saved = await res.json().catch(() => null);
      addLocalSaguScore({
        id: typeof saved?.id === "string" ? saved.id : undefined,
        name: typeof saved?.name === "string" ? saved.name : name,
        score,
      });
      renderSaguHiscores();
      return;
    }
    console.warn("sagu hiscore upload failed:", res.status, await res.text());
    // Only server errors are retried; a 4xx means the request itself is rejected.
    if (res.status < 500) break;
    if (attempt === 0) await new Promise((r) => setTimeout(r, UPLOAD_RETRY_MS));
  }
  // Not recorded locally, so a later run can retry the upload.
  sentStates.delete(replayData);
  showUploadNote(run, "기록 등록에 실패했어요");
}

document.getElementById("play-sagu").addEventListener("click", () => {
  saguResult.textContent = "";
  saguFrame.src = saguUrl();
  saguOverlay.classList.add("active");
});

document.getElementById("close-sagu").addEventListener("click", closeSagu);

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "speedrun-result") {
    return;
  }
  scoreFromSagu(data.score);
  const breakScore = data.break ?? 0;
  const summary =
    data.status === "complete"
      ? `사구 클리어! ${data.score}점`
      : `한 브레이크가 끝났습니다 (${data.reason}) ${data.score}점`;
  saguResult.textContent = `${summary} · 이번 브레이크 ${breakScore} · 최고 기록 ${bestScore}점`;
  // Start the upload before the fail path unloads the iframe.
  const run = ++runCounter;
  void maybeUploadSaguScore(data, run);
  if (data.status === "fail") {
    closeSagu();
  }
});

initGallery();
update(0);
loadSaguHiscores();
