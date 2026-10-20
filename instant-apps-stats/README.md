# Instant Apps: Config Stats

A TypeScript recreation of the [Instant Apps configuration report](https://instant-apps-config-stats-report.netlify.app/), built with Vite and Esri Calcite Components.

## Getting started

Requires Node.js 22.12+ (or 24+) and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The app automatically runs a report for the last seven days. Choose a different creation-date range and select **Run Report** to refresh. Use **Chart Options** to compare configuration settings without fetching the data again.

The Calcite multi-select combobox filters options as you type. Select multiple features to create a labeled Calcite chart tab for each; each tab includes its own totals and chart-data table. Removing a feature removes its tab, and clearing the selection displays a prompt. Selections persist when running a new report, and changing selections does not refetch data.

Under **View chart data**, expand a template's **Enabled** count to see links only to apps with that tab's feature explicitly enabled, including those beyond the visible result cards. The list uses the same primary/alternate-key rules as the chart; disabled, missing, and unreadable settings are excluded. **Readable apps** remains the total number of readable configurations, not a list of matches. Links open in a new tab.

```sh
npm test
npm run build
npm run preview
```

Deploy the generated `dist/` directory to any static host. Calcite icons, translations, and fonts are copied locally before development and production builds; no Calcite CDN is required.

## Report behavior

- Queries the same public [TemplateAppMining dataset](https://services.arcgis.com/V6ZHFr6zdgNZuVG0/arcgis/rest/services/TemplateAppMining_1/FeatureServer/0) as the original report, using `Url like '%/instant/%'` and `CreatedTime`. This is not the ArcGIS item keyword search, which omits many apps in the mining dataset. No login, client ID, access token, or backend is required.
- Intentionally preserves the original report's **displayed-date behavior**: each selected calendar date becomes midnight UTC on the following date, with inclusive start and end endpoints. For example, displayed October 5–6, 2026 queries October 6 at 00:00 UTC through October 7 at 00:00 UTC, matching the original's 280 records. This is not a full-day local-calendar range. A same-date range matches only the corresponding UTC instant.
- Retrieves all matching mining record IDs, then fetches records in batches of 100 (keeping request URLs within the service's length limit) and checks that every requested record was returned. There is no 10,000-record search cap. Separate mining records are retained even if they reference the same app, matching the original report.
- Reads item configurations with up to eight concurrent requests. Requests time out after 30 seconds; reports can be canceled.
- Reads settings from each item's `values` object. Only explicitly stored boolean `true` values count as enabled. A feature's primary key or either of its template-specific alternate keys can enable it, even when another key is explicitly `false`. Each app counts once per feature. Defaults supplied by individual app templates are **not inferred**, so these are saved-configuration counts, not guaranteed runtime-feature counts.
- Preserves zero-count templates, identifies templates from app URLs or item keywords, and includes unrecognized templates as `unknown`.
- Lists unreadable configurations with their errors and excludes them from the chart denominator, but retains them in the result count. The mining dataset can contain items that are no longer publicly readable; partial configuration reports are clearly labeled.
- Displays `TemplateOwner` as **Template owner**, matching the original dataset's owner field. The mining dataset does not supply the app's current title or owner.
- Displays result cards in batches of 50; **Show more apps** reveals additional cards without changing chart totals.
- Provides an accessible chart-data table and a responsive stacked layout on narrow screens.

Network access to `https://services.arcgis.com` and `https://www.arcgis.com` is required. Counts reflect the mining dataset and can change as it is updated. Configuration charts use currently readable public item data; the original signed-in app may have access to additional configurations.

## Alternate configuration keys

Define alternate keys on the feature in `FEATURES` in [src/report.ts](src/report.ts). Each template can have one or two alternate keys, in addition to the primary key:

```ts
{
  key: "legend",
  label: "Legend",
  altKeys: {
    sidebar: ["legendPanel"],
  },
}
```

Sidebar Legend now counts `legend === true` **or** `legendPanel === true`. Other templates still use `legend` unless given their own mapping. To support a second alternate key, add a second string to that template's array. TypeScript rejects more than two alternate keys per template. Only confirmed mappings are configured; other aliases are not guessed.
