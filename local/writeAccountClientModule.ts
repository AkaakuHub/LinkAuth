import { readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const output = await build({
  bundle: true,
  entryPoints: ["workers/account/src/accountClient.tsx"],
  format: "iife",
  minify: true,
  platform: "browser",
  target: "es2022",
  write: false,
});
const accountClientScript = output.outputFiles[0]?.text;
if (!accountClientScript) {
  throw new Error("account client bundle was not generated");
}

const reactLicenseText = await readFile(
  "node_modules/react-dom/LICENSE",
  "utf8",
);

await writeFile(
  "workers/account/src/accountClientGenerated.ts",
  `export const accountClientScript = ${JSON.stringify(`/*\n${reactLicenseText.trim()}\n*/\n${accountClientScript}`)};\n`,
);
