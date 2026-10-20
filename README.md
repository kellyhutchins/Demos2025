# Demos2025

ArcGIS demos and reporting tools. The root [index.html](index.html) links to:

- [Instant Apps: Config Stats](instant-apps-stats/)
- [Template Details](template-details/)
- [Template Details (4.x)](template-details-4/)
- [iNaturalist Observations](speed-geeking/)

## GitHub Pages

In the repository's **Settings > Pages > Build and deployment**, set **Source**
to **GitHub Actions**. Push these changes to `main`; the
[Pages workflow](.github/workflows/pages.yml) builds Instant Apps Stats and
publishes it alongside the existing static apps. You can also run **Deploy
GitHub Pages** manually from the **Actions** tab after the workflow is pushed.

The site is served at <https://kellyhutchins.github.io/Demos2025/>, and Instant
Apps Stats at <https://kellyhutchins.github.io/Demos2025/instant-apps-stats/>.
Existing app URLs remain unchanged, including `map.html` and `embed.html`.

Unlike the static demos, Instant Apps Stats uses TypeScript and Vite: its source
HTML cannot be served directly by GitHub Pages. The workflow publishes its
generated `dist/` files and sets the asset base path from the Pages configuration
so JavaScript, styles, and Calcite assets load from the app's subfolder.
Generated files and dependencies do not need to be committed.