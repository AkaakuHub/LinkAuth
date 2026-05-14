import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { readEnvFile } from "./env.js";

const options = parseOptions(process.argv.slice(2));
const source = await readEnvFile(options.envFile);
const app = appDefinition(source, options.envFile);

await writeEnvFile(options.accountOutput, [
  ["LINK_AUTH_ENV", workerEnvironment(options.envName)],
  "CSRF_KID",
  "CSRF_HMAC_SECRET",
  "SESSION_KID",
  "SESSION_HMAC_SECRET",
  "OTP_HMAC_SECRET",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DISCORD_PUBLIC_KEY",
  "DOMAIN_NAME",
  "ACCOUNT_URL",
  ["AUTH_APPS", app.authApps],
  "DISCORD_BOT_TOKEN",
  "DISCORD_GUILD_IDS",
]);

await writeEnvFile(options.appOutput, [
  ["APP_ID", app.appId],
  "SESSION_KID",
  "APP_SESSION_HMAC_SECRET",
  "DOMAIN_NAME",
  "ACCOUNT_URL",
]);

console.log(
  `Synced ${options.envFile} to ${options.accountOutput} and ${options.appOutput}`,
);

type Options = {
  accountOutput: string;
  appOutput: string;
  envFile: string;
  envName: string;
};

type Mapping = string | [destinationKey: string, sourceKey: string];
type ResolvedMapping = string | [destinationKey: string, value: string];

function parseOptions(args: string[]): Options {
  const envName = optionValue(args, "--env") ?? "local";
  const envFile = optionValue(args, "--env-file") ?? `.env.${envName}`;
  return {
    accountOutput:
      optionValue(args, "--account-out") ?? defaultAccountOutput(envName),
    appOutput: optionValue(args, "--app-out") ?? defaultAppOutput(envName),
    envFile,
    envName,
  };
}

function optionValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }
  const value = args[index + 1];
  if (!value) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function defaultAccountOutput(envName: string): string {
  return envName === "local"
    ? "workers/account/.dev.vars"
    : `.wrangler/env/${envName}/account.vars`;
}

function defaultAppOutput(envName: string): string {
  return envName === "local"
    ? "workers/app/.dev.vars"
    : `.wrangler/env/${envName}/app.vars`;
}

function workerEnvironment(envName: string): "local" | "production" {
  return envName === "local" ? "local" : "production";
}

async function writeEnvFile(
  path: string,
  mappings: Array<Mapping | ResolvedMapping>,
): Promise<void> {
  const lines: string[] = [];
  for (const mapping of mappings) {
    const destinationKey = typeof mapping === "string" ? mapping : mapping[0];
    const sourceKey = typeof mapping === "string" ? mapping : mapping[1];
    const value =
      typeof mapping === "string" || source.has(sourceKey)
        ? source.get(sourceKey)
        : sourceKey;
    if (!value) {
      throw new Error(`${sourceKey} is required in ${options.envFile}`);
    }
    lines.push(`${destinationKey}=${quoteEnv(value)}`);
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${lines.join("\n")}\n`);
}

function quoteEnv(value: string): string {
  if (value.includes("\n") || value.includes("\r")) {
    throw new Error("env value must be single-line");
  }
  return value;
}

function appDefinition(
  source: Map<string, string>,
  envFile: string,
): {
  appId: string;
  authApps: string;
} {
  const authApps = source.get("AUTH_APPS");
  const accountUrl = source.get("ACCOUNT_URL");
  const appSessionSecret = source.get("APP_SESSION_HMAC_SECRET");
  if (!authApps || !accountUrl || !appSessionSecret) {
    throw new Error(
      `AUTH_APPS, ACCOUNT_URL and APP_SESSION_HMAC_SECRET are required in ${envFile}`,
    );
  }
  const parsed = JSON.parse(authApps) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("AUTH_APPS must be an array");
  }
  const accountOrigin = new URL(accountUrl).origin;
  let appIndex = -1;
  const app = parsed.find((item, index) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const record = item as Record<string, unknown>;
    if (typeof record.callback_url !== "string") {
      return false;
    }
    const matches = new URL(record.callback_url).origin !== accountOrigin;
    if (matches) {
      appIndex = index;
    }
    return matches;
  });
  if (!app || typeof app !== "object") {
    throw new Error("AUTH_APPS must include an app callback URL");
  }
  const appId = (app as Record<string, unknown>).app_id;
  if (typeof appId !== "string" || appId.length === 0) {
    throw new Error("AUTH_APPS local app_id is required");
  }
  const resolvedApps = [...parsed];
  resolvedApps[appIndex] = {
    ...(app as Record<string, unknown>),
    session_verify_secret: appSessionSecret,
  };
  return { appId, authApps: JSON.stringify(resolvedApps) };
}
