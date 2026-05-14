import {
  clearAppSession,
  completeAppLogin,
  getAppUser,
  type LinkAuthUser,
  startAppLogin,
} from "link-auth";
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
  const url = new URL(request.url);
  if (url.pathname === "/_auth/callback" && request.method === "GET") {
    return completeAppLogin({
      config,
      failedResponse: appAuthFailedPage(url),
      request,
      url,
    });
  }
  if (url.pathname === "/_auth/logout" && request.method === "GET") {
    return clearAppSession({
      config,
      loginUrl: new URL("/login", url.origin).toString(),
    });
  }

  const currentUser = await getAppUser({ config, request });
  if (!currentUser) {
    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (url.pathname === "/" && request.method === "GET") {
      return Response.redirect(new URL("/login", request.url), 302);
    }
    if (url.pathname === "/login" && request.method === "GET") {
      return loginPage(request);
    }
    if (url.pathname === "/login" && request.method === "POST") {
      return await login(request, config);
    }
    return new Response("not found", { status: 404 });
  }
  return authenticatedResponse(request, url, config, currentUser);
}

function authenticatedResponse(
  request: Request,
  url: URL,
  config: AppConfig,
  currentUser: LinkAuthUser,
): Response {
  if (url.pathname === "/api/me" && request.method === "GET") {
    return Response.json({ user: currentUser });
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
  const accountUrl = new URL(config.accountUrl);
  accountUrl.searchParams.set(
    "return_to",
    new URL("/", request.url).toString(),
  );
  return page(
    "App",
    renderAppHomePage({
      accountUrl: accountUrl.toString(),
      assetBaseUrl: config.accountUrl,
      user: toSampleUser(currentUser),
    }),
  );
}

function loginPage(request: Request): Response {
  return page(
    "App Login",
    loginPageBody({ returnTo: new URL("/", request.url).toString() }),
  );
}

async function login(request: Request, config: AppConfig): Promise<Response> {
  const form = await request.formData();
  return await startAppLogin({
    config,
    request,
    returnTo: String(form.get("return_to") ?? ""),
  });
}

function appAuthFailedPage(url: URL): Response {
  return page(
    "App認証に失敗しました",
    authFailedPageBody({ loginUrl: new URL("/login", url.origin).toString() }),
    401,
  );
}

function toSampleUser(user: LinkAuthUser): SampleUser {
  return user;
}
