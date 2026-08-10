import { gameUrl } from "../src/client/utils.js";

// lit is ESM-only and unused by gameUrl — stub it out.
jest.mock("lit", () => ({
    html: (strings: any, ..._values: any[]) => strings[0],
    css: (strings: any, ..._values: any[]) => strings[0],
    LitElement: class {
        requestUpdate() {}
    },
}));

const BASE = {
    tableId: "table-1",
    userId: "alice",
    userName: "Alice",
    ruleType: "nineball",
};

const param = (url: string, key: string) => new URL(url).searchParams.get(key);

// gameUrl is plain JS, so ts-jest infers its destructured params as required —
// cast each call's args (matches the `as any` style already used in this suite).
const build = (args: Record<string, unknown>) => gameUrl(args as any);

describe("gameUrl custom flattening", () => {
    it("keeps flat custom values backwards compatible", () => {
        const url = build({ ...BASE, custom: { cue: "1", skin: "red" } });
        expect(param(url, "custom.cue")).toBe("1");
        expect(param(url, "custom.skin")).toBe("red");
    });

    it("recursively flattens nested custom objects into dot-notation params", () => {
        const url = build({
            ...BASE,
            custom: { cue: { colour: "red", length: "57" }, skin: "blue" },
        });
        expect(param(url, "custom.cue.colour")).toBe("red");
        expect(param(url, "custom.cue.length")).toBe("57");
        expect(param(url, "custom.skin")).toBe("blue");
        // No intermediate object-typed param is emitted
        expect(param(url, "custom.cue")).toBeNull();
    });

    it("recursively flattens opponent custom into opponent.custom.* params", () => {
        const url = build({
            ...BASE,
            opponent: {
                userId: "bob",
                userName: "Bob",
                custom: { cue: { colour: "green", length: "58" } },
            },
        });
        expect(param(url, "opponent.custom.cue.colour")).toBe("green");
        expect(param(url, "opponent.custom.cue.length")).toBe("58");
    });

    it("skips undefined and null leaves", () => {
        const url = build({
            ...BASE,
            custom: { cue: { colour: "red", length: undefined, tip: null } },
        });
        expect(param(url, "custom.cue.colour")).toBe("red");
        expect(param(url, "custom.cue.length")).toBeNull();
        expect(param(url, "custom.cue.tip")).toBeNull();
    });
});
