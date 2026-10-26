import { setAssetPath } from "@esri/calcite-components";
import "@esri/calcite-components/components/calcite-shell";
import "@esri/calcite-components/components/calcite-shell-panel";
import "@esri/calcite-components/components/calcite-panel";
import "@esri/calcite-components/components/calcite-block";
import "@esri/calcite-components/components/calcite-button";
import "@esri/calcite-components/components/calcite-input-date-picker";
import "@esri/calcite-components/components/calcite-combobox";
import "@esri/calcite-components/components/calcite-combobox-item";
import "@esri/calcite-components/components/calcite-tabs";
import "@esri/calcite-components/components/calcite-tab-nav";
import "@esri/calcite-components/components/calcite-tab-title";
import "@esri/calcite-components/components/calcite-tab";
import "@esri/calcite-components/components/calcite-notice";
import "@esri/calcite-components/components/calcite-loader";
import "@esri/calcite-components/components/calcite-link";
import "@esri/calcite-components/calcite/calcite.css";
import "./style.css";
import { errorMessage, loadConfigurations, searchApps } from "./arcgis";
import { renderChart, renderChoiceChart } from "./chart";
import { aggregate, aggregateChoices, FEATURES, formatDate, getFeatureChoice, matchesFeature, queryTemplateForFeatures, templateLabel } from "./report";
import type { AppConfiguration, AppItem, FeatureDefinition, FeatureKey } from "./report";

setAssetPath(`${import.meta.env.BASE_URL}calcite/`);

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <calcite-shell>
    <div id="app-layout">
    <calcite-shell-panel position="start" display-mode="dock" id="sidebar">
      <calcite-panel heading="Instant Apps: Config Stats" id="options-panel">
        <calcite-block heading="Run options" collapsible expanded>
          <form id="report-form">
            <calcite-input-date-picker id="date-range" range
              aria-label="App creation date range" overlay-positioning="fixed">
            </calcite-input-date-picker>
            <calcite-button id="run-report" type="submit" width="full">Run Report</calcite-button>
            <calcite-button id="cancel-report" appearance="outline" width="full" hidden>
              Cancel report
            </calcite-button>
          </form>
          <p class="help">Instant Apps from the original TemplateAppMining dataset.
            Dates use the original report's UTC offset behavior.</p>
          <div id="progress" role="status" aria-live="polite" hidden>
            <calcite-loader inline scale="s" label="Loading report"></calcite-loader>
            <span id="progress-text"></span>
          </div>
          <calcite-notice id="report-notice" width="full" icon closable>
            <div slot="title" id="notice-title"></div>
            <div slot="message" id="notice-message"></div>
          </calcite-notice>
        </calcite-block>
        <calcite-block heading="Chart Options" collapsible expanded>
          <div class="chart-question">
            How many apps have
            <calcite-combobox id="feature-selector" overlay-positioning="fixed"
              selection-mode="multiple" label="Configuration options"
              placeholder="Filter configuration options" max-items="8">
                ${FEATURES.map((feature) => `
                  <calcite-combobox-item value="${feature.key}" text-label="${feature.label}">
                  </calcite-combobox-item>`).join("")}
            </calcite-combobox>
            enabled or modified?
          </div>
          <p class="help">Counts explicitly saved <code>true</code> settings, including
            template-specific alternate keys. Each app counts once per feature.
            Nearby Search Method counts only Nearby apps saving <code>search-radius</code>
            instead of the <code>search-extent</code> default.
            Select only Nearby Search Method before running to fetch only Nearby apps.
            Mixed selections fetch all templates.
            Missing settings and unreadable configurations are not counted as matches.</p>
        </calcite-block>
        <calcite-block heading="Results" collapsible expanded>
          <p id="result-summary" aria-live="polite">Run a report to find Instant Apps.</p>
          <div id="results" aria-label="Matching apps" tabindex="0"></div>
          <calcite-button id="show-more" appearance="outline" width="full" hidden>
            Show more apps
          </calcite-button>
        </calcite-block>
  
      </calcite-panel>
    </calcite-shell-panel>
    <calcite-panel heading="Stats" id="stats-panel">
      <main id="stats-content" aria-label="Configuration statistics">
        <div id="empty-state">
          <h1>Instant Apps configuration usage</h1>
          <p>Choose a start and end date, then select Run Report to see enabled or modified options by app template.</p>
        </div>
        <p id="selection-empty" role="status" hidden>Select one or more configuration options to view charts.</p>
        <calcite-tabs id="chart-tabs" hidden></calcite-tabs>
      </main>
    </calcite-panel>
    </div>
  </calcite-shell>
`;

function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing app element: ${selector}`);
  return found;
}

const datePicker = document.querySelector("calcite-input-date-picker")!;
const runButton = element<HTMLElementTagNameMap["calcite-button"]>("#run-report");
const cancelButton = element("#cancel-report");
const notice = document.querySelector("calcite-notice")!;
const featureSelector = document.querySelector("calcite-combobox")!;
const progress = element("#progress");
const progressText = element("#progress-text");
const resultSummary = element("#result-summary");
const results = element("#results");
const showMore = element("#show-more");
const emptyState = element("#empty-state");
const chartTabs = element<HTMLElementTagNameMap["calcite-tabs"]>("#chart-tabs");
const selectionEmpty = element("#selection-empty");

let selectedFeatures: FeatureKey[] = [];
let activeFeature: FeatureKey | undefined ;
let reportReady = false;
let configurations: AppConfiguration[] = [];
let reportTemplate: "nearby" | undefined;
let renderedCount = 0;
let controller: AbortController | undefined;

function showNotice(title: string, message: string, kind: "danger" | "warning" | "info"): void {
  notice.kind = kind;
  element("#notice-title").textContent = title;
  element("#notice-message").textContent = message;
  notice.open = true;
}

function appLink(item: AppItem, text: string): HTMLElementTagNameMap["calcite-link"] {
  const link = document.createElement("calcite-link");
  link.href = item.template === "unknown"
    ? `https://www.arcgis.com/home/item.html?id=${item.id}`
    : `https://www.arcgis.com/apps/instant/${item.template}/index.html?appid=${item.id}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = text;
  return link;
}

function renderMoreResults(): void {
  const batch = configurations.slice(renderedCount, renderedCount + 50);
  const fragment = document.createDocumentFragment();
  for (const { item, error } of batch) {
    const card = document.createElement("article");
    card.className = "app-card";
    const heading = document.createElement("h3");
    heading.textContent = item.id;
    heading.title = item.title;
    const title = document.createElement("p");
    title.className = "app-title";
    title.textContent = item.title === item.id ? "" : item.title;
    title.hidden = item.title === item.id;
    const metadata = document.createElement("div");
    metadata.className = "app-metadata";
    for (const [label, value] of [
      ["Template", item.template === "unknown" ? "unknown" : `instant/${item.template}`],
      ["Template owner", item.owner],
    ]) {
      const entry = document.createElement("p");
      const strong = document.createElement("strong");
      strong.textContent = `${label}: `;
      entry.append(strong, document.createTextNode(value));
      metadata.append(entry);
    }
    const link = appLink(item, item.template === "unknown" ? "Open item" : "Open app");
    card.append(heading, title, metadata, link);
    if (error) {
      const warning = document.createElement("p");
      warning.className = "item-warning";
      warning.textContent = `Excluded from chart: ${error}`;
      card.append(warning);
    }
    fragment.append(card);
  }
  results.append(fragment);
  renderedCount += batch.length;
  showMore.hidden = renderedCount >= configurations.length;
  showMore.textContent = `Show more apps (${renderedCount.toLocaleString()} of ${configurations.length.toLocaleString()})`;
}

function updateCharts(): void {
  if (reportReady) {
    const needsBroaderData = reportTemplate === "nearby" &&
      selectedFeatures.some((key) => key !== "enableBufferSearch");
    emptyState.hidden = !needsBroaderData;
    if (needsBroaderData) {
      chartTabs.hidden = true;
      selectionEmpty.hidden = true;
      emptyState.querySelector("p")!.textContent =
        "This report contains only Nearby apps. Select Run Report again to fetch all templates for your selected options.";
      return;
    }
  }
  chartTabs.hidden = !reportReady || selectedFeatures.length === 0;
  selectionEmpty.hidden = !reportReady || selectedFeatures.length > 0;
  if (!reportReady) return;
  const currentTab = chartTabs.querySelector<HTMLElementTagNameMap["calcite-tab-title"]>("calcite-tab-title[selected]");
  activeFeature = FEATURES.find((feature) => feature.key === currentTab?.tab)?.key ?? activeFeature;
  if (!activeFeature || !selectedFeatures.includes(activeFeature)) {
    activeFeature = selectedFeatures[0];
  }
  const fragment = document.createDocumentFragment();
  const nav = document.createElement("calcite-tab-nav");
  nav.slot = "title-group";
  nav.setAttribute("aria-label", "Selected configuration charts");
  fragment.append(nav);
  for (const key of selectedFeatures) {
    const feature: FeatureDefinition = FEATURES.find((entry) => entry.key === key)!;
    const state = feature.type === "choice" ? "modified" : "enabled";
    const title = document.createElement("calcite-tab-title");
    title.textContent = feature.label;
    title.tab = key;
    title.selected = key === activeFeature;
    nav.append(title);
    const panel = document.createElement("calcite-tab");
    panel.tab = key;
    panel.selected = key === activeFeature;
    const content = document.createElement("section");
    content.className = "feature-chart";
    content.dataset.feature = key;
    const chartSummary = document.createElement("p");
    chartSummary.className = "chart-summary";
    const details = document.createElement("details");
    details.className = "chart-data";
    const summary = document.createElement("summary");
    summary.textContent = "View chart data";
    const table = document.createElement("table");
    const caption = document.createElement("caption");
    caption.textContent = `${feature.label} by template`;
    const head = document.createElement("thead");
    head.innerHTML = `<tr><th scope="col">Template</th><th scope="col">${feature.type === "choice" ? "Modified" : "Enabled"}</th><th scope="col">Readable apps</th></tr>`;
    const chartRows = document.createElement("tbody");
    table.append(caption, head, chartRows);
    details.append(summary, table);
    panel.append(content);
    fragment.append(panel);
    const rows = aggregate(configurations, key);
    const enabled = rows.reduce((sum, row) => sum + row.count, 0);
    const readable = rows.reduce((sum, row) => sum + row.total, 0);
    chartSummary.textContent = feature.type === "choice"
      ? `${enabled.toLocaleString()} of ${readable.toLocaleString()} readable ${templateLabel(feature.template)} apps have ${feature.label} modified from the ${feature.defaultValue} default. Only recognized, explicitly saved non-default values count.`
      : `${enabled.toLocaleString()} of ${readable.toLocaleString()} readable apps have ${feature.label} explicitly enabled.`;
    for (const row of rows) {
      const tr = document.createElement("tr");
      const name = document.createElement("th");
      name.scope = "row";
      name.textContent = templateLabel(row.template);
      tr.append(name);
      const enabledCell = document.createElement("td");
      enabledCell.className = "enabled-apps";
      const appsCell = document.createElement("td");
      appsCell.textContent = row.total.toLocaleString();
      if (row.count === 0) {
        enabledCell.textContent = "0";
      } else {
        const appDetails = document.createElement("details");
        const appSummary = document.createElement("summary");
        appSummary.textContent = `${row.count.toLocaleString()} apps`;
        appSummary.setAttribute("aria-label", `View ${row.count.toLocaleString()} ${templateLabel(row.template)} apps with ${feature.label} ${state}`);
        appDetails.append(appSummary);
        appDetails.addEventListener("toggle", () => {
          if (!appDetails.open || appDetails.querySelector("ul")) return;
          const list = document.createElement("ul");
          list.className = "enabled-app-list";
          for (const app of configurations) {
            if (app.values === null || app.item.template !== row.template ||
              !matchesFeature(app.values, row.template, feature)) continue;
            const entry = document.createElement("li");
            const status = document.createElement("span");
            status.className = "feature-status";
            status.textContent = feature.type === "choice"
              ? `${feature.label}: ${getFeatureChoice(app.values, feature)} (modified)`
              : `${feature.label} enabled`;
            entry.append(appLink(app.item, app.item.id), status);
            list.append(entry);
          }
          appDetails.append(list);
        });
        enabledCell.append(appDetails);
      }
      tr.append(enabledCell, appsCell);
      chartRows.append(tr);
    }
    if (feature.type === "choice") {
      const choiceRows = aggregateChoices(configurations, feature);
      const distributionHeading = document.createElement("h2");
      distributionHeading.textContent = "Saved search-mode distribution";
      const distributionChart = document.createElement("div");
      distributionChart.className = "chart";
      renderChoiceChart(distributionChart, choiceRows, feature);
      const distributionSummary = document.createElement("p");
      distributionSummary.className = "chart-summary";
      const recognized = choiceRows.reduce((sum, row) => sum + row.count, 0);
      distributionSummary.textContent = `${recognized.toLocaleString()} of ${readable.toLocaleString()} readable ${templateLabel(feature.template)} apps explicitly save a recognized search mode. Donut percentages use only these recognized saved choices. ${(readable - recognized).toLocaleString()} have a missing or unrecognized choice and are not shown as either mode. Missing values are not inferred as the default.`;
      const distributionDetails = document.createElement("details");
      distributionDetails.className = "chart-data";
      const distributionToggle = document.createElement("summary");
      distributionToggle.textContent = "View distribution data";
      const distributionTable = document.createElement("table");
      const distributionCaption = document.createElement("caption");
      distributionCaption.textContent = `${feature.label}: explicitly saved choices`;
      const distributionHead = document.createElement("thead");
      distributionHead.innerHTML = '<tr><th scope="col">Saved search mode</th><th scope="col">Apps</th><th scope="col">Readable apps</th></tr>';
      const distributionBody = document.createElement("tbody");
      for (const row of choiceRows) {
        const tr = document.createElement("tr");
        const name = document.createElement("th");
        name.scope = "row";
        name.textContent = row.value === feature.defaultValue ? `${row.value} (default)` : row.value;
        const count = document.createElement("td");
        count.textContent = row.count.toLocaleString();
        const total = document.createElement("td");
        total.textContent = row.total.toLocaleString();
        tr.append(name, count, total);
        distributionBody.append(tr);
      }
      distributionTable.append(distributionCaption, distributionHead, distributionBody);
      distributionDetails.append(distributionToggle, distributionTable);
      content.append(distributionHeading, distributionChart, distributionSummary, distributionDetails, chartSummary, details);
    } else {
      const chart = document.createElement("div");
      chart.className = "chart";
      renderChart(chart, rows, feature);
      content.append(chart, chartSummary, details);
    }
  }
  chartTabs.replaceChildren(fragment);
}

async function runReport(): Promise<void> {
  if (controller) return;
  const dates = datePicker.value;
  if (!Array.isArray(dates) || !dates[0] || !dates[1]) {
    showNotice("Choose a date range", "Both a start date and an end date are required.", "danger");
    return;
  }
  const range = { start: dates[0], end: dates[1] };
  const template = queryTemplateForFeatures(selectedFeatures);
  const appScope = template === "nearby" ? "Nearby apps" : "Instant Apps";
  const current = new AbortController();
  controller = current;
  runButton.loading = true;
  runButton.disabled = true;
  datePicker.disabled = true;
  featureSelector.disabled = true;
  cancelButton.hidden = false;
  progress.hidden = false;
  progressText.textContent = `Finding ${appScope} in the mining dataset...`;
  notice.open = false;
  configurations = [];
  renderedCount = 0;
  results.replaceChildren();
  showMore.hidden = true;
  reportReady = false;
  chartTabs.hidden = true;
  chartTabs.replaceChildren();
  selectionEmpty.hidden = true;
  emptyState.hidden = false;
  emptyState.querySelector("p")!.textContent = "Your report is loading. Larger date ranges may take a little longer.";
  resultSummary.textContent = "Searching the mining dataset...";
  try {
    const search = await searchApps(range, current.signal, (count, total) => {
      progressText.textContent = `Found ${count.toLocaleString()} of ${total.toLocaleString()} apps...`;
    }, template);
    progressText.textContent = `Reading 0 of ${search.items.length.toLocaleString()} configurations...`;
    configurations = await loadConfigurations(search.items, current.signal, (completed) => {
      progressText.textContent = `Reading ${completed.toLocaleString()} of ${search.items.length.toLocaleString()} configurations...`;
    });
    current.signal.throwIfAborted();
    reportTemplate = template;
    const failures = configurations.filter((app) => app.values === null).length;
    resultSummary.textContent = `${configurations.length.toLocaleString()} ${template === "nearby" ? "Nearby app results" : "results"} returned for the selected date range of ${formatDate(range.start)} to ${formatDate(range.end)}.`;
    const warnings: string[] = [];
    if (failures > 0) {
      warnings.push(`${failures.toLocaleString()} app configuration(s) could not be read and are excluded from chart counts. Details are shown on the affected app cards.`);
    }
    if (warnings.length > 0) showNotice("Report is incomplete", warnings.join(" "), "warning");
    renderMoreResults();
    reportReady = true;
    emptyState.hidden = true;
    updateCharts();
    if (configurations.length === 0) {
      showNotice("No matching apps", `No ${appScope} were found in the mining dataset for this date range. Try a wider date range.`, "info");
    }
  } catch (error) {
    configurations = [];
    emptyState.querySelector("p")!.textContent = "Choose a date range and run the report again.";
    if (current.signal.aborted) {
      resultSummary.textContent = "Report canceled. No partial results are displayed.";
      showNotice("Report canceled", "You can change the dates and run a new report.", "info");
    } else {
      console.error("Unable to run report:", error);
      resultSummary.textContent = "The report could not be completed.";
      showNotice("Unable to run report", errorMessage(error), "danger");
    }
  } finally {
    controller = undefined;
    runButton.loading = false;
    runButton.disabled = false;
    datePicker.disabled = false;
    featureSelector.disabled = false;
    cancelButton.hidden = true;
    progress.hidden = true;
  }
}

element<HTMLFormElement>("#report-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void runReport();
});
cancelButton.addEventListener("click", () => controller?.abort());
showMore.addEventListener("click", renderMoreResults);
featureSelector.addEventListener("calciteComboboxChange", () => {
  const keys = new Set(featureSelector.selectedItems.map((item) => item.value));
  selectedFeatures = FEATURES.filter((feature) => keys.has(feature.key)).map((feature) => feature.key);
  updateCharts();
});
