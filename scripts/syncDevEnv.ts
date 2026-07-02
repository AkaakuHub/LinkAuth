import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { validateAuthApps, validateSampleAppEnv } from "./appEnv.js";
import { readEnvFile } from "./env.js";

const options = parseOptions(process.argv.slice(2));
const source = await readEnvFile(options.envFile);
validateAuthApps(source, options.envFile);
if (options.appOutput) {
  validateSampleAppEnv(source, options.envFile);
}

await writeEnvFile(options.accountOutput, [
  ["LINK_AUTH_ENV", workerEnvironment(options.envName)],
  "CSRF_KID",
  "CSRF_HMAC_SECRET",
  "SESSION_KID",
  "SESSION_HMAC_SECRET",
  "OTP_HMAC_SECRET",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "DOMAIN_NAME",
  "ACCOUNT_URL",
  "AUTH_APPS",
  "ADMIN_DISCORD_IDS",
  "DISCORD_BOT_TOKEN",
  "DISCORD_GUILD_IDS",
]);

if (options.appOutput) {
  await writeEnvFile(options.appOutput, [
    "APP_ID",
    "SESSION_KID",
    "APP_SESSION_HMAC_SECRET",
    "DOMAIN_NAME",
    "ACCOUNT_URL",
  ]);
}

if (options.terraformOutput) {
  await writeTerraformVarsFile(options.terraformOutput, [
    ["cloudflare_api_token", "CLOUDFLARE_API_TOKEN"],
    ["cloudflare_account_id", "CLOUDFLARE_ACCOUNT_ID"],
    ["cloudflare_zone_id", "CLOUDFLARE_ZONE_ID"],
    ["domain_name", "DOMAIN_NAME"],
    ["account_cleanup_cron", "CLOUDFLARE_ACCOUNT_CLEANUP_CRON"],
  ]);
}

console.log(
  `Synced ${options.envFile} to ${[
    options.accountOutput,
    options.appOutput,
    options.terraformOutput,
  ]
    .filter((path) => path !== null)
    .join(" and ")}`,
);

type Options = {
  accountOutput: string;
  appOutput: string | null;
  envFile: string;
  envName: string;
  terraformOutput: string | null;
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
    terraformOutput:
      optionValue(args, "--terraform-out") ?? defaultTerraformOutput(envName),
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

function defaultAppOutput(envName: string): string | null {
  return envName === "local" ? "workers/app/.dev.vars" : null;
}

function defaultTerraformOutput(envName: string): string | null {
  return envName === "local" ? null : "infra/terraform.tfvars";
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

async function writeTerraformVarsFile(
  path: string,
  mappings: Array<[destinationKey: string, sourceKey: string]>,
): Promise<void> {
  const lines: string[] = [];
  for (const [destinationKey, sourceKey] of mappings) {
    const value = source.get(sourceKey);
    if (!value) {
      throw new Error(`${sourceKey} is required in ${options.envFile}`);
    }
    lines.push(`${destinationKey} = ${JSON.stringify(value)}`);
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
