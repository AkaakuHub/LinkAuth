import {
  hmacSha256Base64Url,
  randomBase64Url,
} from "../../../../src/crypto.js";
import { timingSafeEqual } from "../../../../src/encoding.js";
import {
  appSessionCookieName,
  createCookie,
  deleteCookie,
  getBearerToken,
  getSingleCookie,
  verifySessionCookie,
} from "../../../../src/session.js";
import type { AccountConfig } from "../accountConfig.js";
import { verifyCurrentAppGuildAccess } from "../data/appGuildAccess.js";
import { consumeAuthCode, createAuthCode } from "../data/authCodes.js";
import { DataConflictError, RateLimitedError } from "../data/errors.js";
import {
  consumeOtpChallenge,
  createOtpChallenge,
} from "../data/otpChallenges.js";
import { verifyPersonalAccessToken } from "../data/personalAccessTokens.js";
import { ensureGuildMemberUser } from "../data/users.js";
import { isAccountAdmin } from "../domain/admin.js";
import { findApp, matchesCallbackUrl } from "../domain/appRegistry.js";
import { normalizeReturnTo } from "../domain/navigation.js";
import { createOtpCode } from "../domain/otpCode.js";
import { accountReturnTo } from "../domain/returnTo.js";
import type { User } from "../domain/user.js";
import {
  type DiscordOAuthUser,
  fetchDiscordGuildMembership,
  fetchDiscordOAuthResult,
  redirectToDiscordAuthorize,
} from "../integrations/discordOauth.js";
import {
  authStateCookieName,
  createAuthState,
  parseAuthState,
} from "../security/authState.js";
import {
  createOtpState,
  otpStateCookieName,
  verifyOtpState,
} from "../security/otpState.js";
import {
  appendRememberCookieDeletion,
  appendSessionCookies,
  requireSession,
} from "../security/session.js";
import { createAccountSessionResponse } from "../services/accountSessionCookie.js";
import { sendDiscordOtp } from "../services/discordOtp.js";
import {
  verifyActiveUser,
  verifyCurrentMemberUser,
} from "../services/userDirectory.js";
import {
  authFailedPage,
  inactiveAccountPage,
  otpDeliveryFailedPage,
  otpRateLimitedPage,
} from "../views/pages/accountErrorPage.js";
import { otpPage } from "../views/pages/otpPage.js";

export async function authorize(
  request: Request,
  url: URL,
  config: AccountConfig,
): Promise<Response> {
  const appId = url.searchParams.get("app_id");
  const app = appId ? findApp(config, appId) : null;
  const returnTo = normalizeReturnTo(
    url.searchParams.get("return_to"),
    config.navigation,
  );
  if (!app || !returnTo || !matchesCallbackUrl(returnTo, app.callbackUrl)) {
    return authFailedPage(config);
  }
  const session = await requireSession(request, config);
  if (!session) {
    const state = await createAuthState(returnTo, config, app.appId);
    if (!state) {
      return authFailedPage(config);
    }
    return appendSetCookie(
      appendRememberCookieDeletion(
        request,
        redirectToDiscordAuthorize(state, config),
      ),
      createCookie(authStateCookieName, state, 600),
    );
  }
  const active = await verifyCurrentMemberUser(session.discord_id, config);
  if (!active) {
    return inactiveAccountPage(config, returnTo);
  }
  if (
    !(await verifyCurrentAppGuildAccess(config, {
      appId: app.appId,
      discordId: active.user.discord_id,
    }))
  ) {
    return inactiveAccountPage(config, returnTo);
  }
  const code = randomBase64Url(32);
  await createAuthCode(config, {
    appId: app.appId,
    code,
    expiresAt: Math.floor(Date.now() / 1000) + 300,
    sessionPersistent: session.persistent !== false,
    user: appAuthUser(config, active.user),
  });
  const callbackUrl = new URL(returnTo);
  callbackUrl.searchParams.set("code", code);
  return appendSessionCookies(Response.redirect(callbackUrl, 302), session);
}

export async function token(
  request: Request,
  config: AccountConfig,
): Promise<Response> {
  const body = await parseJsonRequest(request);
  const appId = body.app_id;
  const code = body.code;
  if (typeof appId !== "string" || typeof code !== "string") {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const app = findApp(config, appId);
  if (!app?.sessionVerifySecret) {
    return Response.json({ error: "unknown_app" }, { status: 403 });
  }
  const signature = request.headers.get("x-app-token-signature");
  const expectedSignature = await hmacSha256Base64Url(
    app.sessionVerifySecret,
    `${appId}.${code}`,
  );
  if (!signature || !timingSafeEqual(signature, expectedSignature)) {
    return Response.json({ error: "invalid_app_signature" }, { status: 401 });
  }
  try {
    const result = await consumeAuthCode(config, { appId, code });
    return result
      ? Response.json(result)
      : Response.json({ error: "invalid_auth_code" }, { status: 401 });
  } catch (error) {
    if (error instanceof DataConflictError) {
      return Response.json({ error: "invalid_auth_code" }, { status: 401 });
    }
    throw error;
  }
}

async function parseJsonRequest(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function callback(
  request: Request,
  url: URL,
  config: AccountConfig,
): Promise<Response> {
  const code = url.searchParams.get("code");
  const stateValue = url.searchParams.get("state");
  const state = await parseAuthState(stateValue, config);
  if (!state) {
    return callbackResponse(authFailedPage(config));
  }
  if (!code) {
    return callbackResponse(authFailedPage(config, state.return_to));
  }
  const authStateValue = stateValue;
  if (!authStateValue) {
    return callbackResponse(authFailedPage(config));
  }
  if (
    !timingSafeEqual(
      getSingleCookie(request.headers.get("cookie"), authStateCookieName) ?? "",
      authStateValue,
    )
  ) {
    return callbackResponse(authFailedPage(config));
  }

  const discordResult = await fetchDiscordOAuthResult(code, config);
  if (!discordResult) {
    return callbackResponse(authFailedPage(config, state.return_to));
  }
  const guildMembership = await fetchDiscordGuildMembership(
    discordResult.accessToken,
    config,
  );
  if (!guildMembership) {
    return callbackResponse(inactiveAccountPage(config, state.return_to));
  }
  await ensureGuildMemberUser(config, {
    discordId: discordResult.user.id,
    discordUsername: discordResult.user.username,
    displayName: discordDisplayName(discordResult.user),
    guildId: guildMembership.guildId,
  });
  const active = await verifyCurrentMemberUser(discordResult.user.id, config);
  if (!active) {
    return callbackResponse(inactiveAccountPage(config, state.return_to));
  }

  const challengeId = randomBase64Url(24);
  const otpCode = createOtpCode();
  try {
    await createOtpChallenge(config, {
      challengeId,
      discordId: active.user.discord_id,
      ...(state.app_id ? { appId: state.app_id } : {}),
      returnTo: state.return_to,
      otp: otpCode,
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });
  } catch (error) {
    if (error instanceof RateLimitedError) {
      return callbackResponse(otpRateLimitedPage(config, state.return_to));
    }
    throw error;
  }
  const otpResult = await sendDiscordOtp(
    active.user.discord_id,
    otpCode,
    config,
  );
  if (!otpResult.ok) {
    console.warn(`Discord OTP delivery failed: ${otpResult.reason}`);
    return callbackResponse(otpDeliveryFailedPage(config, state.return_to));
  }
  const response = callbackResponse(
    otpPage(config, challengeId, state.return_to, state.app_id),
  );
  response.headers.append(
    "set-cookie",
    createCookie(
      otpStateCookieName,
      await createOtpState(challengeId, config),
      600,
    ),
  );
  return response;
}

function callbackResponse(response: Response): Response {
  return appendSetCookie(response, deleteCookie(authStateCookieName));
}

function discordDisplayName(user: DiscordOAuthUser): string {
  const value = user.globalName ?? user.username ?? user.id;
  const trimmed = [...value.trim()]
    .filter((character) => !isControlCharacter(character))
    .join("");
  return trimmed.slice(0, 20) || "user";
}

function isControlCharacter(value: string): boolean {
  const codePoint = value.charCodeAt(0);
  return codePoint <= 31 || codePoint === 127;
}

function appendSetCookie(response: Response, value: string): Response {
  const headers = new Headers(response.headers);
  headers.append("set-cookie", value);
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export async function otp(
  request: Request,
  config: AccountConfig,
): Promise<Response> {
  const form = await request.formData();
  const challengeId = String(form.get("challenge_id") ?? "");
  const otpCode = String(form.get("otp") ?? "");
  const rememberMe = form.get("remember_me") === "1";
  const formReturnTo = accountReturnTo(
    String(form.get("return_to") ?? ""),
    config,
  );
  if (
    !/^[0-9]{6}$/.test(otpCode) ||
    !(await verifyOtpState({
      challengeId,
      config,
      value: getSingleCookie(request.headers.get("cookie"), otpStateCookieName),
    }))
  ) {
    return clearOtpState(authFailedPage(config, formReturnTo));
  }
  try {
    const result = await consumeOtpChallenge(config, {
      challengeId,
      otp: otpCode,
    });
    if (!result) {
      return clearOtpState(authFailedPage(config, formReturnTo));
    }
    const returnTo = accountReturnTo(result.returnTo, config);
    const active = await verifyActiveUser(result.discordId, config);
    if (!active) {
      return clearOtpState(inactiveAccountPage(config, returnTo));
    }
    const response = await createAccountSessionResponse(
      active.user,
      postOtpReturnTo({
        appId: result.appId ?? "",
        config,
        rememberMe,
        returnTo,
      }),
    );
    response.headers.append("set-cookie", deleteCookie(otpStateCookieName));
    return response;
  } catch (error) {
    if (error instanceof DataConflictError) {
      return clearOtpState(authFailedPage(config, formReturnTo));
    }
    throw error;
  }
}

function clearOtpState(response: Response): Response {
  return appendSetCookie(response, deleteCookie(otpStateCookieName));
}

function postOtpReturnTo(input: {
  appId: string;
  config: AccountConfig;
  rememberMe: boolean;
  returnTo: string;
}): {
  config: AccountConfig;
  rememberMe: boolean;
  returnTo: string;
} {
  const app = input.appId ? findApp(input.config, input.appId) : null;
  if (!app) {
    return input;
  }
  if (!matchesCallbackUrl(input.returnTo, app.callbackUrl)) {
    return input;
  }
  const authorizeUrl = new URL(
    "/authorize",
    input.config.navigation.ACCOUNT_URL,
  );
  authorizeUrl.searchParams.set("app_id", app.appId);
  authorizeUrl.searchParams.set("return_to", input.returnTo);
  return {
    ...input,
    returnTo: authorizeUrl.toString(),
  };
}

export async function sessionVerify(
  request: Request,
  url: URL,
  config: AccountConfig,
): Promise<Response> {
  const appId = url.searchParams.get("app_id");
  if (appId) {
    const app = findApp(config, appId);
    if (!app?.sessionVerifySecret) {
      return Response.json({ error: "unknown_app" }, { status: 403 });
    }
    const bearerToken = getBearerToken(request.headers.get("authorization"));
    const cookieToken = getSingleCookie(
      request.headers.get("cookie"),
      appSessionCookieName(app.appId),
    );
    if (cookieToken && bearerToken && cookieToken !== bearerToken) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (bearerToken && !cookieToken) {
      const verified = await verifyPersonalAccessToken(config, {
        token: bearerToken,
        scope: "session:verify",
      });
      if (
        !verified ||
        !(await verifyCurrentAppGuildAccess(config, {
          appId: app.appId,
          discordId: verified.user.discord_id,
        }))
      ) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      return Response.json({ user: appAuthUser(config, verified.user) });
    }
    const payload = cookieToken
      ? await verifySessionCookie(
          cookieToken,
          { [config.session.kid]: app.sessionVerifySecret },
          Math.floor(Date.now() / 1000),
        )
      : null;
    if (!payload || payload.app_id !== app.appId) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const active = await verifyActiveUser(payload.discord_id, config);
    if (!active) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    if (
      !(await verifyCurrentAppGuildAccess(config, {
        appId: app.appId,
        discordId: active.user.discord_id,
      }))
    ) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    return Response.json({
      user: appAuthUser(config, active.user),
    });
  }
  const session = await requireSession(request, config);
  return session
    ? appendSessionCookies(Response.json({ ok: true }), session)
    : appendRememberCookieDeletion(
        request,
        Response.json({ error: "unauthorized" }, { status: 401 }),
      );
}

function appAuthUser(
  config: AccountConfig,
  user: User,
): Pick<
  User,
  "discord_id" | "display_name" | "role" | "status" | "icon_source" | "icon_key"
> {
  return {
    discord_id: user.discord_id,
    display_name: user.display_name,
    icon_source: user.icon_source,
    icon_key: user.icon_key,
    role: isAccountAdmin(config, user) ? "admin" : user.role,
    status: "active",
  };
}

export async function me(
  request: Request,
  config: AccountConfig,
): Promise<Response> {
  const session = await requireSession(request, config);
  if (session) {
    const active = await verifyActiveUser(session.discord_id, config);
    if (active) {
      return appendSessionCookies(
        Response.json({ user: active.user }),
        session,
      );
    }
  }
  return appendRememberCookieDeletion(
    request,
    Response.json({ error: "unauthorized" }, { status: 401 }),
  );
}
