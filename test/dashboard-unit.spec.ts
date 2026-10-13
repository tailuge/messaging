// @ts-nocheck
import fs from "fs";
import path from "path";

describe("Dashboard UI Unit Tests", () => {
  let safeDecode: (str: string) => string;
  let updateUIFunction: Function;
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
        set textContent(v) { this._textContent = v; this.innerHTML = v; },
        innerHTML: "",
        style: {},
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
        if (selector === "#online-users-table tbody") return createMockElement("online-users-tbody");
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
      ${scriptContent.replace("fetchStats();", "")}
      return { safeDecode, updateUI };
    `);

    const exports = contextFunc(mockDocument, () => {});
    safeDecode = exports.safeDecode;
    updateUIFunction = exports.updateUI;
  });

  test("safeDecode correctly decodes URI components and handles double encoding and invalid input", () => {
    const sample = "%EC%A3%BC%EB%B2%BC%EB%A6%A1-o3dp9";
    const expected = decodeURIComponent(sample);
    expect(safeDecode(sample)).toBe(expected);
    expect(safeDecode(encodeURIComponent(sample))).toBe(expected);
    expect(safeDecode("plain-username")).toBe("plain-username");
    expect(safeDecode("%invalid%uri%")).toBe("%invalid%uri%");
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
