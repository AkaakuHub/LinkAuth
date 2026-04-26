import { readFile } from "node:fs/promises";
import { config } from "dotenv";

let envLoaded = false;

export function requiredLocalEnv(name: string): string {
  loadLocalEnv();
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required in .env.local`);
  }
  return value;
}

export function requiredLocalUrlPort(name: string): number {
  const value = requiredLocalEnv(name);
  const url = new URL(value);
  if (!url.port) {
    throw new Error(`${name} must include an explicit port`);
  }
  return Number(url.port);
}

export async function readLocalEnvFile(): Promise<Map<string, string>> {
  const body = await readFile(".env.local", "utf8");
  const values = new Map<string, string>();
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      throw new Error(`Invalid env line: ${rawLine}`);
    }
    const key = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    if (!key) {
      throw new Error(`Invalid env key: ${rawLine}`);
    }
    values.set(key, stripQuotes(value));
  }
  return values;
}

function loadLocalEnv(): void {
  if (envLoaded) {
    return;
  }
  config({ path: ".env.local" });
  envLoaded = true;
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
