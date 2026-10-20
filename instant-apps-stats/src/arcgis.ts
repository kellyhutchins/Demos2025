import { dateBounds, isRecord, templateFor } from "./report";
import type { AppConfiguration, AppItem, DateRange } from "./report";

const REST_URL = "https://www.arcgis.com/sharing/rest";
const MINING_QUERY_URL = "https://services.arcgis.com/V6ZHFr6zdgNZuVG0/arcgis/rest/services/TemplateAppMining_1/FeatureServer/0/query";
const RECORD_BATCH_SIZE = 100;

export interface SearchResult {
  items: AppItem[];
  total: number;
}

async function request(
  path: string,
  parameters: Record<string, string>,
  signal: AbortSignal,
): Promise<unknown> {
  const query = new URLSearchParams({ f: "json", ...parameters });
  const url = path.startsWith("https://") ? path : `${REST_URL}/${path}`;
  const response = await fetch(`${url}?${query}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    credentials: "omit",
  });
  if (!response.ok) throw new Error(`ArcGIS request failed (HTTP ${response.status}).`);
  const data: unknown = await response.json();
  if (isRecord(data) && isRecord(data.error)) {
    const message = typeof data.error.message === "string" ? data.error.message : "Unknown ArcGIS error";
    throw new Error(`ArcGIS: ${message}`);
  }
  return data;
}

function parseItem(value: unknown): AppItem {
  if (
    !isRecord(value) || typeof value.AppId !== "string" ||
    !/^[a-f0-9]{32}$/i.test(value.AppId) || typeof value.TemplateOwner !== "string" ||
    typeof value.Url !== "string" || typeof value.Type !== "string"
  ) {
    throw new Error("ArcGIS returned an invalid app item.");
  }
  return {
    id: value.AppId,
    title: value.AppId,
    owner: value.TemplateOwner,
    template: templateFor({ url: value.Url, typeKeywords: [value.Type.replace(/^instant\//, "")] }),
  };
}

export async function searchApps(
  range: DateRange,
  signal: AbortSignal,
  onProgress: (count: number, total: number) => void,
): Promise<SearchResult> {
  const bounds = dateBounds(range);
  const where = `Url like '%/instant/%' AND (CreatedTime >= '${bounds.start}' AND CreatedTime <= '${bounds.end}')`;
  const ids = await request(MINING_QUERY_URL, { where, returnIdsOnly: "true" }, signal);
  if (
    !isRecord(ids) || !Array.isArray(ids.objectIds) ||
    !ids.objectIds.every((id: unknown) => typeof id === "number" && Number.isSafeInteger(id)) ||
    new Set(ids.objectIds).size !== ids.objectIds.length
  ) {
    throw new Error("ArcGIS returned an invalid mining record ID response.");
  }
  const objectIds: number[] = ids.objectIds;
  objectIds.sort((a, b) => a - b);
  const total = objectIds.length;
  const items: AppItem[] = [];
  onProgress(0, total);
  for (let offset = 0; offset < total; offset += RECORD_BATCH_SIZE) {
    const batch = objectIds.slice(offset, offset + RECORD_BATCH_SIZE);
    const data = await request(MINING_QUERY_URL, {
      objectIds: batch.join(","),
      outFields: "FID,AppId,Url,Type,TemplateOwner",
      returnGeometry: "false",
      orderByFields: "FID ASC",
    }, signal);
    if (!isRecord(data) || !Array.isArray(data.features)) {
      throw new Error("ArcGIS returned an invalid mining record response.");
    }
    const expected = new Set(batch);
    for (const feature of data.features) {
      if (!isRecord(feature) || !isRecord(feature.attributes) ||
        typeof feature.attributes.FID !== "number" || !expected.delete(feature.attributes.FID)) {
        throw new Error("ArcGIS returned an unexpected or duplicate mining record.");
      }
      items.push(parseItem(feature.attributes));
    }
    if (expected.size > 0 || data.exceededTransferLimit === true) {
      throw new Error("ArcGIS did not return all requested mining records. Run the report again.");
    }
    onProgress(items.length, total);
  }
  return { items, total };
}

export async function loadConfigurations(
  items: AppItem[],
  signal: AbortSignal,
  onProgress: (completed: number) => void,
): Promise<AppConfiguration[]> {
  const results: AppConfiguration[] = new Array(items.length);
  let next = 0;
  let completed = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      signal.throwIfAborted();
      const index = next++;
      const item = items[index];
      try {
        const data = await request(`content/items/${item.id}/data`, {}, signal);
        if (!isRecord(data) || !isRecord(data.values)) {
          throw new Error("No readable configuration values were returned.");
        }
        results[index] = { item, values: data.values };
      } catch (error) {
        signal.throwIfAborted();
        const message = errorMessage(error);
        console.warn(`Unable to read configuration for ${item.id}: ${message}`);
        results[index] = { item, values: null, error: message };
      }
      onProgress(++completed);
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, items.length) }, worker));
  return results;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError") return "The ArcGIS request timed out. Try again.";
    return error.message;
  }
  return "An unexpected error occurred while reading ArcGIS data.";
}
