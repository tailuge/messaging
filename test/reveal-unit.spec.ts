import { revealGameUrl } from "../src/client/utils.js";

// Mock lit to run in Node
jest.mock("lit", () => ({
    html: (strings: any, ..._values: any[]) => strings[0],
    css: (strings: any, ..._values: any[]) => strings[0],
    LitElement: class {
        requestUpdate() {}
    },
}));

function mulberry32(seed: number) {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hashSeed(s: string) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return h >>> 0;
}

function postProcessChallenges(challenges: any[]) {
    if (!challenges.length) return challenges;
    const sorted = challenges.slice().sort((a, b) => a.rating - b.rating);
    const n = sorted.length;
    const processed = sorted.map((ch, i) => {
        const normRating = (i + 1) / n;
        const reds = Math.max(1, Math.round(normRating * 32));
        const stars = Math.min(5, Math.max(1, Math.ceil(normRating * 5)));
        return {
            ...ch,
            normRating,
            reds,
            stars,
            rankRating: normRating,
        };
    });
    const rand = mulberry32(hashSeed(challenges[0].imageUrl));
    for (let i = processed.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [processed[i], processed[j]] = [processed[j], processed[i]];
    }
    return processed;
}

describe("reveal deck postProcessChallenges", () => {
    const rawDeck = [
        { id: "hard", name: "Hard Card", rating: 1.0, imageUrl: "https://x.com/hard.jpg" },
        { id: "easy", name: "Easy Card", rating: 0.1, imageUrl: "https://x.com/easy.jpg" },
        { id: "mid", name: "Mid Card", rating: 0.5, imageUrl: "https://x.com/mid.jpg" },
    ];

    it("orders by rating easy to hard before assigning normalized ratings, stars, and reds", () => {
        const processed = postProcessChallenges(rawDeck);
        expect(processed.length).toBe(3);

        const easy = processed.find((c) => c.id === "easy");
        const mid = processed.find((c) => c.id === "mid");
        const hard = processed.find((c) => c.id === "hard");

        expect(easy.normRating).toBeCloseTo(1 / 3);
        expect(easy.reds).toBe(11);
        expect(easy.stars).toBe(2);

        expect(mid.normRating).toBeCloseTo(2 / 3);
        expect(mid.reds).toBe(21);
        expect(mid.stars).toBe(4);

        expect(hard.normRating).toBeCloseTo(3 / 3);
        expect(hard.reds).toBe(32);
        expect(hard.stars).toBe(5);
    });
});
