import { mkdir, readFile, writeFile } from "node:fs/promises";

await mkdir("workers/account/src/generated", { recursive: true });

const css = await readFile("workers/account/src/generated/styles.css", "utf8");

await writeFile(
  "workers/account/src/generated/styles.ts",
  `export const styleSheet = ${JSON.stringify(css)};\n`,
);
