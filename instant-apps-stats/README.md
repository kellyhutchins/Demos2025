# Instant Apps: Config Stats

A TypeScript recreation of the [Instant Apps configuration report](https://instant-apps-config-stats-report.netlify.app/), built with Vite and Esri Calcite Components.

## Getting started

Requires Node.js 22.12+ (or 24+) and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The app starts with blank dates and does not fetch report data until you choose both a start and end date and select **Run Report**. Use **Chart Options** to compare configuration settings without fetching the data again.

The Calcite multi-select combobox filters options as you type. Select multiple features to create a labeled Calcite chart tab for each; each tab includes its own totals and chart-data table. Removing a feature removes its tab, and clearing the selection displays a prompt. Selections persist when running a new report, and changing selections does not refetch data.

Under **View chart data**, expand a template's **Enabled** count to see links only to apps with that tab's feature explicitly enabled, including those beyond the visible result cards. The list uses the same primary/alternate-key rules as the chart; disabled, missing, and unreadable settings are excluded. **Readable apps** remains the total number of readable configurations, not a list of matches. Links open in a new tab.

The Stats area scrolls within the selected chart tab, keeping the tabs visible
when chart data or app lists are expanded. On narrow screens, scroll down to
the Stats area, then scroll its chart content independently.

```sh
npm test
npm run build
npm run preview
```

Deploy the generated `dist/` directory to any static host. Calcite icons, translations, and fonts are copied locally before development and production builds; no Calcite CDN is required.

### GitHub Pages

This repository's [Pages workflow](../.github/workflows/pages.yml) builds and
publishes this app at `/Demos2025/instant-apps-stats/`, alongside the static demos.
Select **GitHub Actions** as the Pages source in repository settings; see the
[repository deployment instructions](../README.md#github-pages).

The workflow passes the Pages subfolder as Vite's `--base` option. To reproduce
the project-site build locally:

```sh
npm run build -- --base=/Demos2025/instant-apps-stats/
npm run preview -- --base=/Demos2025/instant-apps-stats/
```

Open `/Demos2025/instant-apps-stats/` on the preview server. Do not publish the
source `index.html` directly: browsers cannot run its TypeScript entry point.

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

## Adding a feature or template (no development tools required)

Both lists are maintained in one file: [src/report.ts](src/report.ts). You can
edit it directly on GitHub without installing Node.js or running commands.

- A **feature** is a configuration option, such as Legend or Search. It appears
  in **Chart Options** and can be selected to create a chart tab.
- A **template** is an Instant Apps app type, such as Sidebar or Minimalist.
  It appears as a row in each chart and its data table.

### Before you edit

1. Open this repository on GitHub, then open **instant-apps-stats > src >
   report.ts**.
2. Select the pencil icon (**Edit this file**). You need permission to edit the
   repository; otherwise, ask a repository maintainer to make or review the change.
3. Find the appropriate list: `export const FEATURES = [` near the top, or
   `export const TEMPLATES = [` below it.

Only edit entries inside these lists. Leave the surrounding `[` and `]`, the
`as const` text, and the rest of the file in place.

### Add a feature

1. Confirm the feature's **saved configuration key**. This is the internal,
   case-sensitive name, not necessarily the label shown in an app's settings.
   Ask the app's maintainer if you do not know it; do not guess from the label.
2. Check that the key is not already in `FEATURES`. If it is, edit that entry
   rather than adding a duplicate.
3. Copy an existing one-line entry and insert the copy immediately below it,
   inside `FEATURES`. Replace its `key` and `label`:

   ```ts
   { key: "yourConfirmedSettingKey", label: "Your Feature Name" },
   ```

   This is a placeholder example: replace both quoted values before saving.
   Keep the quotes, braces, colon, and commas. Each entry should end in a comma;
   if you add after the current last entry, add a comma to that entry too.

4. Use a short, friendly `label`; this is what people see in **Chart Options**
   and on the chart tab. Changing a label does not change how data is counted.
5. If a template stores this feature under a different key, follow
   [Template-specific feature keys](#template-specific-feature-keys-optional)
   below instead of adding a second feature.

**Counting rule:** the saved setting must be the boolean `true` inside the
app's configuration `values` object. `false`, missing settings, the text
`"true"`, and numeric values do not count as enabled. A feature may be enabled
by an app's default behavior but still show zero here if it was not explicitly
saved. Adding a feature does not change any apps or their settings.

### Add a template

1. Open an app made with that template and inspect its URL. The template key is
   the part directly after `/apps/instant/`. For example:

   ```text
   https://www.arcgis.com/apps/instant/sidebar/index.html?appid=...
                                    ^^^^^^^
                                    template key: sidebar
   ```

   Use `sidebar`, not the app ID, full URL, or display name. Keep the path key
   lowercase and spelled exactly as it appears in the URL.
2. Check that the key is not already in `TEMPLATES`.
3. Copy an entry and insert the copy inside `TEMPLATES`, replacing both values:

   ```ts
   { key: "yourtemplatepath", label: "Your Template Name" },
   ```

   This is a placeholder example: replace both quoted values before saving.
   Keep a comma after every entry.
4. Choose a friendly `label`. The path and display name can differ; for example,
   the existing Minimalist entry is:

   ```ts
   { key: "basic", label: "Minimalist" },
   ```

The list order controls the order of the chart rows. Adding a template gives
it a friendly name and a row even when its count is zero. It does **not** change
the report's date or mining-dataset query, add records to that dataset, or
guarantee a nonzero count.

### Template-specific feature keys (optional)

Some templates save the same feature under different configuration names.
Add these names to the existing feature's `altKeys`, using the template's
**path key**, not its friendly label. For example, the existing Legend entry
can be written across several lines:

```ts
{
  key: "legend",
  label: "Legend",
  altKeys: {
    sidebar: ["legendPanel"],
  },
},
```

For Sidebar, this counts either `legend: true` or `legendPanel: true`, but
counts each app only once. Other templates still use `legend`. Each template
can have one or two alternate keys; two use the form
`["firstConfirmedKey", "secondConfirmedKey"]`. If `altKeys` already exists, add
to that block rather than creating a second `altKeys` block. Only add mappings
confirmed by the app's saved configuration or its maintainer.

### Save, publish, and check your change

1. Select **Commit changes** in GitHub and enter a short description, such as
   "Add a template label".
2. Follow your team's review process. If you create a branch or pull request,
   the change will not publish until it is merged into `main`.
3. Once the change reaches `main`, open the repository's **Actions** tab and
   wait for **Deploy GitHub Pages** to finish successfully. GitHub compiles
   and publishes the app automatically; do not edit or upload the generated
   `dist/` files. Pages must use **GitHub Actions** as its source (see
   [GitHub Pages](#github-pages)).
4. Open the [published app](https://kellyhutchins.github.io/Demos2025/instant-apps-stats/)
   and refresh. If you still see the old version, hard-refresh with
   **Cmd+Shift+R** on macOS or **Ctrl+Shift+R** on Windows/Linux.
5. For a new feature, select it in **Chart Options** after the report finishes.
   Confirm its tab and **View chart data** table appear. For a new template,
   check its label in the chart and table, including when the count is zero.
6. To verify counts, use a date range containing a known public app that is in
   the mining dataset and has the setting explicitly saved as `true`. Expand
   the table's **Enabled** count to check the matching app links. A zero count
   alone does not mean the edit failed.

If deployment fails, open the failed run in **Actions** and share its error
with a maintainer. Common editing mistakes are missing commas, missing quotes,
or putting an entry outside its list. Do not change the Pages source back to
branch-based deployment to bypass a failed build.

## Template display labels

Each entry in `TEMPLATES` in [src/report.ts](src/report.ts) has a `key` (the app
URL path used for matching) and a `label` (the friendly chart name). For example,
`{ key: "basic", label: "Minimalist" }` displays **Minimalist** without changing
the `basic` path used for identification, aggregation, alternate keys, or links.
Labels appear on chart axes, tooltips, accessible chart descriptions, and in the
chart-data table. Unrecognized paths retain their path as the display label;
`unknown` displays as **Unknown**.

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
