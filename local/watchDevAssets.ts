import { spawn } from "node:child_process";
import { watch } from "node:fs";

type BuildTarget = "client" | "styles";

const buildCommands: Record<BuildTarget, [string, ...string[]]> = {
  client: ["pnpm", "build:client"],
  styles: ["pnpm", "build:styles"],
};

const pending = new Set<BuildTarget>();
let timer: NodeJS.Timeout | null = null;
let running = false;

watch("frontend", { recursive: true }, (_event, fileName) => {
  if (typeof fileName === "string") {
    queue("styles");
  }
});

watch("workers", { recursive: true }, (_event, fileName) => {
  if (typeof fileName !== "string" || isGeneratedFile(fileName)) {
    return;
  }
  if (fileName === "account/src/accountClient.ts") {
    queue("client");
  }
  if (/\.ts$/.test(fileName)) {
    queue("styles");
  }
});

console.log("watching account client and Tailwind sources");

function queue(target: BuildTarget): void {
  pending.add(target);
  if (timer) {
    clearTimeout(timer);
  }
  timer = setTimeout(runPendingBuilds, 100);
}

async function runPendingBuilds(): Promise<void> {
  if (running) {
    timer = setTimeout(runPendingBuilds, 100);
    return;
  }
  running = true;
  const targets = [...pending];
  pending.clear();
  for (const target of targets) {
    await runBuild(target);
  }
  running = false;
  if (pending.size > 0) {
    timer = setTimeout(runPendingBuilds, 100);
  }
}

function runBuild(target: BuildTarget): Promise<void> {
  const command = buildCommands[target];
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      stdio: "inherit",
    });
    child.on("exit", () => resolve());
  });
}

function isGeneratedFile(fileName: string): boolean {
  return (
    fileName === "account/src/accountClientGenerated.ts" ||
    fileName === "shared/stylesGenerated.css" ||
    fileName === "shared/stylesGenerated.ts"
  );
}
