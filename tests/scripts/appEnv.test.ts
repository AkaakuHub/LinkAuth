import { describe, expect, it } from "vitest";
import {
  validateAuthApps,
  validateSampleAppEnv,
} from "../../scripts/appEnv.js";

describe("validateAuthApps", () => {
  it("AUTH_APPSの各appにsession_verify_secretがあることを検証する", () => {
    const source = env({
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

    expect(() => validateAuthApps(source, ".env.production")).not.toThrow();
  });

  it("session_verify_secretがないappを拒否する", () => {
    const source = env({
      AUTH_APPS: JSON.stringify([
        {
          app_id: "service",
          callback_url: "https://app.example.com/_auth/callback",
        },
      ]),
    });

    expect(() => validateAuthApps(source, ".env.production")).toThrow(
      "AUTH_APPS item is invalid",
    );
  });
});

describe("validateSampleAppEnv", () => {
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

    expect(() => validateSampleAppEnv(source, ".env.local")).not.toThrow();
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

    expect(() => validateSampleAppEnv(source, ".env.local")).toThrow(
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

    expect(() => validateSampleAppEnv(source, ".env.local")).toThrow(
      "APP_SESSION_HMAC_SECRET must match AUTH_APPS selected app session_verify_secret",
    );
  });
});

function env(values: Record<string, string>): Map<string, string> {
  return new Map(Object.entries(values));
}
