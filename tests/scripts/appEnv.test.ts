import { describe, expect, it } from "vitest";
import { validateAppEnv } from "../../scripts/appEnv.js";

describe("validateAppEnv", () => {
  it("複数appからAPP_IDに対応するsession_verify_secretを検証する", () => {
    const source = env({
      APP_ID: "service",
      APP_SESSION_HMAC_SECRET: "service-secret",
      AUTH_APPS: JSON.stringify([
        {
          app_id: "admin",
          callback_url: "https://admin.example.com/_auth/callback",
          session_verify_secret: "admin-secret",
        },
        {
          app_id: "service",
          callback_url: "https://app.example.com/_auth/callback",
          session_verify_secret: "service-secret",
        },
      ]),
    });

    expect(() => validateAppEnv(source, ".env.production")).not.toThrow();
  });

  it("AUTH_APPSにAPP_IDがない場合は拒否する", () => {
    const source = env({
      APP_ID: "service",
      APP_SESSION_HMAC_SECRET: "service-secret",
      AUTH_APPS: JSON.stringify([
        {
          app_id: "admin",
          callback_url: "https://admin.example.com/_auth/callback",
          session_verify_secret: "admin-secret",
        },
      ]),
    });

    expect(() => validateAppEnv(source, ".env.production")).toThrow(
      "AUTH_APPS must include APP_ID",
    );
  });

  it("APP_SESSION_HMAC_SECRETが対応appのsession_verify_secretと異なる場合は拒否する", () => {
    const source = env({
      APP_ID: "service",
      APP_SESSION_HMAC_SECRET: "different-secret",
      AUTH_APPS: JSON.stringify([
        {
          app_id: "service",
          callback_url: "https://app.example.com/_auth/callback",
          session_verify_secret: "service-secret",
        },
      ]),
    });

    expect(() => validateAppEnv(source, ".env.production")).toThrow(
      "APP_SESSION_HMAC_SECRET must match AUTH_APPS selected app session_verify_secret",
    );
  });
});

function env(values: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(values));
}
