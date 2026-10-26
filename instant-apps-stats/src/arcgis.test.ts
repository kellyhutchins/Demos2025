import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfigurations, searchApps } from "./arcgis";

const range = { start: "2026-10-12", end: "2026-10-20" };
const item = {
  id: "a".repeat(32), title: "Test app", owner: "test-owner",
  url: "https://www.arcgis.com/apps/instant/sidebar/index.html",
};
function feature(fid: number, appId = item.id) {
  return { attributes: {
    FID: fid, AppId: appId, TemplateOwner: item.owner,
    Url: item.url, Type: "instant/sidebar",
  } };
}
const parsedItem = {
  id: item.id, title: item.title, owner: item.owner, template: "sidebar",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mining dataset queries", () => {
  it("uses the original dataset, string timestamp filter and complete ID list", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ objectIds: [2, 1] }))
      .mockResolvedValueOnce(Response.json({ features: [feature(1), feature(2, "b".repeat(32))] }));
    vi.stubGlobal("fetch", fetcher);
    const progress = vi.fn();
    const result = await searchApps(range, new AbortController().signal, progress);
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.items[0]).toEqual({ ...parsedItem, title: item.id });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.pathname).toContain("TemplateAppMining_1/FeatureServer/0/query");
    expect(url.searchParams.get("where")).toBe(
      "Url like '%/instant/%' AND (CreatedTime >= '1791849600000' AND CreatedTime <= '1792540800000')",
    );
    expect(url.searchParams.get("returnIdsOnly")).toBe("true");
    expect(new URL(fetcher.mock.calls[1][0]).searchParams.get("objectIds")).toBe("1,2");
    expect(url.searchParams.has("token")).toBe(false);
    expect(fetcher.mock.calls[0][1].credentials).toBe("omit");
    expect(progress).toHaveBeenLastCalledWith(2, 2);
  });

  it("handles an empty date range result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ objectIds: [] })));
    await expect(searchApps(range, new AbortController().signal, vi.fn())).resolves.toEqual({
      items: [], total: 0,
    });
  });

  it("restricts the mining query to Nearby before loading configurations", async () => {
    const nearbyFeature = feature(1);
    nearbyFeature.attributes.Url = "https://www.arcgis.com/apps/instant/nearby/index.html?appid=" + item.id;
    nearbyFeature.attributes.Type = "instant/nearby";
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ objectIds: [1] }))
      .mockResolvedValueOnce(Response.json({ features: [nearbyFeature] }))
      .mockResolvedValueOnce(Response.json({ values: {} }));
    vi.stubGlobal("fetch", fetcher);
    const result = await searchApps(range, new AbortController().signal, vi.fn(), "nearby");
    expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("where")).toBe(
      "Url like '%/instant/nearby/%' AND (CreatedTime >= '1791849600000' AND CreatedTime <= '1792540800000')",
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].template).toBe("nearby");
    await loadConfigurations(result.items, new AbortController().signal, vi.fn());
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(new URL(fetcher.mock.calls[2][0]).pathname).toBe(`/sharing/rest/content/items/${item.id}/data`);
  });

  it("fetches every batch beyond 10,000 records, retaining separate mining records for the same app", async () => {
    const ids = Array.from({ length: 10001 }, (_, index) => index + 1);
    const fetcher = vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.searchParams.has("returnIdsOnly")) return Response.json({ objectIds: ids });
      return Response.json({
        features: url.searchParams.get("objectIds")!.split(",").map((id) => feature(Number(id))),
      });
    });
    vi.stubGlobal("fetch", fetcher);
    const result = await searchApps(range, new AbortController().signal, vi.fn());
    expect(result.items).toHaveLength(10001);
    expect(result.total).toBe(10001);
    expect(fetcher).toHaveBeenCalledTimes(102);
  });

  it("surfaces ArcGIS errors returned in HTTP 200 responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      error: { code: 400, message: "Invalid query" },
    })));
    await expect(searchApps(range, new AbortController().signal, vi.fn())).rejects.toThrow("Invalid query");
  });

  it("surfaces HTTP and malformed response errors", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ objectIds: "invalid" }));
    vi.stubGlobal("fetch", fetcher);
    await expect(searchApps(range, new AbortController().signal, vi.fn())).rejects.toThrow("HTTP 503");
    await expect(searchApps(range, new AbortController().signal, vi.fn())).rejects.toThrow("invalid mining record ID response");
  });

  it("rejects invalid item IDs rather than constructing unsafe URLs", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ objectIds: [1] }))
      .mockResolvedValueOnce(Response.json({ features: [feature(1, "../other")] })));
    await expect(searchApps(range, new AbortController().signal, vi.fn())).rejects.toThrow("invalid app item");
  });

  it("rejects missing records instead of reporting an incomplete result as success", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ objectIds: [1, 2] }))
      .mockResolvedValueOnce(Response.json({ features: [feature(1)] })));
    await expect(searchApps(range, new AbortController().signal, vi.fn())).rejects.toThrow("did not return all");
  });

  it("rejects duplicate records", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ objectIds: [1, 2] }))
      .mockResolvedValueOnce(Response.json({ features: [feature(1), feature(1)] })));
    await expect(searchApps(range, new AbortController().signal, vi.fn())).rejects.toThrow("duplicate mining record");
  });

  it("rejects transfer-limited batches rather than silently skipping records", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ objectIds: [1] }))
      .mockResolvedValueOnce(Response.json({ features: [feature(1)], exceededTransferLimit: true })));
    await expect(searchApps(range, new AbortController().signal, vi.fn())).rejects.toThrow("did not return all");
  });

  it("rejects invalid dates before sending a request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(searchApps({ start: "bad", end: range.end }, new AbortController().signal, vi.fn())).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("configuration loading", () => {
  it("retains per-item errors without treating them as disabled features", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ values: { legend: true } }))
      .mockResolvedValueOnce(Response.json({ error: { message: "Item is not accessible" } }))
      .mockResolvedValueOnce(Response.json({ values: null })));
    const items = [parsedItem, { ...parsedItem, id: "b".repeat(32) }, { ...parsedItem, id: "c".repeat(32) }];
    const progress = vi.fn();
    const results = await loadConfigurations(items, new AbortController().signal, progress);
    expect(results[0].values).toEqual({ legend: true });
    expect(results[1].values).toBeNull();
    expect(results[1].error).toContain("Item is not accessible");
    expect(results[2].values).toBeNull();
    expect(results[2].error).toContain("No readable configuration");
    expect(progress).toHaveBeenLastCalledWith(3);
  });

  it("limits concurrent requests to eight and preserves item order", async () => {
    let active = 0;
    let peak = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return Response.json({ values: { legend: true } });
    }));
    const items = Array.from({ length: 25 }, (_, i) => ({
      ...parsedItem, id: i.toString(16).padStart(32, "0"),
    }));
    const results = await loadConfigurations(items, new AbortController().signal, vi.fn());
    expect(peak).toBe(8);
    expect(results.map((result) => result.item.id)).toEqual(items.map((entry) => entry.id));
  });

  it("cancels instead of returning a success-shaped partial report", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(loadConfigurations([parsedItem], controller.signal, vi.fn())).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
