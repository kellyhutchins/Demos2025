import { describe, expect, it } from "vitest";
import { aggregate, aggregateChoices, choiceLabel, dateBounds, defaultRange, FEATURES, getFeatureChoice, isFeatureEnabled, matchesFeature, queryTemplateForFeatures, templateFor, templateLabel, TEMPLATES } from "./report";
import type { AppConfiguration, FeatureDefinition } from "./report";

describe("query template selection", () => {
  it("restricts sole search-method selections to their respective templates", () => {
    expect(queryTemplateForFeatures(["enableBufferSearch"])).toBe("nearby");
    expect(queryTemplateForFeatures(["enableSearchLayer"])).toBe("lookup");
    expect(queryTemplateForFeatures([])).toBeUndefined();
    expect(queryTemplateForFeatures(["legend"])).toBeUndefined();
    expect(queryTemplateForFeatures(["enableBufferSearch", "legend"])).toBeUndefined();
    expect(queryTemplateForFeatures(["legend", "enableBufferSearch"])).toBeUndefined();
    expect(queryTemplateForFeatures(["enableSearchLayer", "legend"])).toBeUndefined();
    expect(queryTemplateForFeatures(["legend", "enableSearchLayer"])).toBeUndefined();
    expect(queryTemplateForFeatures(["enableBufferSearch", "enableSearchLayer"])).toBeUndefined();
    expect(queryTemplateForFeatures(["enableSearchLayer", "enableBufferSearch"])).toBeUndefined();
  });
});

describe("date ranges", () => {
  it("matches the original October 5–6 report's October 6–7 UTC query", () => {
    const range = dateBounds({ start: "2026-10-05", end: "2026-10-06" });
    expect(range.start).toBe(Date.parse("2026-10-06T00:00:00Z"));
    expect(range.end).toBe(Date.parse("2026-10-07T00:00:00Z"));
  });

  it("accepts a single day", () => {
    const range = dateBounds({ start: "2026-10-20", end: "2026-10-20" });
    expect(range.end).toBe(range.start);
  });

  it("preserves UTC endpoints across daylight saving changes", () => {
    const range = dateBounds({ start: "2026-03-08", end: "2026-03-08" });
    expect(range.start).toBe(Date.UTC(2026, 2, 9));
    expect(range.end).toBe(Date.UTC(2026, 2, 9));
  });

  it.each([
    { start: "2026-02-30", end: "2026-03-01" },
    { start: "2026-10-21", end: "2026-10-20" },
    { start: "", end: "2026-10-20" },
    { start: "10/12/2026", end: "2026-10-20" },
    { start: "2026-10-12", end: "2026-13-01" },
  ])("rejects invalid date range %j", (range) => {
    expect(() => dateBounds(range)).toThrow();
  });

  it("defaults to seven calendar days ago through today across months", () => {
    expect(defaultRange(new Date(2026, 0, 3, 23))).toEqual({
      start: "2025-12-27", end: "2026-01-03",
    });
  });
});

describe("template identification", () => {
  it.each(TEMPLATES)("keeps the $key path independent of its $label display label", ({ key, label }) => {
    expect(templateLabel(key)).toBe(label);
    expect(templateFor({ url: `/apps/instant/${key}/index.html` })).toBe(key);
    expect(templateFor({ typeKeywords: [key.toUpperCase()] })).toBe(key);
  });

  it("uses friendly names and preserves unrecognized template paths", () => {
    expect(templateLabel("basic")).toBe("Basic");
    expect(templateLabel("attachmentviewer")).toBe("Attachment Viewer");
    expect(templateLabel("unknown")).toBe("Unknown");
    expect(templateLabel("future-template")).toBe("future-template");
    expect(templateFor({ typeKeywords: ["Minimalist"] })).toBe("unknown");
    expect(new Set(TEMPLATES.map(({ key }) => key)).size).toBe(TEMPLATES.length);
  });

  it("reads a template from absolute and relative app URLs", () => {
    expect(templateFor({ url: "https://example.maps.arcgis.com/apps/instant/sidebar/index.html?appid=123" })).toBe("sidebar");
    expect(templateFor({ url: "/apps/instant/basic/index.html" })).toBe("basic");
  });

  it("falls back to source ID or a known template keyword", () => {
    expect(templateFor({ typeKeywords: ["sourceId#instant_app_atlas"] })).toBe("atlas");
    expect(templateFor({ typeKeywords: ["JavaScript", "interactivelegend"] })).toBe("interactivelegend");
  });

  it("does not invent a template for unknown or malformed data", () => {
    expect(templateFor({ url: "javascript:alert(1)", typeKeywords: [null, 2] })).toBe("unknown");
  });
});

describe("configuration aggregation", () => {
  function app(template: string, values: Record<string, unknown> | null): AppConfiguration {
    return { item: { id: "a".repeat(32), title: "Test", owner: "owner", template }, values };
  }

  it("counts only explicit boolean true values and excludes unreadable data", () => {
    const rows = aggregate([
      app("sidebar", { basemapGallery: true }),
      app("sidebar", { basemapGallery: false }),
      app("sidebar", { basemapGallery: "true" }),
      app("sidebar", { basemapGallery: 1 }),
      app("sidebar", {}),
      app("sidebar", null),
    ], "basemapGallery");
    expect(rows.find((row) => row.template === "sidebar")).toEqual({
      template: "sidebar", count: 1, total: 5,
    });
  });

  it("keeps zero-count templates and includes unknown or new templates", () => {
    const rows = aggregate([app("unknown", { legend: true }), app("future", { legend: true })], "legend");
    expect(rows.find((row) => row.template === "basic")).toEqual({ template: "basic", count: 0, total: 0 });
    expect(rows.find((row) => row.template === "unknown")?.count).toBe(1);
    expect(rows.find((row) => row.template === "future")?.count).toBe(1);
  });

  it("recalculates for the selected feature without modifying source data", () => {
    const apps = [app("basic", { legend: true, search: false })];
    expect(aggregate(apps, "legend").find((row) => row.template === "basic")?.count).toBe(1);
    expect(aggregate(apps, "search").find((row) => row.template === "basic")?.count).toBe(0);
    expect(apps[0].values).toEqual({ legend: true, search: false });
  });

  it("exposes distinct configuration options, including Time", () => {
    expect(new Set(FEATURES.map((feature) => feature.key)).size).toBe(FEATURES.length);
    expect(FEATURES.some((feature) => feature.key === "time")).toBe(true);
  });

  it("counts Sidebar Legend when either key is true, without double counting", () => {
    const rows = aggregate([
      app("sidebar", { legendPanel: true }),
      app("sidebar", { legend: false, legendPanel: true }),
      app("sidebar", { legend: true, legendPanel: false }),
      app("sidebar", { legend: true, legendPanel: true }),
      app("sidebar", { legendPanel: false }),
      app("sidebar", { legendPanel: "true" }),
      app("sidebar", { legendPanel: 1 }),
      app("sidebar", {}),
      app("sidebar", null),
    ], "legend");
    expect(rows.find((row) => row.template === "sidebar")).toEqual({
      template: "sidebar", count: 4, total: 8,
    });
  });

  it("does not apply Sidebar alternate keys to other templates or features", () => {
    const apps = [
      app("basic", { legendPanel: true }),
      app("unknown", { legendPanel: true }),
      app("sidebar", { legendPanel: true }),
    ];
    expect(aggregate(apps, "legend").find((row) => row.template === "basic")?.count).toBe(0);
    expect(aggregate(apps, "legend").find((row) => row.template === "unknown")?.count).toBe(0);
    expect(aggregate(apps, "search").find((row) => row.template === "sidebar")?.count).toBe(0);
  });

  it("supports both alternate key slots independently with strict boolean matching", () => {
    const definition = {
      key: "primary",
      label: "Example",
      altKeys: { sidebar: ["firstAlias", "secondAlias"] },
    } as const satisfies FeatureDefinition;
    expect(isFeatureEnabled({ primary: true }, "sidebar", definition)).toBe(true);
    expect(isFeatureEnabled({ primary: false, firstAlias: true }, "sidebar", definition)).toBe(true);
    expect(isFeatureEnabled({ primary: false, secondAlias: true }, "sidebar", definition)).toBe(true);
    expect(isFeatureEnabled({ firstAlias: "true", secondAlias: 1 }, "sidebar", definition)).toBe(false);
    expect(isFeatureEnabled({ secondAlias: true }, "basic", definition)).toBe(false);
    expect(isFeatureEnabled({}, "sidebar", definition)).toBe(false);
  });

  const searchMethod = FEATURES.find((feature) => feature.key === "enableBufferSearch")!;
  const lookupSearchMethod = FEATURES.find((feature) => feature.key === "enableSearchLayer")!;

  it("uses friendly Lookup labels without changing Nearby labels", () => {
    expect(choiceLabel(lookupSearchMethod, "search-zone")).toBe("For a zone");
    expect(choiceLabel(lookupSearchMethod, "search-layer")).toBe("Features within a zone");
    expect(choiceLabel(searchMethod, "search-radius")).toBe("search-radius");
    expect(choiceLabel(searchMethod, "search-extent")).toBe("search-extent");
  });

  it.each([
    [{ enableSearchLayer: { branchValue: "search-zone", branchOptionsFieldNames: ["zoneLookupLayers", "spatialRelationshipZone", "mapClickLocation"] } }, false],
    [{ enableSearchLayer: { branchValue: "search-layer" } }, true],
    [{}, false],
    [{ enableSearchLayer: {} }, false],
    [{ enableSearchLayer: { branchValue: "other" } }, false],
    [{ enableSearchLayer: { branchValue: "SEARCH-LAYER" } }, false],
    [{ enableSearchLayer: { branchValue: true } }, false],
    [{ enableSearchLayer: { branchValue: null } }, false],
    [{ enableSearchLayer: null }, false],
    [{ enableSearchLayer: [] }, false],
    [{ enableSearchLayer: true }, false],
    [{ enableSearchLayer: "search-layer" }, false],
    [{ branchValue: "search-layer" }, false],
  ])("matches only a recognized, saved non-default Lookup choice: %j", (values, expected) => {
    expect(matchesFeature(values, "lookup", lookupSearchMethod)).toBe(expected);
  });

  it("limits Lookup distributions, modified counts and app lists to readable Lookup apps", () => {
    const apps = [
      app("lookup", { enableSearchLayer: { branchValue: "search-zone" } }),
      app("lookup", { enableSearchLayer: { branchValue: "search-layer" } }),
      app("lookup", { enableSearchLayer: { branchValue: "search-layer" } }),
      app("lookup", {}),
      app("lookup", { enableSearchLayer: { branchValue: "unexpected" } }),
      app("lookup", { enableSearchLayer: true }),
      app("lookup", null),
      app("nearby", { enableSearchLayer: { branchValue: "search-layer" } }),
      app("unknown", { enableSearchLayer: { branchValue: "search-layer" } }),
    ];
    expect(aggregateChoices(apps, lookupSearchMethod)).toEqual([
      { value: "search-zone", count: 1, total: 6 },
      { value: "search-layer", count: 2, total: 6 },
    ]);
    expect(aggregate(apps, "enableSearchLayer")).toEqual([{ template: "lookup", count: 2, total: 6 }]);
    const matches = apps.filter(({ item, values }) =>
      values !== null && matchesFeature(values, item.template, lookupSearchMethod));
    expect(matches).toEqual([apps[1], apps[2]]);
    expect(getFeatureChoice(matches[0].values!, lookupSearchMethod)).toBe("search-layer");
    expect(apps[3].values).toEqual({});
  });

  it("retains both Lookup modes with zero counts without inferring the default", () => {
    for (const apps of [[], [app("lookup", null)], [app("nearby", {})]]) {
      expect(aggregateChoices(apps, lookupSearchMethod)).toEqual([
        { value: "search-zone", count: 0, total: 0 },
        { value: "search-layer", count: 0, total: 0 },
      ]);
      expect(aggregate(apps, "enableSearchLayer")).toEqual([{ template: "lookup", count: 0, total: 0 }]);
    }
    expect(aggregateChoices([app("lookup", {})], lookupSearchMethod)).toEqual([
      { value: "search-zone", count: 0, total: 1 },
      { value: "search-layer", count: 0, total: 1 },
    ]);
  });

  it.each([
    [{ enableBufferSearch: { branchValue: "search-radius" } }, true],
    [{ enableBufferSearch: { branchValue: "search-extent" } }, false],
    [{}, false],
    [{ enableBufferSearch: {} }, false],
    [{ enableBufferSearch: { branchValue: "other" } }, false],
    [{ enableBufferSearch: { branchValue: "SEARCH-RADIUS" } }, false],
    [{ enableBufferSearch: { branchValue: true } }, false],
    [{ enableBufferSearch: { branchValue: null } }, false],
    [{ enableBufferSearch: null }, false],
    [{ enableBufferSearch: [] }, false],
    [{ enableBufferSearch: true }, false],
    [{ enableBufferSearch: false }, false],
    [{ enableBufferSearch: "search-radius" }, false],
    [{ branchValue: "search-radius" }, false],
  ])("matches only a recognized, saved non-default Nearby choice: %j", (values, expected) => {
    expect(matchesFeature(values, "nearby", searchMethod)).toBe(expected);
  });

  it("limits modified counts and denominators to readable Nearby configurations", () => {
    expect(aggregate([
      app("nearby", { enableBufferSearch: { branchValue: "search-radius" } }),
      app("nearby", { enableBufferSearch: { branchValue: "search-extent" } }),
      app("nearby", {}),
      app("nearby", { enableBufferSearch: { branchValue: "unexpected" } }),
      app("nearby", null),
      app("sidebar", { enableBufferSearch: { branchValue: "search-radius" } }),
      app("unknown", { enableBufferSearch: { branchValue: "search-radius" } }),
    ], "enableBufferSearch")).toEqual([{ template: "nearby", count: 1, total: 4 }]);
    expect(matchesFeature(
      { enableBufferSearch: { branchValue: "search-radius" } }, "sidebar", searchMethod,
    )).toBe(false);
    expect(aggregate([], "enableBufferSearch")).toEqual([{ template: "nearby", count: 0, total: 0 }]);
  });

  it("uses the same predicate for counts and app lists and retains the saved choice", () => {
    const apps = [
      app("nearby", { enableBufferSearch: { branchValue: "search-radius" } }),
      app("nearby", { enableBufferSearch: { branchValue: "search-extent" } }),
      app("nearby", {}),
      app("nearby", null),
      app("basic", { enableBufferSearch: { branchValue: "search-radius" } }),
    ];
    const matches = apps.filter(({ item, values }) =>
      values !== null && matchesFeature(values, item.template, searchMethod));
    expect(matches).toHaveLength(aggregate(apps, "enableBufferSearch")[0].count);
    expect(getFeatureChoice(matches[0].values!, searchMethod)).toBe("search-radius");
    expect(apps[0].values).toEqual({ enableBufferSearch: { branchValue: "search-radius" } });
  });

  it("distributes saved Nearby choices without inferring missing values as the default", () => {
    const apps = [
      app("nearby", { enableBufferSearch: { branchValue: "search-radius" } }),
      app("nearby", { enableBufferSearch: { branchValue: "search-radius" } }),
      app("nearby", { enableBufferSearch: { branchValue: "search-extent" } }),
      app("nearby", {}),
      app("nearby", { enableBufferSearch: { branchValue: "unexpected" } }),
      app("nearby", { enableBufferSearch: true }),
      app("nearby", null),
      app("basic", { enableBufferSearch: { branchValue: "search-extent" } }),
      app("unknown", { enableBufferSearch: { branchValue: "search-radius" } }),
    ];
    expect(aggregateChoices(apps, searchMethod)).toEqual([
      { value: "search-radius", count: 2, total: 6 },
      { value: "search-extent", count: 1, total: 6 },
    ]);
    expect(aggregate(apps, "enableBufferSearch")).toEqual([
      { template: "nearby", count: 2, total: 6 },
    ]);
    expect(apps[3].values).toEqual({});
  });

  it("keeps both search modes visible with zero counts when no saved choices match", () => {
    for (const apps of [[], [app("nearby", null)], [app("sidebar", {})]]) {
      expect(aggregateChoices(apps, searchMethod)).toEqual([
        { value: "search-radius", count: 0, total: 0 },
        { value: "search-extent", count: 0, total: 0 },
      ]);
    }
    expect(aggregateChoices([app("nearby", {})], searchMethod)).toEqual([
      { value: "search-radius", count: 0, total: 1 },
      { value: "search-extent", count: 0, total: 1 },
    ]);
  });

  it("preserves boolean and alternate-key rules through the shared predicate", () => {
    const legend = FEATURES.find((feature) => feature.key === "legend")!;
    expect(matchesFeature({ legendPanel: true }, "sidebar", legend)).toBe(true);
    expect(matchesFeature({ legendPanel: true }, "basic", legend)).toBe(false);
    expect(matchesFeature({ legend: "true" }, "nearby", legend)).toBe(false);
    expect(matchesFeature({ legend: true }, "nearby", legend)).toBe(true);
  });
});
