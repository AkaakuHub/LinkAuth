import { readFile, writeFile } from "node:fs/promises";

const css = await readFile(
  "workers/account/src/views/lib/stylesGenerated.css",
  "utf8",
);

await writeFile(
  "workers/account/src/views/lib/stylesGenerated.ts",
  `export const styleSheet = ${JSON.stringify(css)};\n`,
);
