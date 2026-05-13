import { readFile } from "node:fs/promises";
import { config, parse } from "dotenv";

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

export async function readEnvFile(
  path = ".env.local",
): Promise<Map<string, string>> {
  const body = await readFile(path, "utf8");
  const parsed = parse(body);
  const values = new Map<string, string>();
  for (const [key, value] of Object.entries(parsed)) {
    values.set(key, value);
  }
  return values;
}

export async function readLocalEnvFile(): Promise<Map<string, string>> {
  return await readEnvFile(".env.local");
}

function loadLocalEnv(): void {
  if (envLoaded) {
    return;
  }
  config({ path: ".env.local" });
  envLoaded = true;
}
