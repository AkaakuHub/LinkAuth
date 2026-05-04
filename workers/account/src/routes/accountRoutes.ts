import {
  createCookie,
  getSingleCookie,
  rememberCookieName,
} from "../../../../shared/src/session.js";
import { callUserApi } from "../../../shared/userApi.js";
import type { AccountConfig } from "../accountConfig.js";
import { accountReturnTo, redirectToAccountRoot } from "../domain/returnTo.js";
import { redirectToDiscordAuthorize } from "../integrations/discordOauth.js";
import { isWebp512 } from "../media/webp.js";
import { authStateCookieName, createAuthState } from "../security/authState.js";
import { verifyFormCsrf, verifyHeaderCsrf } from "../security/csrf.js";
import { appendSessionCookies, requireSession } from "../security/session.js";
import { clearAccountCookiesAndRedirect } from "../services/accountSessionCookie.js";
import { verifyActiveUser } from "../services/userDirectory.js";
import { inactiveAccountPage } from "../views/accountErrorPage.js";
import { accountLandingPage } from "../views/accountLandingPage.js";
import { accountPage } from "../views/page.js";

export async function accountHome(
  request: Request,
  url: URL,
  config: AccountConfig,
): Promise<Response> {
  const session = await requireSession(request, config);
  if (!session) {
    return await accountLandingResponse(config);
  }
  const active = await verifyActiveUser(session.discord_id, config);
  if (!active) {
    return inactiveAccountPage(config);
  }
  return appendSessionCookies(
    await accountPage(
      active.user,
      url,
      config,
      accountReturnTo(url.searchParams.get("return_to"), config),
    ),
    session,
  );
}

export async function updateProfile(
  request: Request,
  url: URL,
  config: AccountConfig,
): Promise<Response> {
  const session = await requireSession(request, config);
  if (!session) {
    return await accountLandingResponse(config);
  }
  if (
    !(await verifyFormCsrf(request, url, config, session.discord_id, "profile"))
  ) {
    return new Response("forbidden", { status: 403 });
  }
  const form = await request.formData();
  const returnTo = accountReturnTo(String(form.get("return_to") ?? ""), config);
  await callUserApi(config.userApi, "/users/update-profile", {
    discord_id: session.discord_id,
    display_name: String(form.get("display_name") ?? ""),
    request_id: crypto.randomUUID(),
  });
  return appendSessionCookies(redirectToAccountRoot(url, returnTo), session);
}

export async function updateAvatar(
  request: Request,
  url: URL,
  config: AccountConfig,
): Promise<Response> {
  const session = await requireSession(request, config);
  if (!session) {
    return await accountLandingResponse(config);
  }
  if (
    !(await verifyHeaderCsrf(
      request,
      url,
      config,
      session.discord_id,
      "avatar",
    ))
  ) {
    return new Response("forbidden", { status: 403 });
  }
  if (request.headers.get("content-type") !== "image/webp") {
    return new Response("invalid content-type", { status: 400 });
  }
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > 10 * 1024 * 1024 || !isWebp512(body)) {
    return new Response("invalid image", { status: 400 });
  }
  const iconKey = `icons/${session.discord_id}/avatar.webp`;
  await config.assets.put(iconKey, body, {
    httpMetadata: { contentType: "image/webp" },
  });
  await callUserApi(config.userApi, "/users/update-avatar", {
    discord_id: session.discord_id,
    icon_source: "r2",
    icon_key: iconKey,
    request_id: crypto.randomUUID(),
  });
  return appendSessionCookies(Response.json({ ok: true }), session);
}

export async function deleteAccount(
  request: Request,
  url: URL,
  config: AccountConfig,
): Promise<Response> {
  const session = await requireSession(request, config);
  if (!session) {
    return await accountLandingResponse(config);
  }
  if (
    !(await verifyFormCsrf(request, url, config, session.discord_id, "delete"))
  ) {
    return new Response("forbidden", { status: 403 });
  }
  const form = await request.formData();
  const returnTo = accountReturnTo(String(form.get("return_to") ?? ""), config);
  await callUserApi(config.userApi, "/users/delete", {
    discord_id: session.discord_id,
    request_id: crypto.randomUUID(),
  });
  return clearAccountCookiesAndRedirect(returnTo);
}

export async function logout(
  request: Request,
  url: URL,
  config: AccountConfig,
): Promise<Response> {
  const session = await requireSession(request, config);
  if (!session) {
    return await accountLandingResponse(config);
  }
  if (
    !(await verifyFormCsrf(request, url, config, session.discord_id, "logout"))
  ) {
    return new Response("forbidden", { status: 403 });
  }
  const remember = getSingleCookie(
    request.headers.get("cookie"),
    rememberCookieName,
  );
  const form = await request.formData();
  const returnTo = accountReturnTo(String(form.get("return_to") ?? ""), config);
  const tokenId = remember?.split(".")[0];
  if (tokenId) {
    await callUserApi(config.userApi, "/remember/delete", {
      token_id: tokenId,
      request_id: crypto.randomUUID(),
    });
  }
  return clearAccountCookiesAndRedirect(returnTo);
}

async function accountLandingResponse(
  config: AccountConfig,
): Promise<Response> {
  const state = await createAuthState(config.navigation.ACCOUNT_URL, config);
  if (!state) {
    throw new Error("ACCOUNT_URL is not allowed as return_to");
  }
  const authorizeUrl =
    redirectToDiscordAuthorize(state, config).headers.get("location") ?? "";
  const response = accountLandingPage(authorizeUrl);
  response.headers.append(
    "set-cookie",
    createCookie(authStateCookieName, state, 600),
  );
  return response;
}
