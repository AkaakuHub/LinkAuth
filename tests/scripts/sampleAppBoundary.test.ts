import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sampleAppFiles = [
  "workers/app/src/appConfig.ts",
  "workers/app/src/index.ts",
  "workers/app/src/samplePage.ts",
  "workers/app/src/sampleUser.ts",
];

const forbiddenKnowledge = [
  "APP_SESSION_HMAC_SECRET",
  "AUTH_APPS",
  "appAuthStateCookieName",
  "appSessionCookieName",
  "authenticatedResponse",
  "avatarAssetUrl",
  "clearAppSession",
  "completeAppLogin",
  "getAppUser",
  "icon_key",
  "icon_source",
  "startAppLogin",
];

describe("sample app auth boundary", () => {
  it("認証内部の知識をサンプルapp側へ漏らさない", async () => {
    const contents = await Promise.all(
      sampleAppFiles.map(async (path) => ({
        path,
        text: await readFile(join(process.cwd(), path), "utf8"),
      })),
    );

    for (const { path, text } of contents) {
      for (const forbidden of forbiddenKnowledge) {
        expect(text, `${path} must not contain ${forbidden}`).not.toContain(
          forbidden,
        );
      }
    }
  });
});
