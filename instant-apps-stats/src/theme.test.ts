import { afterEach, describe, expect, it, vi } from "vitest";
import { aggregateTheme, hasThemeLogo, logoOptions, presetThemeRows, renderTheming, savedTheme, THEME_METRICS, themeCategory } from "./theme";
import { queryTemplateForFeatures } from "./report";
import type { AppConfiguration } from "./report";

class TestElement {
  children: (TestElement | string)[] = [];
  textContent = "";
  className = "";
  open = false;
  attributes: Record<string, string> = {};
  events: Record<string, () => void> = {};

  constructor(public tag: string) {}

  append(...children: (TestElement | string)[]): void { this.children.push(...children); }
  setAttribute(key: string, value: string): void { this.attributes[key] = value; }
  addEventListener(event: string, callback: () => void): void { this.events[event] = callback; }
  querySelector(tag: string): TestElement | undefined { return this.all().find((element) => element.tag === tag); }
  all(): TestElement[] {
    return this.children.flatMap((child) => typeof child === "string" ? [] : [child, ...child.all()]);
  }
  text(): string {
    return [this.textContent, ...this.children.map((child) => typeof child === "string" ? child : child.text())].join(" ");
  }
}

afterEach(() => vi.unstubAllGlobals());

function app(customTheme: unknown, template = "nearby", theme?: unknown): AppConfiguration {
  return {
    item: { id: "a".repeat(32), title: "Test", owner: "owner", template },
    values: { customTheme, theme },
  };
}

describe("all-template theming", () => {
  it("queries all templates alone or alongside search-method features", () => {
    expect(queryTemplateForFeatures(["customTheme"])).toBeUndefined();
    expect(queryTemplateForFeatures(["customTheme", "enableBufferSearch"])).toBeUndefined();
    expect(queryTemplateForFeatures(["enableSearchLayer", "customTheme"])).toBeUndefined();
  });

  it("reads only values.theme independently of customTheme and recognizes exact saved light/dark values", () => {
    const metric = THEME_METRICS[0];
    for (const customTheme of [undefined, null, {}, [], { theme: "dark" }]) {
      expect(themeCategory(app(customTheme, "nearby", "light"), metric)).toBe("Light");
      expect(themeCategory(app(customTheme, "nearby", "dark"), metric)).toBe("Dark");
    }
    for (const value of [undefined, null, {}, [], "Light", "auto", true, 1]) {
      expect(themeCategory(app({ theme: "light" }, "nearby", value), metric)).toBe("Missing / unrecognized");
    }
    expect(themeCategory({ ...app({}), values: { theme: "dark" } }, metric)).toBe("Dark");
    expect(themeCategory({ ...app({}), values: null }, metric)).toBe("Missing / unrecognized");
  });

  it.each([THEME_METRICS[1], THEME_METRICS[2]])("counts strict saved booleans for $key", (metric) => {
    expect(themeCategory(app({ [metric.key]: true }), metric)).toBe("Yes");
    expect(themeCategory(app({ [metric.key]: false }), metric)).toBe("No");
    for (const value of [undefined, null, "true", 1, {}, []]) {
      expect(themeCategory(app({ [metric.key]: value }), metric)).toBe("Missing / unrecognized");
    }
  });

  it("includes every readable template but excludes unknown values from each metric", () => {
    const apps = [
      app({ applyPresetTheme: true }, "nearby", "light"),
      app({ applyPresetTheme: false }, "lookup", "dark"),
      app({}, "unknown"),
      app(null, "future"),
      { ...app({}, "nearby", "dark"), values: null, error: "Not accessible" },
    ];
    expect(aggregateTheme(apps, THEME_METRICS[0])).toEqual([
      { value: "Light", count: 1, total: 2 },
      { value: "Dark", count: 1, total: 2 },
    ]);
    expect(aggregateTheme(apps, THEME_METRICS[1])).toEqual([
      { value: "Yes", count: 1, total: 2 },
      { value: "No", count: 1, total: 2 },
    ]);
    for (const metric of THEME_METRICS) {
      expect(aggregateTheme(apps, metric).reduce((sum, row) => sum + row.count, 0))
        .toBe(metric.key === "theme" || metric.key === "applyPresetTheme" ? 2 : 0);
    }
  });

  it.each(THEME_METRICS.slice(1))("excludes missing custom-theme values for $key", (metric) => {
    const missing = [app({}), app(null), app({ [metric.key]: 42 })];
    expect(aggregateTheme(missing, metric)).toEqual([
      { value: "Yes", count: 0, total: 0 },
      { value: "No", count: 0, total: 0 },
    ]);
  });

  it("excludes missing and unrecognized color modes from rows and percentage denominators", () => {
    const metric = THEME_METRICS[0];
    const missing = [app({}), app(null), app({}, "lookup", "auto"), app({}, "basic", "Light")];
    expect(aggregateTheme(missing, metric)).toEqual([
      { value: "Light", count: 0, total: 0 },
      { value: "Dark", count: 0, total: 0 },
    ]);
    expect(aggregateTheme([...missing, app({}, "lookup", "dark")], metric)).toEqual([
      { value: "Light", count: 0, total: 1 },
      { value: "Dark", count: 1, total: 1 },
    ]);
  });

  it("groups preset names only when the preset is explicitly applied", () => {
    expect(presetThemeRows([
      app({ applyPresetTheme: true, preset: "ocean" }),
      app({ applyPresetTheme: true, preset: "ocean" }, "lookup"),
      app({ applyPresetTheme: true, preset: "forest" }),
      app({ applyPresetTheme: false, preset: "ignored" }),
      app({ preset: "ignored" }),
      app({ applyPresetTheme: true, preset: "" }),
      app({ applyPresetTheme: true, preset: 42 }),
      { ...app({ applyPresetTheme: true, preset: "ignored" }), values: null },
    ])).toEqual([
      { value: "forest", count: 1 },
      { value: "ocean", count: 2 },
    ]);
  });

  it("treats the supplied logo example as explicitly empty, not configured", () => {
    const theme = {
      applySharedTheme: false, applyPresetTheme: true, font: "Avenir Next",
      appFont: "Avenir Next", logo: null, logoAltText: "", logoLink: "",
      logoScale: "m", logoAspectRatio: "square", logoUrl: "",
      logoSource: "upload", preset: "ocean",
      themes: { primary: { background: "#005E95" } },
    };
    expect(hasThemeLogo(theme)).toBe(false);
    expect(themeCategory(app(theme), THEME_METRICS[3])).toBe("No");
    expect(themeCategory(app(theme), THEME_METRICS[0])).toBe("Missing / unrecognized");
  });

  it.each([
    { logo: "uploaded-image.png" },
    { logoUrl: "https://example.com/logo.png" },
    { logo: { url: "https://example.com/logo.png" } },
    { logo: null, logoUrl: "https://example.com/logo.png" },
  ])("recognizes a nonempty logo or URL: %j", (theme) => {
    expect(hasThemeLogo(theme)).toBe(true);
    expect(themeCategory(app(theme), THEME_METRICS[3])).toBe("Yes");
  });

  it.each([{}, { logo: {} }, { logo: [] }, { logo: true }, { logoUrl: 1 }, { logoUrl: {} }, { logoUrl: { url: "logo.png" } }, { logoSource: "upload" }])(
    "does not infer logo presence or absence from malformed or missing data: %j", (theme) => {
      expect(hasThemeLogo(theme)).toBe(false);
      expect(themeCategory(app(theme), THEME_METRICS[3])).toBe("Missing / unrecognized");
    },
  );

  it.each([{ logo: null }, { logoUrl: "" }, { logo: "", logoUrl: null }, { logo: "  " }])(
    "recognizes explicitly empty logo fields: %j", (theme) => {
      expect(themeCategory(app(theme), THEME_METRICS[3])).toBe("No");
    },
  );

  it("preserves all saved logo options and distinguishes missing from empty", () => {
    expect(logoOptions({
      logo: { resource: "logo.png" }, logoSource: "upload", logoUrl: "",
      logoAltText: "<script>not HTML</script>", logoLink: "https://example.com",
      logoScale: "m", logoAspectRatio: "square",
    })).toEqual([
      ["Logo", '{"resource":"logo.png"}'], ["Source", '"upload"'], ["URL", '""'],
      ["Alt text", '"<script>not HTML</script>"'], ["Link", '"https://example.com"'],
      ["Scale", '"m"'], ["Aspect ratio", '"square"'],
    ]);
    expect(logoOptions({ logo: null })[0]).toEqual(["Logo", "null"]);
    expect(logoOptions({})[0]).toEqual(["Logo", "Not saved"]);
  });

  it("handles empty reports without counting unreadable configurations", () => {
    for (const metric of THEME_METRICS) {
      expect(aggregateTheme([], metric).every((row) => row.count === 0 && row.total === 0)).toBe(true);
    }
    expect(presetThemeRows([])).toEqual([]);
    expect(savedTheme({ ...app({}), values: null })).toBeUndefined();
  });

  it("renders metric bars, safe logo text, and category app drill-downs", () => {
    const host = new TestElement("section");
    vi.stubGlobal("document", { createElement: (tag: string) => tag === "section" ? host : new TestElement(tag) });
    const apps = [
      app({ applyPresetTheme: true, preset: "ocean", logoUrl: "https://example.com/logo.png", logoAltText: "<img onerror=alert(1)>" }, "nearby", "dark"),
      app({ logo: null }, "lookup", "light"),
      { ...app({}, "nearby", "dark"), values: null },
    ];
    renderTheming(document.createElement("section"), apps, (item) => {
      const link = document.createElement("a");
      link.textContent = item.id;
      return link;
    });
    expect(host.all().filter((element) => element.tag === "meter")).toHaveLength(8);
    expect(host.text()).toContain("2 readable apps across all templates");
    expect(host.text()).toContain("ocean");
    expect(host.text()).toContain("<img onerror=alert(1)>");
    expect(host.all().some((element) => element.tag === "img")).toBe(false);
    expect(host.text()).toContain("View logo options (1 apps)");
    const darkBar = host.all().find((element) =>
      element.attributes["aria-label"] === "Color mode: Dark, 1 of 2 apps with saved light/dark mode");
    expect(darkBar).toBeDefined();
    const colorTable = host.all().find((element) => element.tag === "table")!;
    expect(colorTable.text()).not.toContain("Missing / unrecognized");
    for (const table of host.all().filter((element) => element.tag === "table")) {
      expect(table.text()).not.toContain("Missing / unrecognized");
    }
    const darkDetails = colorTable.all().filter((element) => element.tag === "details")[1];
    darkDetails.open = true;
    darkDetails.events.toggle();
    expect(darkDetails.text()).toContain("(Nearby)");
    expect(darkDetails.text()).not.toContain("(Zone Lookup)");
    darkDetails.events.toggle();
    expect(darkDetails.all().filter((element) => element.tag === "ul")).toHaveLength(1);
  });
});
