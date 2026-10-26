import type { ChartRow, ChoiceChartRow, FeatureDefinition } from "./report";
import { templateLabel } from "./report";

const SVG_NS = "http://www.w3.org/2000/svg";

function svgElement<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string | number>,
  text?: string,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}

export function renderChart(host: HTMLElement, rows: ChartRow[], feature: FeatureDefinition): void {
  const state = feature.type === "choice" ? "modified" : "enabled";
  renderBars(host, rows.map((row) => ({ ...row, label: templateLabel(row.template) })),
    feature.key, `${feature.label} ${state} by template`, `${feature.key} ${state} count`);
}

export function renderChoiceChart(host: HTMLElement, rows: ChoiceChartRow[], feature: FeatureDefinition): void {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const titleId = `chart-title-${feature.key}-distribution`;
  const descriptionId = `chart-description-${feature.key}-distribution`;
  const svg = svgElement("svg", {
    viewBox: `0 0 586 ${235 + rows.length * 30}`,
    role: "img",
    "aria-labelledby": `${titleId} ${descriptionId}`,
  });
  const percentage = (count: number): string =>
    `${(total === 0 ? 0 : count / total * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  svg.append(
    svgElement("title", { id: titleId }, `${feature.label}: saved-value distribution`),
    svgElement("desc", { id: descriptionId },
      `${rows.map((row) => `${row.value}: ${row.count} apps (${percentage(row.count)})`).join(". ")}. Percentages include only recognized saved choices; missing or unrecognized choices are excluded.`),
    svgElement("circle", { cx: 293, cy: 105, r: 72, class: "donut-track" }),
  );
  let offset = 0;
  rows.forEach((row, index) => {
    const share = total === 0 ? 0 : row.count / total * 100;
    const colorClass = index % 2 === 0 ? "donut-primary" : "donut-secondary";
    if (share > 0) {
      const segment = svgElement("circle", {
        cx: 293, cy: 105, r: 72, pathLength: 100,
        "stroke-dasharray": `${share} ${100 - share}`,
        "stroke-dashoffset": -offset,
        transform: "rotate(-90 293 105)",
        class: `donut-segment ${colorClass}`,
      });
      segment.append(svgElement("title", {}, `${row.value}: ${row.count.toLocaleString()} apps (${percentage(row.count)})`));
      svg.append(segment);
    }
    offset += share;
    const label = feature.type === "choice" && row.value === feature.defaultValue
      ? `${row.value} (default)` : row.value;
    const y = 235 + index * 30;
    svg.append(
      svgElement("rect", { x: 100, y: y - 11, width: 12, height: 12, class: `donut-key ${colorClass}` }),
      svgElement("text", { x: 122, y }, label),
      svgElement("text", { x: 486, y, "text-anchor": "end" },
        `${row.count.toLocaleString()} (${percentage(row.count)})`),
    );
  });
  svg.append(
    svgElement("text", { x: 293, y: 101, "text-anchor": "middle", class: "donut-total" }, total.toLocaleString()),
    svgElement("text", { x: 293, y: 124, "text-anchor": "middle" }, total === 0 ? "No saved choices" : "saved choices"),
  );
  host.replaceChildren(svg);
}

function renderBars(
  host: HTMLElement,
  rows: { label: string; count: number; total: number }[],
  id: string,
  title: string,
  axisLabel: string,
): void {
  const left = 190;
  const top = 18;
  const plotWidth = 340;
  const rowHeight = 21;
  const plotHeight = rows.length * rowHeight;
  const maximum = Math.max(1, ...rows.map((row) => row.count));
  const roughStep = maximum / 7;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = Math.max(1, [1, 2, 5, 10].find((value) => value * magnitude >= roughStep)! * magnitude);
  const upper = Math.ceil(maximum / step) * step;
  const titleId = `chart-title-${id}`;
  const descriptionId = `chart-description-${id}`;
  const svg = svgElement("svg", {
    viewBox: `0 0 586 ${plotHeight + 90}`,
    role: "img",
    "aria-labelledby": `${titleId} ${descriptionId}`,
  });
  svg.append(
    svgElement("title", { id: titleId }, title),
    svgElement("desc", { id: descriptionId },
      rows.map((row) => `${row.label}: ${row.count} of ${row.total} readable apps`).join(". ")),
  );
  rows.forEach((row, index) => {
    const y = top + index * rowHeight;
    svg.append(
      svgElement("text", { x: left - 12, y: y + 4, "text-anchor": "end" }, row.label),
      svgElement("line", { x1: left, x2: left + plotWidth, y1: y, y2: y, class: "chart-guide" }),
    );
    if (row.count > 0) {
      const bar = svgElement("rect", {
        x: left, y: y - 7, width: (row.count / upper) * plotWidth, height: 14, class: "chart-bar",
      });
      bar.append(svgElement("title", {}, `${row.label}: ${row.count} of ${row.total} apps`));
      svg.append(
        bar,
        svgElement("text", {
          x: left + (row.count / upper) * plotWidth + 6, y: y + 4, class: "chart-value",
        }, String(row.count)),
      );
    }
  });
  const axisY = top + plotHeight;
  for (let tick = 0; tick <= upper; tick += step) {
    const x = left + (tick / upper) * plotWidth;
    svg.append(
      svgElement("line", { x1: x, x2: x, y1: axisY, y2: axisY + 7, class: "chart-tick" }),
      svgElement("text", { x, y: axisY + 28, "text-anchor": "middle" }, String(tick)),
    );
  }
  svg.append(svgElement("text", {
    x: left + plotWidth / 2, y: axisY + 56, "text-anchor": "middle",
  }, axisLabel));
  host.replaceChildren(svg);
}
