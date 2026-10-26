import { isRecord, templateLabel } from "./report";
import type { AppConfiguration, AppItem } from "./report";

export const THEME_METRICS = [
  { key: "theme", label: "Color mode", choices: ["Light", "Dark"] },
  { key: "applyPresetTheme", label: "Preset theme applied", choices: ["Yes", "No"] },
  { key: "applySharedTheme", label: "Shared theme used", choices: ["Yes", "No"] },
  { key: "logo", label: "Logo configured", choices: ["Yes", "No"] },
] as const;

type ThemeMetric = (typeof THEME_METRICS)[number];

export function savedTheme(app: AppConfiguration): Record<string, unknown> | undefined {
  return app.values && isRecord(app.values.customTheme) ? app.values.customTheme : undefined;
}

function nonEmpty(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  return isRecord(value) && Object.keys(value).length > 0;
}

export function hasThemeLogo(theme: Record<string, unknown>): boolean {
  return nonEmpty(theme.logo) ||
    (typeof theme.logoUrl === "string" && theme.logoUrl.trim().length > 0);
}

export function themeCategory(app: AppConfiguration, metric: ThemeMetric): string {
  if (metric.key === "theme") {
    const value = app.values?.theme;
    return value === "light" ? "Light" : value === "dark" ? "Dark" : "Missing / unrecognized";
  }
  const theme = savedTheme(app);
  if (!theme) return "Missing / unrecognized";
  const value = theme[metric.key];
  if (metric.key === "logo") {
    if (hasThemeLogo(theme)) return "Yes";
    const empty = (value: unknown): boolean => value === null ||
      (typeof value === "string" && value.trim() === "");
    return (empty(theme.logo) || empty(theme.logoUrl)) &&
      [theme.logo, theme.logoUrl].every((value) => value === undefined || empty(value))
      ? "No" : "Missing / unrecognized";
  }
  return value === true ? "Yes" : value === false ? "No" : "Missing / unrecognized";
}

export function aggregateTheme(apps: AppConfiguration[], metric: ThemeMetric) {
  const readable = apps.filter((app) => app.values !== null &&
    metric.choices.some((choice) => choice === themeCategory(app, metric)));
  return metric.choices.map((value) => ({
    value,
    count: readable.filter((app) => themeCategory(app, metric) === value).length,
    total: readable.length,
  }));
}

export function presetThemeRows(apps: AppConfiguration[]) {
  const counts = new Map<string, number>();
  for (const app of apps) {
    if (app.values === null) continue;
    const theme = savedTheme(app);
    if (theme?.applyPresetTheme !== true) continue;
    if (typeof theme.preset !== "string" || !theme.preset.trim()) continue;
    const preset = theme.preset;
    counts.set(preset, (counts.get(preset) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b))
    .map(([value, count]) => ({ value, count }));
}

const LOGO_FIELDS = [
  ["logo", "Logo"], ["logoSource", "Source"], ["logoUrl", "URL"],
  ["logoAltText", "Alt text"], ["logoLink", "Link"],
  ["logoScale", "Scale"], ["logoAspectRatio", "Aspect ratio"],
] as const;

export function logoOptions(theme: Record<string, unknown>): [string, string][] {
  return LOGO_FIELDS.map(([key, label]) => {
    const value = theme[key];
    return [label, value === undefined ? "Not saved" : JSON.stringify(value)];
  });
}

function table(captionText: string, headings: string[]): { table: HTMLTableElement; body: HTMLTableSectionElement } {
  const table = document.createElement("table");
  const caption = document.createElement("caption");
  caption.textContent = captionText;
  const head = document.createElement("thead");
  const row = document.createElement("tr");
  for (const heading of headings) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = heading;
    row.append(cell);
  }
  head.append(row);
  const body = document.createElement("tbody");
  table.append(caption, head, body);
  return { table, body };
}

function addRow(body: HTMLTableSectionElement, values: (string | HTMLElement)[]): void {
  const row = document.createElement("tr");
  values.forEach((value, index) => {
    const cell = document.createElement(index === 0 ? "th" : "td");
    if (index === 0) cell.scope = "row";
    if (typeof value === "string") cell.textContent = value;
    else cell.append(value);
    row.append(cell);
  });
  body.append(row);
}

export function renderTheming(
  host: HTMLElement,
  apps: AppConfiguration[],
  appLink: (item: AppItem, text: string) => HTMLElement,
): void {
  const readable = apps.filter((app) => app.values !== null);
  const summary = document.createElement("p");
  summary.className = "chart-summary";
  summary.textContent = `${readable.length.toLocaleString()} readable apps across all templates. Counts reflect saved theme and customTheme settings, not inferred defaults or runtime appearance. Missing/unrecognized values and unreadable configurations are excluded from each metric. Percentages use only recognized saved values for that metric.`;
  host.append(summary);
  for (const metric of THEME_METRICS) {
    const heading = document.createElement("h2");
    heading.textContent = metric.label;
    const denominator = metric.key === "theme" ? "apps with saved light/dark mode" : "apps with recognized saved values";
    const data = table(metric.label, ["Saved value", "Apps", `% of ${denominator}`]);
    for (const row of aggregateTheme(apps, metric)) {
      const details = document.createElement("details");
      const toggle = document.createElement("summary");
      toggle.textContent = `${row.count.toLocaleString()} apps`;
      details.append(toggle);
      details.addEventListener("toggle", () => {
        if (!details.open || details.querySelector("ul")) return;
        const list = document.createElement("ul");
        list.className = "enabled-app-list";
        for (const app of readable) {
          if (themeCategory(app, metric) !== row.value) continue;
          const entry = document.createElement("li");
          entry.append(appLink(app.item, app.item.id), ` (${templateLabel(app.item.template)})`);
          list.append(entry);
        }
        details.append(list);
      });
      const share = document.createElement("div");
      share.className = "theme-share";
      const meter = document.createElement("meter");
      meter.min = 0;
      meter.max = Math.max(1, row.total);
      meter.value = row.count;
      meter.setAttribute("aria-label", `${metric.label}: ${row.value}, ${row.count} of ${row.total} ${denominator}`);
      share.append(meter, `${(row.total ? row.count / row.total * 100 : 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`);
      addRow(data.body, [row.value, row.count ? details : "0", share]);
    }
    host.append(heading, data.table);
  }
  const presets = table("Applied preset names", ["Preset", "Apps"]);
  const presetsSummary = document.createElement("p");
  presetsSummary.className = "chart-summary";
  presetsSummary.textContent = "Preset names include only apps with applyPresetTheme explicitly true and a non-empty saved preset name; saving a preset name alone does not mean it was applied.";
  for (const row of presetThemeRows(apps)) addRow(presets.body, [row.value, row.count.toLocaleString()]);
  if (!presets.body.children.length) addRow(presets.body, ["No applied presets", "0"]);
  host.append(presetsSummary, presets.table);
  const logos = table("Configured logo options", ["App", "Template", ...LOGO_FIELDS.map(([, label]) => label)]);
  for (const app of readable) {
    const theme = savedTheme(app);
    if (!theme || !hasThemeLogo(theme)) continue;
    addRow(logos.body, [appLink(app.item, app.item.id), templateLabel(app.item.template),
      ...logoOptions(theme).map(([, value]) => value)]);
  }
  const details = document.createElement("details");
  details.className = "chart-data theme-logo-data";
  const toggle = document.createElement("summary");
  toggle.textContent = `View logo options (${logos.body.children.length.toLocaleString()} apps)`;
  details.append(toggle, logos.table);
  host.append(details);
}
