import { readFile, writeFile } from "node:fs/promises";

const css = await readFile("workers/shared/styles.generated.css", "utf8");

await writeFile(
  "workers/shared/styles.generated.ts",
  `export const styleSheet = ${JSON.stringify(css)};\n`,
);
