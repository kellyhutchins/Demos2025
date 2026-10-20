import type { ChartRow, FeatureKey } from "./report";

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

export function renderChart(host: HTMLElement, rows: ChartRow[], feature: FeatureKey, label: string): void {
  const left = 154;
  const top = 18;
  const plotWidth = 340;
  const rowHeight = 21;
  const plotHeight = rows.length * rowHeight;
  const maximum = Math.max(1, ...rows.map((row) => row.count));
  const roughStep = maximum / 7;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = Math.max(1, [1, 2, 5, 10].find((value) => value * magnitude >= roughStep)! * magnitude);
  const upper = Math.ceil(maximum / step) * step;
  const titleId = `chart-title-${feature}`;
  const descriptionId = `chart-description-${feature}`;
  const svg = svgElement("svg", {
    viewBox: `0 0 550 ${plotHeight + 90}`,
    role: "img",
    "aria-labelledby": `${titleId} ${descriptionId}`,
  });
  svg.append(
    svgElement("title", { id: titleId }, `${label} enabled by template`),
    svgElement("desc", { id: descriptionId },
      rows.map((row) => `${row.template}: ${row.count} of ${row.total} readable apps`).join(". ")),
  );
  rows.forEach((row, index) => {
    const y = top + index * rowHeight;
    svg.append(
      svgElement("text", { x: left - 12, y: y + 4, "text-anchor": "end" }, row.template),
      svgElement("line", { x1: left, x2: left + plotWidth, y1: y, y2: y, class: "chart-guide" }),
    );
    if (row.count > 0) {
      const bar = svgElement("rect", {
        x: left, y: y - 7, width: (row.count / upper) * plotWidth, height: 14, class: "chart-bar",
      });
      bar.append(svgElement("title", {}, `${row.template}: ${row.count} of ${row.total} apps`));
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
  }, `${feature} count`));
  host.replaceChildren(svg);
}
