import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { readLocalEnvFile } from "./env.js";

const source = await readLocalEnvFile();
const localApp = localAppDefinition(source);

await writeEnvFile("workers/account/.dev.vars", [
  "CSRF_KID",
  "CSRF_HMAC_SECRET",
  "SESSION_KID",
  "SESSION_HMAC_SECRET",
  "INTERNAL_HMAC_KID",
  "INTERNAL_HMAC_SECRET",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "USER_API_URL",
  ["DOMAIN_NAME", "LOCAL_DOMAIN_NAME"],
  "ACCOUNT_URL",
  ["AUTH_APPS", localApp.authApps],
  "DISCORD_BOT_TOKEN",
  "DISCORD_GUILD_IDS",
]);

await writeEnvFile("workers/app/.dev.vars", [
  ["APP_ID", localApp.appId],
  "SESSION_KID",
  "APP_SESSION_HMAC_SECRET",
  ["DOMAIN_NAME", "LOCAL_DOMAIN_NAME"],
  "ACCOUNT_URL",
]);

await writeTerraformVarsFile("infra/terraform.tfvars", [
  ["aws_region", "AWS_REGION"],
  ["domain_name", "PUBLIC_DOMAIN_NAME"],
  ["cloudflare_account_id", "CLOUDFLARE_ACCOUNT_ID"],
  ["cloudflare_zone_id", "CLOUDFLARE_ZONE_ID"],
  ["cloudflare_api_token", "CLOUDFLARE_API_TOKEN"],
  ["discord_public_key", "DISCORD_PUBLIC_KEY"],
  ["discord_guild_ids", "DISCORD_GUILD_IDS"],
  ["discord_bot_token", "DISCORD_BOT_TOKEN"],
  ["internal_hmac_kid", "INTERNAL_HMAC_KID"],
  ["internal_hmac_secret", "INTERNAL_HMAC_SECRET"],
]);

console.log("Synced .env.local to Worker .dev.vars files and Terraform tfvars");

type Mapping = string | [destinationKey: string, sourceKey: string];
type ResolvedMapping = string | [destinationKey: string, value: string];

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
      throw new Error(`${sourceKey} is required in .env.local`);
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
      throw new Error(`${sourceKey} is required in .env.local`);
    }
    lines.push(`${destinationKey} = ${quoteTerraform(value)}`);
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

function quoteTerraform(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function localAppDefinition(source: Map<string, string>): {
  appId: string;
  authApps: string;
} {
  const authApps = source.get("AUTH_APPS");
  const accountUrl = source.get("ACCOUNT_URL");
  const appSessionSecret = source.get("APP_SESSION_HMAC_SECRET");
  if (!authApps || !accountUrl || !appSessionSecret) {
    throw new Error(
      "AUTH_APPS, ACCOUNT_URL and APP_SESSION_HMAC_SECRET are required in .env.local",
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
    throw new Error("AUTH_APPS must include the local app callback URL");
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
