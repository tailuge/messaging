// @ts-nocheck
import fs from "fs";
import path from "path";

describe("Dashboard UI Unit Tests", () => {
  let safeDecode: (str: string) => string;
  let updateUIFunction: Function;
  let presenceRowFunction: Function;
  let loadPresenceFunction: Function;
  let mockDocument: any;

  beforeEach(() => {
    const htmlPath = path.resolve(process.cwd(), "src/client/dashboard.html");
    const html = fs.readFileSync(htmlPath, "utf-8");

    // Extract functions directly from HTML script block
    const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
    const scriptContent = scriptMatch ? scriptMatch[1] : "";

    // Create lightweight DOM mock elements
    const elements: Record<string, any> = {};
    const createMockElement = (id?: string) => {
      const el: any = {
        id,
        _textContent: "",
        get textContent() { return this._textContent; },
        set textContent(v) {
          this._textContent = v;
          this.innerHTML = v;
          this.children.length = 0;
        },
        innerHTML: "",
        style: {},
        children: [] as any[],
        appendChild(child: any) {
          this.children.push(child);
        },
        classList: { toggle: () => {}, contains: () => false },
        querySelector: () => ({ textContent: "" }),
        querySelectorAll: (selector: string) => {
          if (selector === "td") {
            const matches = el.innerHTML.match(/<td[^>]*>(.*?)<\/td>/g) || [];
            return matches.map((m: string) => ({ textContent: m.replace(/<[^>]+>/g, "") }));
          }
          return [];
        },
      };
      if (id) elements[id] = el;
      return el;
    };

    mockDocument = {
      querySelector: (selector: string) => {
        if (selector === ".dashboard") return createMockElement();
        if (selector === "#ip-cache-table tbody") return createMockElement("ip-cache-tbody");
        if (selector === "#ref-table tbody") return createMockElement("ref-tbody");
        if (selector === "#ua-table tbody") return createMockElement("ua-tbody");
        if (selector === "#geo-table tbody") return createMockElement("geo-tbody");
        if (selector === "#njs-logs-table tbody") return createMockElement("njs-logs-tbody");
        return createMockElement();
      },
      getElementById: (id: string) => elements[id] || createMockElement(id),
      createElement: () => createMockElement(),
      querySelectorAll: (selector: string) => {
        if (selector === "#ua-table tbody tr") {
          const tbody = elements["ua-tbody"];
          if (!tbody || !tbody.innerHTML) return [];
          const trMatches = tbody.innerHTML.match(/<tr>(.*?)<\/tr>/g) || [];
          return trMatches.map((trHtml: string) => {
            const trEl = createMockElement();
            trEl.innerHTML = trHtml;
            return trEl;
          });
        }
        return [];
      },
    };

    const contextFunc = new Function("document", "fetchStats", `
      ${scriptContent.replace("fetchStats();", "").replace("loadPresence();", "")}
      return { safeDecode, updateUI, presenceRow, loadPresence };
    `);

    const exports = contextFunc(mockDocument, () => {});
    safeDecode = exports.safeDecode;
    updateUIFunction = exports.updateUI;
    presenceRowFunction = exports.presenceRow;
    loadPresenceFunction = exports.loadPresence;
  });

  test("safeDecode correctly decodes URI components and handles double encoding and invalid input", () => {
    const sample = "%EC%A3%BC%EB%B2%BC%EB%A6%A1-o3dp9";
    const expected = decodeURIComponent(sample);
    expect(safeDecode(sample)).toBe(expected);
    expect(safeDecode(encodeURIComponent(sample))).toBe(expected);
    expect(safeDecode("plain-username")).toBe("plain-username");
    expect(safeDecode("%invalid%uri%")).toBe("%invalid%uri%");
  });

  test("presence rows render compact frames as a plain text line", () => {
    const row: any = presenceRowFunction({
      m: "p",
      t: "h",
      u: "alice",
      n: "Alice",
      T: "table-3",
      r: "nineball",
      meta: { t: Date.now() - 8000, c: "GB", y: "London" },
    });

    expect(row.textContent).toContain("Alice (alice) — heartbeat — nineball @ table-3 — ");
    expect(row.textContent).toMatch(/8s ago/);
    expect(row.textContent).toContain("— GB London");
  });

  test("presence rows distinguish spectating and arena states", () => {
    const spectating: any = presenceRowFunction({ t: "j", u: "bob", n: "Bob", T: "t1", S: true });
    expect(spectating.textContent).toContain("game @ t1 (spectating)");

    const arena: any = presenceRowFunction({ t: "h", u: "carol", n: "Carol", A: "arena-7" });
    expect(arena.textContent).toContain("arena arena-7");
  });

  test("loadPresence renders the snapshot and reports a failed fetch", async () => {
    const originalFetch = global.fetch;
    try {
      (global as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ts: Date.now(),
          ttl: 600000,
          users: [{ m: "p", t: "h", u: "a", n: "A", meta: { t: Date.now(), c: "GB" } }],
        }),
      });

      await loadPresenceFunction();
      expect(mockDocument.getElementById("presence-meta").textContent).toContain("1 online");
      const list = mockDocument.getElementById("presence-list");
      expect(list.children.length).toBe(1);
      expect(list.children[0].textContent).toContain("A (a) — heartbeat");

      (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
      await loadPresenceFunction();
      expect(mockDocument.getElementById("presence-meta").textContent).toContain(
        "Presence fetch failed: HTTP 503"
      );
      expect(list.children.length).toBe(1);
      expect(list.children[0].textContent).toContain("Unable to load the presence registry");
    } finally {
      (global as any).fetch = originalFetch;
    }
  });

  test("container system stats render as bytes, seconds, percent and network totals", () => {
    updateUIFunction({
      system: {
        memory: { used_bytes: 14848000, limit_bytes: null, peak_bytes: 17715200 },
        cpu: { used_usec: 1070972, avg_pct: 6.6, limit_cores: null },
        network: { rx_bytes: 400007, tx_bytes: 363641 },
      },
    });

    expect(mockDocument.getElementById("sys-mem-used").textContent).toBe("14.16 MB");
    expect(mockDocument.getElementById("sys-mem-limit").textContent).toBe("-");
    expect(mockDocument.getElementById("sys-mem-peak").textContent).toBe("16.89 MB");
    expect(mockDocument.getElementById("sys-cpu-used").textContent).toBe("1.1 s");
    expect(mockDocument.getElementById("sys-cpu-avg").textContent).toBe("6.6%");
    expect(mockDocument.getElementById("sys-cpu-limit").textContent).toBe("-");
    expect(mockDocument.getElementById("sys-net-rx").textContent).toBe("390.63 KB");
    expect(mockDocument.getElementById("sys-net-tx").textContent).toBe("355.12 KB");
  });

  test("referrer rows roll up to the site root so one site counts together", () => {
    const encode = (url: string) => encodeURIComponent(url);
    updateUIFunction({
      referrer_cache: {
        "10.x.x.1": [
          `2|${encode("https://tailuge.github.io/billiards/game.html")}`,
          `1|${encode("https://tailuge.github.io/lobby.html")}`,
          `2|${encode("https://github.com/tailuge/billiards")}`,
          `2|${encode("https://github.com/tailuge/billiards/releases")}`,
          `1|${encode("https://example.com/page")}`,
        ].join(","),
      },
    });

    const body = mockDocument.getElementById("ref-tbody").innerHTML;
    expect(body).toBe(
      '<tr><td class="count-col">4</td><td>https://github.com/tailuge/billiards</td></tr>' +
        '<tr><td class="count-col">3</td><td>https://tailuge.github.io/</td></tr>' +
        '<tr><td class="count-col">1</td><td>https://example.com/page</td></tr>'
    );
  });

  test("OS and Browser section groups by OS and sorts correctly", () => {
    const mockData = {
      ip_cache: {
        "1.1.1.1": "KR|Seoul|5|origin1|Windows|Chrome",
        "2.2.2.2": "KR|Seoul|3|origin2|Windows|Chrome",
        "3.3.3.3": "KR|Seoul|2|origin3|Windows|Edge",
        "3.3.3.4": "KR|Seoul|1|origin3|Windows|Firefox",
        "4.4.4.4": "US|NewYork|1|origin4|macOS|Safari",
        "5.5.5.5": "US|NewYork|1|origin5|macOS|Safari",
        "6.6.6.6": "US|NewYork|1|origin6|macOS|Chrome",
        "7.7.7.7": "JP|Tokyo|1|origin7|Android|Chrome",
      },
    };

    updateUIFunction(mockData);

    const rows = mockDocument.querySelectorAll("#ua-table tbody tr");
    const rowText = rows.map((r: any) =>
      r.querySelectorAll("td").map((cell: any) => cell.textContent)
    );

    expect(rowText).toEqual([
      ["Windows", "Chrome", "2"],
      ["Windows", "Edge", "1"],
      ["Windows", "Firefox", "1"],
      ["macOS", "Safari", "2"],
      ["macOS", "Chrome", "1"],
      ["Android", "Chrome", "1"],
    ]);
  });
});
