// The challenge page is a mostly-static document; this module adds the shared
// site header (logo, user badge, lobby presence and the incoming-challenge
// flag) so it matches the map and reveal pages, and drives the page's own
// score/gallery behaviour.
import "../topbar.js";
import { logUsage } from "../logusage.js";

logUsage("challenge");

// Food Data Array (13 items, unlocked at 1, 3, 5, ..., 25)
const foodItems = [
  {
    minScore: 1,
    nameKr: "라면 (Instant Ramyeon)",
    desc: "한국인이 가장 사랑하는 얼큰하고 간편한 대표 야식입니다.",
    emoji: "🍜",
    wikiUrl: "https://ko.wikipedia.org/wiki/%EB%9D%BC%EB%A9%B4",
  },
  {
    minScore: 3,
    nameKr: "떡볶이 (Tteokbokki)",
    desc: "매콤달콤한 고추장 양념에 쫄깃한 떡이 어우러진 길거리 음식입니다.",
    emoji: "🍢",
    wikiUrl: "https://ko.wikipedia.org/wiki/%EB%96%A1%EB%B3%B6%EC%9D%B4",
  },
  {
    minScore: 5,
    nameKr: "김밥 (Kimbap)",
    desc: "야채와 계란, 단무지를 밥과 함께 김으로 말아낸 도시락 요리입니다.",
    emoji: "🍙",
    wikiUrl: "https://ko.wikipedia.org/wiki/%EA%B9%80%EB%B0%A5",
  },
  {
    minScore: 7,
    nameKr: "김치찌개 (Kimchi Jjigae)",
    desc: "잘 익은 신김치와 돼지고기를 푹 끓여낸 대표 한식 찌개입니다.",
    emoji: "🍲",
    wikiUrl: "https://ko.wikipedia.org/wiki/%EA%B9%80%EC%B9%94%EC%AF%8C%EA%B0%9C",
  },
  {
    minScore: 9,
    nameKr: "해물파전 (Haemul Pajeon)",
    desc: "신선한 해산물과 파를 듬뿍 넣어 바삭하게 부쳐낸 부침개입니다.",
    emoji: "🥞",
    wikiUrl: "https://ko.wikipedia.org/wiki/%ED%8C%8C%EC%A0%84",
  },
  {
    minScore: 11,
    nameKr: "비빔밥 (Bibimbap)",
    desc: "나물과 고기, 계란을 특제 고추장과 참기름에 비벼 먹는 건강식입니다.",
    emoji: "🥗",
    wikiUrl: "https://ko.wikipedia.org/wiki/%EB%B9%84%EB%B9%94%EB%B0%A5",
  },
  {
    minScore: 13,
    nameKr: "양념치킨 (K-Fried Chicken)",
    desc: "바삭한 치킨에 매콤달콤한 특제 양념 소스를 버무린 인기 메뉴입니다.",
    emoji: "🍗",
    wikiUrl: "https://ko.wikipedia.org/wiki/%EC%96%91%EB%85%90%EC%B9%98%ED%82%A8",
  },
  {
    minScore: 15,
    nameKr: "삼겹살 (Samgyeopsal)",
    desc: "노릇노릇하게 구운 돼지 삼겹살을 상추에 싸 먹는 구이 요리입니다.",
    emoji: "🥓",
    wikiUrl: "https://ko.wikipedia.org/wiki/%EC%82%BC%EA%B2%A9%EC%82%B4",
  },
  {
    minScore: 17,
    nameKr: "불고기 (Bulgogi)",
    desc: "달콤하고 짭조름한 간장 양념에 재운 부드러운 소고기 요리입니다.",
    emoji: "🥩",
    wikiUrl: "https://ko.wikipedia.org/wiki/%EB%B6%88%EA%B3%A0%EA%B8%B0",
  },
  {
    minScore: 19,
    nameKr: "갈비찜 (Galbi-jjim)",
    desc: "소갈비를 야채와 함께 특제 양념장에 오랫동안 부드럽게 조려낸 명품 한식입니다.",
    emoji: "🍖",
    wikiUrl: "https://ko.wikipedia.org/wiki/%EA%B0%88%EB%B9%84%EC%AF%88",
  },
  {
    minScore: 21,
    nameKr: "간장게장 (Ganjang Gejang)",
    desc: "신선한 게를 특제 간장에 숙성시켜 밥도둑이라 불리는 고급 해산물 요리입니다.",
    emoji: "🦀",
    wikiUrl: "https://ko.wikipedia.org/wiki/%EA%B2%8C%EC%9E%A5",
  },
  {
    minScore: 23,
    nameKr: "궁중 신선로 (Sinseollo)",
    desc: "다양한 고급 재료와 육수를 화로 냄비에 담아 끓여 먹는 궁중 요리입니다.",
    emoji: "🍲",
    wikiUrl: "https://ko.wikipedia.org/wiki/%EC%8B%A0%EC%84%A0%EB%A1%9C",
  },
  {
    minScore: 25,
    nameKr: "한우 수라상 (Hanwoo Royal Feast)",
    desc: "최고급 대한민국 한우와 왕실 메뉴로 차려진 전설의 K-푸드 만찬입니다!",
    emoji: "👑",
    wikiUrl: "https://ko.wikipedia.org/wiki/%EC%88%98%EB%9D%BC%EC%83%81",
  },
];

// Elements
const scoreDisplay = document.getElementById("score-display");
const foodNameKr = document.getElementById("food-name-kr");
const foodDesc = document.getElementById("food-desc");
const foodEmoji = document.getElementById("food-emoji");
const wikiLink = document.getElementById("wiki-link");
const reqScore = document.getElementById("required-score");
const galleryGrid = document.getElementById("gallery-grid");
const foodCard = document.getElementById("food-card");

let currentIndex = -1;

// Build Gallery Grid
function initGallery() {
  galleryGrid.innerHTML = "";
  foodItems.forEach((item, idx) => {
    const el = document.createElement("div");
    el.id = `gallery-${idx}`;
    el.className = "gallery-item";
    el.textContent = item.emoji;
    galleryGrid.appendChild(el);
  });
}

// Update View
function update(score) {
  scoreDisplay.textContent = score;

  // Score 0 means no sagu run yet: nothing is unlocked, but the card
  // previews the food that is first up for grabs.
  const unlocked = score >= 1;
  let activeIdx = Math.max(0, Math.floor((score - 1) / 2));
  if (activeIdx >= foodItems.length) activeIdx = foodItems.length - 1;

  const food = foodItems[activeIdx];

  // Card Pop Animation
  if (currentIndex !== activeIdx) {
    currentIndex = activeIdx;
    foodCard.classList.remove("animate-pop");
    void foodCard.offsetWidth;
    foodCard.classList.add("animate-pop");
  }

  // Text & Link updates
  reqScore.textContent = food.minScore;
  foodNameKr.textContent = food.nameKr;
  foodDesc.textContent = food.desc;
  foodEmoji.textContent = food.emoji;
  wikiLink.href = food.wikiUrl;

  // Gallery update
  foodItems.forEach((_, idx) => {
    const itemEl = document.getElementById(`gallery-${idx}`);
    if (itemEl) {
      itemEl.classList.toggle("unlocked", unlocked && idx <= activeIdx);
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
  "../index.html?ruletype=sagu&speedrun&practice&raceTo=25" +
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
  const runScore = Math.min(25, Math.max(0, Number(score) || 0));
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
