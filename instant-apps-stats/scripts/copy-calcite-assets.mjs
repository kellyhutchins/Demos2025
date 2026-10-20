import { cp, mkdir } from "node:fs/promises";

const destination = new URL("../public/calcite/assets/", import.meta.url);
await mkdir(destination, { recursive: true });
await cp(
  new URL("../node_modules/@esri/calcite-components/dist/calcite/assets/", import.meta.url),
  destination,
  { recursive: true },
);
