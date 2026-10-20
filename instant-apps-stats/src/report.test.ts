import { describe, expect, it } from "vitest";
import { aggregate, dateBounds, defaultRange, FEATURES, isFeatureEnabled, templateFor } from "./report";
import type { AppConfiguration, FeatureDefinition } from "./report";

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
});
