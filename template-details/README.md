# Template details

This demo uses ArcGIS Maps SDK for JavaScript **4.34.8** (the latest 4.x
release) and Calcite Components **5.2.0**, with TypeScript ES-module imports.
Vite compiles the TypeScript; opening the source HTML directly is not supported.

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

To type-check and build for static hosting:

```sh
npm run build
npm run preview
```

Deploy the contents of `dist/` to the desired hosting directory. The build uses
relative asset URLs so it can be hosted under a subdirectory.

The repository's [GitHub Pages workflow](../.github/workflows/pages.yml) runs
`npm ci` and `npm run build` for this demo, then publishes `dist/` at
`/Demos2025/template-details/`. Push to `main` or manually run **Deploy GitHub
Pages** to deploy changes; the TypeScript source directory must not be published
in place of the build output.

Select a template and a preset period or enter a custom local date/time range.
Results include every matching application, not just the service's first page.
The original TemplateAppMining service currently requires authentication; an
ArcGIS account with access may be required. Authentication and query failures
are displayed in the page rather than reported as zero results.
