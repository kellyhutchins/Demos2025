import { afterEach, describe, expect, it, vi } from "vitest";
import { renderChoiceChart } from "./chart";
import { FEATURES } from "./report";

class TestElement {
  attributes: Record<string, string> = {};
  children: TestElement[] = [];
  textContent = "";

  constructor(public tag: string) {}

  setAttribute(key: string, value: string): void {
    this.attributes[key] = value;
  }

  append(...children: TestElement[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: TestElement[]): void {
    this.children = children;
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("saved-choice donut chart", () => {
  const feature = FEATURES.find(({ key }) => key === "enableBufferSearch")!;

  function render(radius: number, extent: number, readable = radius + extent): TestElement {
    const host = new TestElement("div");
    vi.stubGlobal("document", {
      createElement: () => host,
      createElementNS: (_namespace: string, tag: string) => new TestElement(tag),
    });
    renderChoiceChart(document.createElement("div"), [
      { value: "search-radius", count: radius, total: readable },
      { value: "search-extent", count: extent, total: readable },
    ], feature);
    return host.children[0];
  }

  it("uses recognized saved choices for slice sizes and percentages, not all readable apps", () => {
    const svg = render(1, 3, 10);
    const segments = svg.children.filter((child) => child.attributes.class?.startsWith("donut-segment"));
    expect(segments.map((segment) => segment.attributes["stroke-dasharray"])).toEqual(["25 75", "75 25"]);
    expect(segments.map((segment) => segment.attributes["stroke-dashoffset"])).toEqual(["0", "-25"]);
    const text = svg.children.map((child) => child.textContent).join(" ");
    expect(text).toContain("1 (25%)");
    expect(text).toContain("3 (75%)");
    expect(text).toContain("search-extent (default)");
    expect(svg.attributes.role).toBe("img");
    expect(svg.children.find((child) => child.tag === "desc")?.textContent).toContain("missing or unrecognized choices are excluded");
    const ids = new Set(svg.children.map((child) => child.attributes.id));
    for (const id of svg.attributes["aria-labelledby"].split(" ")) expect(ids.has(id)).toBe(true);
  });

  it.each([[0, 0], [5, 0], [0, 5]])("handles empty and single-mode distributions (%i, %i)", (radius, extent) => {
    const svg = render(radius, extent);
    const segments = svg.children.filter((child) => child.attributes.class?.startsWith("donut-segment"));
    expect(segments).toHaveLength(radius + extent === 0 ? 0 : 1);
    if (segments.length) expect(segments[0].attributes["stroke-dasharray"]).toBe("100 0");
    const text = svg.children.map((child) => child.textContent).join(" ");
    expect(text).not.toMatch(/NaN|Infinity/);
    expect(text).toContain(radius + extent === 0 ? "No saved choices" : "100%");
    expect(text).toContain("search-radius");
    expect(text).toContain("search-extent (default)");
  });
});
