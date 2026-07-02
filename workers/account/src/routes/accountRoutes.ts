import {
  createCookie,
  getSingleCookie,
  rememberCookieName,
} from "../../../../src/session.js";
import type { AccountConfig } from "../accountConfig.js";
import {
  grantAppGuildAccess,
  revokeAppGuildAccess,
} from "../data/appGuildAccess.js";
import { InactiveUserError } from "../data/errors.js";
import {
  createPersonalAccessToken,
  deleteAllPersonalAccessTokens,
  normalizePersonalAccessTokenExpiration,
  normalizePersonalAccessTokenName,
  revokePersonalAccessToken,
} from "../data/personalAccessTokens.js";
import {
  deleteAllRememberTokens,
  deleteRememberToken,
} from "../data/rememberTokens.js";
import {
  markUserDeleted,
  updateUserAvatar,
  updateUserProfile,
} from "../data/users.js";
import { isAccountAdmin } from "../domain/admin.js";
import { appLogoutUrlForReturnTo, findApp } from "../domain/appRegistry.js";
import { createAvatarIconKey } from "../domain/avatar.js";
import { normalizeDisplayName } from "../domain/displayName.js";
import { accountReturnTo, redirectToAccountRoot } from "../domain/returnTo.js";
import { redirectToDiscordAuthorize } from "../integrations/discordOauth.js";
import { isWebp512 } from "../media/webp.js";
import { authStateCookieName, createAuthState } from "../security/authState.js";
import { verifyFormCsrf, verifyHeaderCsrf } from "../security/csrf.js";
import {
  appendRememberCookieDeletion,
  appendSessionCookies,
  requireFreshSession,
} from "../security/session.js";
import { clearAccountCookiesAndRedirect } from "../services/accountSessionCookie.js";
import {
  verifyActiveUser,
  verifyMemberUser,
} from "../services/userDirectory.js";
import { inactiveAccountPage } from "../views/pages/accountErrorPage.js";
import { accountLandingPage } from "../views/pages/accountLandingPage.js";
import { accountPage } from "../views/pages/accountPage.js";

export async function accountHome(
  request: Request,
  url: URL,
  config: AccountConfig,
): Promise<Response> {
  const session = await requireFreshSession(request, config);
  if (!session) {
    return appendRememberCookieDeletion(
      request,
      await accountLandingResponse(
        config,
        accountReturnTo(url.searchParams.get("return_to"), config),
      ),
    );
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
  const session = await requireFreshSession(request, config);
  if (!session) {
    return appendRememberCookieDeletion(
      request,
      await accountLandingResponse(config),
    );
  }
  if (
    !(await verifyFormCsrf(request, url, config, session.discord_id, "profile"))
  ) {
    return new Response("forbidden", { status: 403 });
  }
  const form = await request.formData();
  const returnTo = accountReturnTo(String(form.get("return_to") ?? ""), config);
  const displayName = normalizeDisplayName(
    String(form.get("display_name") ?? ""),
  );
  if (!displayName) {
    return new Response("invalid display_name", { status: 400 });
  }
  const active = await verifyMemberUser(session.discord_id, config);
  if (!active) {
    return inactiveAccountPage(config, returnTo);
  }
  try {
    await updateUserProfile(config, {
      discordId: session.discord_id,
      displayName,
    });
  } catch (error) {
    if (error instanceof InactiveUserError) {
      return inactiveAccountPage(config, returnTo);
    }
    throw error;
  }
  return appendSessionCookies(redirectToAccountRoot(url, returnTo), session);
}

export async function updateAvatar(
  request: Request,
  url: URL,
  config: AccountConfig,
  ctx: ExecutionContext,
): Promise<Response> {
  const session = await requireFreshSession(request, config);
  if (!session) {
    return appendRememberCookieDeletion(
      request,
      await accountLandingResponse(config),
    );
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
  const body = await readAvatarBody(request);
  if (!body || !isWebp512(body)) {
    return new Response("invalid image", { status: 400 });
  }
  const active = await verifyMemberUser(session.discord_id, config);
  if (!active) {
    return inactiveAccountPage(config);
  }
  const previousIconKey =
    active.user.icon_source === "r2" ? active.user.icon_key : null;
  const iconKey = await createAvatarIconKey(session.discord_id, body);
  await config.assets.put(iconKey, body, {
    httpMetadata: { contentType: "image/webp" },
  });
  try {
    await updateUserAvatar(config, {
      discordId: session.discord_id,
      iconKey,
    });
  } catch (error) {
    await deleteStoredAvatarAfterFailedUpdate(config, iconKey);
    if (error instanceof InactiveUserError) {
      return inactiveAccountPage(config);
    }
    throw error;
  }
  if (previousIconKey && previousIconKey !== iconKey) {
    ctx.waitUntil(deleteStoredAvatar(config, previousIconKey));
  }
  return appendSessionCookies(Response.json({ ok: true }), session);
}

export async function deleteAccount(
  request: Request,
  url: URL,
  config: AccountConfig,
): Promise<Response> {
  const session = await requireFreshSession(request, config);
  if (!session) {
    return appendRememberCookieDeletion(
      request,
      await accountLandingResponse(config),
    );
  }
  if (
    !(await verifyFormCsrf(request, url, config, session.discord_id, "delete"))
  ) {
    return new Response("forbidden", { status: 403 });
  }
  const form = await request.formData();
  const returnTo = accountReturnTo(String(form.get("return_to") ?? ""), config);
  await markUserDeleted(config, session.discord_id);
  await deleteAllRememberTokens(config, session.discord_id);
  await deleteAllPersonalAccessTokens(config, session.discord_id);
  return clearAccountCookiesAndRedirect(
    appLogoutUrlForReturnTo(config, returnTo),
  );
}

export async function createToken(
  request: Request,
  url: URL,
  config: AccountConfig,
): Promise<Response> {
  const session = await requireFreshSession(request, config);
  if (!session) {
    return appendRememberCookieDeletion(
      request,
      await accountLandingResponse(config),
    );
  }
  if (
    !(await verifyFormCsrf(request, url, config, session.discord_id, "token"))
  ) {
    return new Response("forbidden", { status: 403 });
  }
  const form = await request.formData();
  const returnTo = accountReturnTo(String(form.get("return_to") ?? ""), config);
  const name = normalizePersonalAccessTokenName(String(form.get("name") ?? ""));
  const expiration = normalizePersonalAccessTokenExpiration(
    String(form.get("expiration") ?? ""),
  );
  if (!name) {
    return new Response("invalid token name", { status: 400 });
  }
  if (!expiration) {
    return new Response("invalid token expiration", { status: 400 });
  }
  const active = await verifyMemberUser(session.discord_id, config);
  if (!active) {
    return inactiveAccountPage(config, returnTo);
  }
  const { token } = await createPersonalAccessToken(config, {
    discordId: session.discord_id,
    expiration,
    name,
  });
  return appendSessionCookies(
    await accountPage(active.user, url, config, returnTo, token),
    session,
  );
}

export async function revokeToken(
  request: Request,
  url: URL,
  config: AccountConfig,
): Promise<Response> {
  const session = await requireFreshSession(request, config);
  if (!session) {
    return appendRememberCookieDeletion(
      request,
      await accountLandingResponse(config),
    );
  }
  if (
    !(await verifyFormCsrf(request, url, config, session.discord_id, "token"))
  ) {
    return new Response("forbidden", { status: 403 });
  }
  const form = await request.formData();
  const returnTo = accountReturnTo(String(form.get("return_to") ?? ""), config);
  await revokePersonalAccessToken(config, {
    discordId: session.discord_id,
    tokenId: String(form.get("token_id") ?? ""),
  });
  return appendSessionCookies(redirectToAccountRoot(url, returnTo), session);
}

export async function updateAppGuildAccess(
  request: Request,
  url: URL,
  config: AccountConfig,
): Promise<Response> {
  const session = await requireFreshSession(request, config);
  if (!session) {
    return appendRememberCookieDeletion(
      request,
      await accountLandingResponse(config),
    );
  }
  if (
    !(await verifyFormCsrf(
      request,
      url,
      config,
      session.discord_id,
      "app-guild-access",
    ))
  ) {
    return new Response("forbidden", { status: 403 });
  }
  const active = await verifyActiveUser(session.discord_id, config);
  if (!active) {
    return inactiveAccountPage(config);
  }
  if (!isAccountAdmin(config, active.user)) {
    return new Response("forbidden", { status: 403 });
  }
  const form = await request.formData();
  const returnTo = accountReturnTo(String(form.get("return_to") ?? ""), config);
  const appId = String(form.get("app_id") ?? "");
  const guildId = String(form.get("guild_id") ?? "");
  const action = String(form.get("action") ?? "");
  if (!findApp(config, appId) || !config.discord.guildIds.includes(guildId)) {
    return new Response("invalid app_id or guild_id", { status: 400 });
  }
  if (action === "grant") {
    await grantAppGuildAccess(config, {
      appId,
      guildId,
      createdByDiscordId: active.user.discord_id,
    });
    return appendSessionCookies(redirectToAccountRoot(url, returnTo), session);
  }
  if (action === "revoke") {
    await revokeAppGuildAccess(config, { appId, guildId });
    return appendSessionCookies(redirectToAccountRoot(url, returnTo), session);
  }
  return new Response("invalid action", { status: 400 });
}

export async function logout(
  request: Request,
  url: URL,
  config: AccountConfig,
): Promise<Response> {
  const session = await requireFreshSession(request, config);
  if (!session) {
    return appendRememberCookieDeletion(
      request,
      await accountLandingResponse(config),
    );
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
    await deleteRememberToken(config, tokenId);
  }
  return clearAccountCookiesAndRedirect(
    appLogoutUrlForReturnTo(config, returnTo),
  );
}

async function accountLandingResponse(
  config: AccountConfig,
  returnTo = config.navigation.ACCOUNT_URL,
): Promise<Response> {
  const state = await createAuthState(returnTo, config);
  if (!state) {
    throw new Error("return_to is not allowed");
  }
  const authorizeUrl =
    redirectToDiscordAuthorize(state, config).headers.get("location") ?? "";
  const response = accountLandingPage(config, authorizeUrl, {
    allowLocalhostCsp: config.environment === "local",
  });
  response.headers.append(
    "set-cookie",
    createCookie(authStateCookieName, state, 600),
  );
  return response;
}

const avatarMaxBytes = 10 * 1024 * 1024;

async function readAvatarBody(request: Request): Promise<Uint8Array | null> {
  if (!isAllowedAvatarContentLength(request.headers.get("content-length"))) {
    return null;
  }
  if (!request.body) {
    return new Uint8Array();
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      totalBytes += result.value.byteLength;
      if (totalBytes > avatarMaxBytes) {
        return null;
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function isAllowedAvatarContentLength(value: string | null): boolean {
  if (value === null) {
    return true;
  }
  if (!/^[0-9]+$/.test(value)) {
    return false;
  }
  const length = Number(value);
  return Number.isSafeInteger(length) && length <= avatarMaxBytes;
}

async function deleteStoredAvatar(
  config: AccountConfig,
  iconKey: string,
): Promise<void> {
  await config.assets.delete(iconKey);
}

async function deleteStoredAvatarAfterFailedUpdate(
  config: AccountConfig,
  iconKey: string,
): Promise<void> {
  try {
    await deleteStoredAvatar(config, iconKey);
  } catch {
    return;
  }
}
