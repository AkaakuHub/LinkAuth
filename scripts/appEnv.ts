export function validateAuthApps(
  source: Map<string, string>,
  envFile: string,
): void {
  const authApps = source.get("AUTH_APPS");
  if (!authApps) {
    throw new Error(`AUTH_APPS is required in ${envFile}`);
  }
  const parsed = parseAuthApps(authApps);
  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      throw new Error("AUTH_APPS item is invalid");
    }
    const record = item as Record<string, unknown>;
    if (
      typeof record.app_id !== "string" ||
      typeof record.callback_url !== "string" ||
      typeof record.session_verify_secret !== "string"
    ) {
      throw new Error("AUTH_APPS item is invalid");
    }
  }
}

export function validateSampleAppEnv(
  source: Map<string, string>,
  envFile: string,
): void {
  const authApps = source.get("AUTH_APPS");
  const appId = source.get("APP_ID");
  const appSessionSecret = source.get("APP_SESSION_HMAC_SECRET");
  if (!authApps || !appId || !appSessionSecret) {
    throw new Error(
      `AUTH_APPS, APP_ID and APP_SESSION_HMAC_SECRET are required in ${envFile}`,
    );
  }
  const parsed = parseAuthApps(authApps);
  const app = parsed.find((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    const record = item as Record<string, unknown>;
    return record.app_id === appId;
  });
  if (!app || typeof app !== "object") {
    throw new Error("AUTH_APPS must include APP_ID");
  }
  const record = app as Record<string, unknown>;
  if (
    typeof record.callback_url !== "string" ||
    typeof record.session_verify_secret !== "string"
  ) {
    throw new Error("AUTH_APPS selected app is invalid");
  }
  if (record.session_verify_secret !== appSessionSecret) {
    throw new Error(
      "APP_SESSION_HMAC_SECRET must match AUTH_APPS selected app session_verify_secret",
    );
  }
}

function parseAuthApps(value: string): unknown[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("AUTH_APPS must be an array");
  }
  return parsed;
}
