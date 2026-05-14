import { readFile, writeFile } from "node:fs/promises";

const css = await readFile("workers/account/src/generated/styles.css", "utf8");

await writeFile(
  "workers/account/src/generated/styles.ts",
  `export const styleSheet = ${JSON.stringify(css)};\n`,
);
