import { handleAppAuthRequest, type LinkAuthUser } from "link-auth";
import { type AppConfig, withAppConfig } from "./appConfig.js";
import {
  authFailedPageBody,
  loginPageBody,
  page,
  appHomePage as renderAppHomePage,
} from "./samplePage.js";
import type { SampleUser } from "./sampleUser.js";

export default withAppConfig(handleAppRequest);

async function handleAppRequest(
  request: Request,
  config: AppConfig,
): Promise<Response> {
  return await handleAppAuthRequest({
    authFailedResponse: appAuthFailedPage,
    config,
    handleRequest: sampleAppRoute,
    loginResponse: loginPage,
    request,
  });
}

function sampleAppRoute(input: {
  request: Request;
  url: URL;
  user: LinkAuthUser;
}): Response {
  const { request, url, user } = input;
  if (url.pathname === "/api/me" && request.method === "GET") {
    return Response.json({ user: toSampleUser(user) });
  }
  if (url.pathname.startsWith("/api/")) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (url.pathname === "/login" && request.method === "GET") {
    return Response.redirect(new URL("/", request.url), 302);
  }
  if (url.pathname !== "/" || request.method !== "GET") {
    return new Response("not found", { status: 404 });
  }
  return page(
    "App",
    renderAppHomePage({
      settingsUrl: new URL("/_auth/account", request.url).toString(),
      user: toSampleUser(user),
    }),
  );
}

function loginPage(request: Request): Response {
  return page(
    "App Login",
    loginPageBody({ returnTo: new URL("/", request.url).toString() }),
  );
}

function appAuthFailedPage(url: URL): Response {
  return page(
    "App認証に失敗しました",
    authFailedPageBody({ loginUrl: new URL("/login", url.origin).toString() }),
    401,
  );
}

function toSampleUser(user: LinkAuthUser): SampleUser {
  return {
    ...(user.avatar_url ? { avatar_url: user.avatar_url } : {}),
    discord_id: user.discord_id,
    display_name: user.display_name,
  };
}
