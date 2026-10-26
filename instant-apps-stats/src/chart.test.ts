import { afterEach, describe, expect, it, vi } from "vitest";
import { renderChoiceChart } from "./chart";
import { FEATURES } from "./report";
import type { ChoiceChartRow, FeatureDefinition } from "./report";

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

function renderSavedChoices(rows: ChoiceChartRow[], feature: FeatureDefinition): TestElement {
  const host = new TestElement("div");
  vi.stubGlobal("document", {
    createElement: () => host,
    createElementNS: (_namespace: string, tag: string) => new TestElement(tag),
  });
  renderChoiceChart(document.createElement("div"), rows, feature);
  return host.children[0];
}

describe("saved-choice donut chart", () => {
  const feature = FEATURES.find(({ key }) => key === "enableBufferSearch")!;

  function render(radius: number, extent: number, readable = radius + extent): TestElement {
    return renderSavedChoices([
      { value: "search-radius", count: radius, total: readable },
      { value: "search-extent", count: extent, total: readable },
    ], feature);
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

describe("Lookup saved-choice donut chart", () => {
  const feature = FEATURES.find(({ key }) => key === "enableSearchLayer")!;

  it.each([[1, 3], [0, 0], [5, 0], [0, 5]])(
    "shows friendly labels, the zone default and accurate shares (%i, %i)",
    (zone, layer) => {
      const svg = renderSavedChoices([
        { value: "search-zone", count: zone, total: zone + layer + 2 },
        { value: "search-layer", count: layer, total: zone + layer + 2 },
      ], feature);
      const text = svg.children.map((child) => child.textContent).join(" ");
      expect(text).toContain("For a zone (default)");
      expect(text).toContain("Features within a zone");
      expect(text).not.toContain("Features within a zone (default)");
      expect(text).not.toMatch(/search-zone|search-layer|NaN|Infinity/);
      const segments = svg.children.filter((child) => child.attributes.class?.startsWith("donut-segment"));
      expect(segments).toHaveLength(Number(zone > 0) + Number(layer > 0));
      expect(segments.map((segment) => segment.attributes["stroke-dasharray"])).toEqual(
        zone && layer ? ["25 75", "75 25"] : zone + layer ? ["100 0"] : [],
      );
      expect(svg.children.find((child) => child.tag === "desc")?.textContent).toContain("For a zone");
      for (const segment of segments) {
        expect(segment.children[0].textContent).toMatch(/^(For a zone|Features within a zone):/);
      }
      if (!zone && !layer) expect(text).toContain("No saved choices");
    },
  );
});
