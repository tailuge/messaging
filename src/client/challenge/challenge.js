// The challenge page is a mostly-static document; this module adds the shared
// site header (logo, user badge, lobby presence and the incoming-challenge
// flag) so it matches the map and reveal pages, and drives the page's own
// score/gallery behaviour.
import "../topbar.js";
import { logUsage } from "../logusage.js";

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

let currentIndex = -1;

// Build Gallery Grid. Every dish starts as its emoji; the photo swaps in once
// the dish is unlocked (see `update`).
function initGallery() {
  galleryGrid.replaceChildren();
  foodItems.forEach((item, idx) => {
    const el = document.createElement("div");
    el.id = `gallery-${idx}`;
    el.className = "gallery-item";
    el.title = item.nameKr;
    el.setAttribute("aria-label", item.nameKr);

    const emoji = document.createElement("span");
    emoji.className = "gallery-emoji";
    emoji.textContent = item.emoji;
    emoji.setAttribute("aria-hidden", "true");

    const img = document.createElement("img");
    img.className = "gallery-img";
    img.loading = "lazy";
    img.alt = "";
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
  const food = foodItems[activeIdx];
  const obtained = unlockedCount > activeIdx;

  // Card Pop Animation
  if (currentIndex !== activeIdx) {
    currentIndex = activeIdx;
    foodCard.classList.remove("animate-pop");
    void foodCard.offsetWidth;
    foodCard.classList.add("animate-pop");
  }

  // Text & Link updates
  reqScore.textContent = activeIdx + 1;
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
    }
  });
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

const SAGU_URL =
  "../index.html?ruletype=sagu&speedrun&practice&raceTo=" +
  MAX_SCORE +
  SAGU_PHYSICS +
  `&init=${encodeURIComponent(JSON.stringify(SAGU_BALLS.flat()))}` +
  `&initShot=${encodeURIComponent(JSON.stringify(SAGU_SHOT))}`;
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
  update(bestScore);
}

document.getElementById("play-sagu").addEventListener("click", () => {
  saguResult.textContent = "";
  saguFrame.src = SAGU_URL;
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
      : `브레이크 종료 (${data.reason}) ${data.score}점`;
  saguResult.textContent = `${summary} · 브레이크 ${breakScore} · 최고 ${bestScore}점`;
  if (data.status === "fail") {
    closeSagu();
  }
});

initGallery();
update(0);
