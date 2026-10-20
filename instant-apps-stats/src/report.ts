export interface FeatureDefinition {
  key: string;
  label: string;
  altKeys?: Readonly<Record<string, readonly [string] | readonly [string, string]>>;
}

export const FEATURES = [
  { key: "enableFilter", label: "Attribute Filter" },
  { key: "basemapGallery", label: "Basemap Gallery" },
  { key: "bookmarks", label: "Bookmarks" },
  {key: "buffer",label: "Buffer"},
  { key: "landingPage", label: "Cover Page" },
  { key: "customHeader", label: "Custom Header" },
  { key: "exportToPDF", label: "Export" },
  {key: "elevationProfile",label:"Elevation Profile"},
  { key: "floorFilter", label: "Floor Filter" },
  { key: "header", label: "Header" },
  { key: "home", label: "Home" },
  { key: "splash", label: "Intro Window" },
  { key: "keyboardShortcuts", label: "Keyboard Shortcuts" },
  { key: "languageSwitcher", label: "Language Switcher" },
  { key: "layerList", label: "Layer List" },
  { key: "legend", label: "Legend", altKeys: { sidebar: ["legendPanel"] } },
  { key: "mapArea", label: "Map Area" },
  { key: "mapZoom", label: "Map Zoom" },
  { key: "orientedImagery", label: "Oriented imagery" },
  { key: "search", label: "Search" },
  {key: "sketch", label: "Sketch"},
  { key: "swipe", label: "Swipe" },
  {key:"time", label:"Time"}
] as const satisfies readonly FeatureDefinition[];

export type FeatureKey = (typeof FEATURES)[number]["key"];

export const TEMPLATES = [
  "countdown", "charts", "notification", "manager", "imageryviewer",
  "streamflowviewer", "gallery", "exhibit", "media", "webeditor","observer",
  "lookup", "slider", "atlas", "reporter", "attachmentviewer", "portfolio",
  "nearby", "compare", "insets", "3dviewer", "interactivelegend", "sidebar",
  "basic", "dataexplorer",
] as const;

export interface AppItem {
  id: string;
  title: string;
  owner: string;
  template: string;
}

export interface AppConfiguration {
  item: AppItem;
  values: Record<string, unknown> | null;
  error?: string;
}

export interface DateRange {
  start: string;
  end: string;
}

export interface ChartRow {
  template: string;
  count: number;
  total: number;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Choose a valid start and end date.");
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error("Choose a valid start and end date.");
  }
  return date;
}

export function dateBounds(range: DateRange): { start: number; end: number } {
  const start = parseDate(range.start);
  const end = parseDate(range.end);
  if (start > end) {
    throw new Error("The start date must be on or before the end date.");
  }
  // Preserve the original report's displayed-date offset and inclusive UTC endpoints.
  return {
    start: Date.UTC(start.getFullYear(), start.getMonth(), start.getDate() + 1),
    end: Date.UTC(end.getFullYear(), end.getMonth(), end.getDate() + 1),
  };
}

export function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function defaultRange(today = new Date()): DateRange {
  const start = new Date(today);
  start.setDate(start.getDate() - 7);
  return { start: localDate(start), end: localDate(today) };
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "numeric", day: "numeric",
  }).format(parseDate(value));
}

export function templateFor(item: Record<string, unknown>): string {
  if (typeof item.url === "string") {
    const match = item.url.match(/\/apps\/instant\/([a-z0-9-]+)(?:\/|[?#]|$)/i);
    if (match) return match[1].toLowerCase();
  }
  if (Array.isArray(item.typeKeywords)) {
    for (const keyword of item.typeKeywords) {
      if (typeof keyword !== "string") continue;
      const source = keyword.match(/^sourceId#instant_app_([a-z0-9-]+)$/i);
      if (source) return source[1].toLowerCase();
      if (TEMPLATES.some((template) => template === keyword.toLowerCase())) {
        return keyword.toLowerCase();
      }
    }
  }
  return "unknown";
}

export function isFeatureEnabled(
  values: Record<string, unknown>,
  template: string,
  feature: FeatureDefinition,
): boolean {
  return values[feature.key] === true ||
    (feature.altKeys?.[template]?.some((key) => values[key] === true) ?? false);
}

export function aggregate(apps: AppConfiguration[], feature: FeatureKey): ChartRow[] {
  const definition = FEATURES.find(({ key }) => key === feature)!;
  const rows = new Map<string, ChartRow>(
    TEMPLATES.map((template) => [template, { template, count: 0, total: 0 }]),
  );
  for (const app of apps) {
    if (app.values === null) continue;
    const template = app.item.template;
    let row = rows.get(template);
    if (!row) {
      row = { template, count: 0, total: 0 };
      rows.set(template, row);
    }
    row.total++;
    if (isFeatureEnabled(app.values, template, definition)) row.count++;
  }
  return [...rows.values()];
}
