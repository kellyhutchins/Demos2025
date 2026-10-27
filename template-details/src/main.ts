import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import "@esri/calcite-components/components/calcite-button";
import "@esri/calcite-components/components/calcite-label";
import "@esri/calcite-components/components/calcite-loader";
import "@esri/calcite-components/components/calcite-notice";
import "@esri/calcite-components/components/calcite-option";
import "@esri/calcite-components/components/calcite-select";
import "@esri/calcite-components/components/calcite-block";
import "@esri/calcite-components/components/calcite-panel";
import "@esri/calcite-components/main.css";
import "../css/styles.css";

const templates = [
  { id: "instant/3dviewer", label: "3D Viewer" },
  { id: "instant/atlas", label: "Atlas" },
  { id: "instant/attachmentviewer", label: "Attachment Viewer" },
  { id: "instant/basic", label: "Basic" },
  { id: "instant/charts", label: "Chart Viewer" },
  { id: "instant/compare", label: "Compare" },
  { id: "instant/countdown", label: "Countdown" },
  { id: "instant/dataexplorer", label: "Data Explorer" },
  { id: "instant/exhibit", label: "Exhibit" },
  { id: "instant/gallery", label: "Gallery" },
  { id: "instant/imageryviewer", label: "Imagery Viewer" },
  { id: "instant/indicators", label: "Indicators" },
  { id: "instant/insets", label: "Insets" },
  { id: "instant/interactivelegend", label: "Interactive Legend" },
  { id: "instant/manager", label: "Manager" },
  { id: "instant/nearby", label: "Nearby" },
  { id: "instant/observer", label: "Observer" },
  { id: "instant/portfolio", label: "Portfolio" },
  { id: "instant/notification", label: "Public Notification" },
  { id: "instant/reporter", label: "Reporter" },
  { id: "instant/sidebar", label: "Sidebar" },
  { id: "instant/slider", label: "Slider" },
  { id: "instant/streamflowviewer", label: "Streamflow Viewer" },
  { id: "instant/webeditor", label: "Web Editor" },
  { id: "instant/lookup", label: "Zone Lookup" }
];

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

const select = requiredElement<HTMLCalciteSelectElement>("#templateTypes");
const startInput = requiredElement<HTMLInputElement>("#startDate");
const endInput = requiredElement<HTMLInputElement>("#endDate");
const loader = requiredElement<HTMLCalciteLoaderElement>("#loader");
const notice = requiredElement<HTMLCalciteNoticeElement>("#queryError");
const errorMessage = requiredElement<HTMLDivElement>("#queryErrorMessage");
const countInfo = requiredElement<HTMLParagraphElement>("#templateCountInfo");
const container = requiredElement<HTMLDivElement>("#templateDetailTable");
const table = requiredElement<HTMLTableElement>("table");
const rows = requiredElement<HTMLTableSectionElement>("#templateRows");
const buttons = document.querySelectorAll<HTMLCalciteButtonElement>("calcite-button");

for (const [index, template] of templates.entries()) {
  const option = document.createElement("calcite-option");
  option.value = template.id;
  option.textContent = template.label;
  option.selected = index === 0;
  select.append(option);
}

function localDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const today = new Date();
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);
startInput.value = localDateTime(yesterday);
endInput.value = localDateTime(today);

const templateData = new FeatureLayer({
  url: "https://services.arcgis.com/V6ZHFr6zdgNZuVG0/arcgis/rest/services/TemplateAppMining/FeatureServer/0",
  outFields: ["Url", "Configured", "Account", "TemplateOwner"]
});

function setLoading(loading: boolean): void {
  loader.hidden = !loading;
  container.setAttribute("aria-busy", String(loading));
  select.disabled = loading;
  for (const button of buttons) {
    button.disabled = loading;
  }
}

function showError(message: string): void {
  errorMessage.textContent = message;
  notice.open = true;
}

function configured(value: unknown): boolean {
  if (typeof value === "string") {
    const normalized = value.toLowerCase().trim();
    if (["true", "yes", "1"].includes(normalized)) return true;
    if (["false", "no", "0", ""].includes(normalized)) return false;
  }
  return Boolean(value);
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function applicationCell(value: unknown): HTMLTableCellElement {
  const cell = document.createElement("td");
  const rawUrl = text(value);
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    cell.textContent = rawUrl;
    return cell;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    cell.textContent = rawUrl;
    return cell;
  }
  const link = document.createElement("a");
  link.href = url.href;
  link.textContent = url.host;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  cell.append(link);
  return cell;
}

async function getDataByDates(start: Date, end: Date): Promise<void> {
  notice.open = false;
  countInfo.textContent = "";
  rows.replaceChildren();
  table.hidden = true;
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) {
    showError("Enter valid start and end dates, with the start no later than the end.");
    return;
  }
  const template = templates.find((item) => item.id === select.value);
  if (!template) {
    showError("Select a template before running a query.");
    return;
  }
  setLoading(true);
  try {
    await templateData.load();
    const query = templateData.createQuery();
    query.where = `CreatedTime BETWEEN '${start.getTime()}' AND '${end.getTime()}' AND Type = '${template.id}'`;
    query.returnGeometry = false;
    query.outFields = ["Url", "Configured", "Account", "TemplateOwner"];
    // Fetch IDs first so the service's maximum record count cannot truncate results.
    const objectIds = await templateData.queryObjectIds(query);
    const fragment = document.createDocumentFragment();
    const batchSize = 200;
    for (let offset = 0; offset < objectIds.length; offset += batchSize) {
      const batchQuery = query.clone();
      batchQuery.objectIds = objectIds.slice(offset, offset + batchSize);
      const result = await templateData.queryFeatures(batchQuery);
      for (const feature of result.features) {
        const attributes: Record<string, unknown> = feature.attributes;
        const row = document.createElement("tr");
        row.append(applicationCell(attributes.Url));
        for (const value of [configured(attributes.Configured), attributes.Account, attributes.TemplateOwner]) {
          const cell = document.createElement("td");
          cell.textContent = text(value);
          row.append(cell);
        }
        fragment.append(row);
      }
    }
    rows.append(fragment);
    countInfo.textContent = `${rows.childElementCount} ${template.label} apps created between ${start.toLocaleString()} and ${end.toLocaleString()}`;
    table.hidden = rows.childElementCount === 0;
  } catch (error: unknown) {
    console.error("Template details query failed", error);
    showError(error instanceof Error ? error.message : "The query failed. Check your connection and access to the TemplateAppMining service.");
  } finally {
    setLoading(false);
  }
}

requiredElement<HTMLCalciteButtonElement>("#goDates").addEventListener("click", () => {
  void getDataByDates(new Date(startInput.value), new Date(endInput.value));
});

for (const button of document.querySelectorAll<HTMLCalciteButtonElement>("[data-duration]")) {
  button.addEventListener("click", () => {
    const end = new Date();
    const start = new Date(end);
    switch (button.dataset.duration) {
      case "hour": start.setTime(start.getTime() - 60 * 60 * 1000); break;
      case "day": start.setDate(start.getDate() - 1); break;
      case "week": start.setDate(start.getDate() - 7); break;
      case "month": {
        const day = start.getDate();
        start.setDate(1);
        start.setMonth(start.getMonth() - 1);
        start.setDate(Math.min(day, new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()));
        break;
      }
      case "year": {
        const month = start.getMonth();
        start.setFullYear(start.getFullYear() - 1);
        if (start.getMonth() !== month) start.setDate(0);
        break;
      }
      default:
        showError("Unknown date period.");
        return;
    }
    void getDataByDates(start, end);
  });
}
