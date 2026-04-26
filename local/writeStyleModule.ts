import { readFile, writeFile } from "node:fs/promises";

const css = await readFile("workers/shared/stylesGenerated.css", "utf8");

await writeFile(
  "workers/shared/stylesGenerated.ts",
  `export const styleSheet = ${JSON.stringify(css)};\n`,
);
