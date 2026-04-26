import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { readLocalEnvFile } from "./env.js";

const source = await readLocalEnvFile();

await writeEnvFile("workers/account/.dev.vars", [
  "CSRF_HMAC_SECRET",
  "SESSION_HMAC_SECRET",
  "INTERNAL_HMAC_SECRET",
  "DISCORD_CLIENT_ID",
  "DISCORD_CLIENT_SECRET",
  "USER_API_URL",
  ["DOMAIN_NAME", "LOCAL_DOMAIN_NAME"],
  "ACCOUNT_URL",
  "ALLOWED_RETURN_TO_ORIGINS",
  "AUTH_LOGIN_URL",
  "AUTH_CALLBACK_URL",
]);

await writeEnvFile("workers/app/.dev.vars", [
  "SESSION_HMAC_SECRET",
  ["DOMAIN_NAME", "LOCAL_DOMAIN_NAME"],
  "AUTH_LOGIN_URL",
  "ACCOUNT_URL",
]);

await writeTerraformVarsFile("infra/terraform.tfvars", [
  ["aws_region", "AWS_REGION"],
  ["domain_name", "PUBLIC_DOMAIN_NAME"],
  ["cloudflare_account_id", "CLOUDFLARE_ACCOUNT_ID"],
  ["cloudflare_zone_id", "CLOUDFLARE_ZONE_ID"],
  ["cloudflare_api_token", "CLOUDFLARE_API_TOKEN"],
  ["discord_public_key", "DISCORD_PUBLIC_KEY"],
  ["discord_guild_id", "DISCORD_GUILD_ID"],
  ["discord_bot_token", "DISCORD_BOT_TOKEN"],
  ["internal_hmac_kid", "INTERNAL_HMAC_KID"],
  ["internal_hmac_secret", "INTERNAL_HMAC_SECRET"],
]);

console.log("Synced .env.local to Worker .dev.vars files and Terraform tfvars");

type Mapping = string | [destinationKey: string, sourceKey: string];

async function writeEnvFile(path: string, mappings: Mapping[]): Promise<void> {
  const lines: string[] = [];
  for (const mapping of mappings) {
    const destinationKey = typeof mapping === "string" ? mapping : mapping[0];
    const sourceKey = typeof mapping === "string" ? mapping : mapping[1];
    const value = source.get(sourceKey);
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
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function quoteTerraform(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
