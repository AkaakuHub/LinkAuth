import { randomBase64Url } from "../../../../shared/src/crypto.js";
import {
  appSessionCookieName,
  getSingleCookie,
  sessionCookieName,
  verifySessionCookie,
} from "../../../../shared/src/session.js";
import { normalizeReturnTo } from "../../../shared/navigation.js";
import { callUserApi, UserApiError } from "../../../shared/userApi.js";
import type { AccountConfig } from "../accountConfig.js";
import { findApp, matchesCallbackUrl } from "../domain/appRegistry.js";
import { createOtpCode } from "../domain/otpCode.js";
import { accountReturnTo } from "../domain/returnTo.js";
import {
  fetchDiscordGuildMember,
  fetchDiscordOAuthResult,
  redirectToDiscordAuthorize,
} from "../integrations/discordOauth.js";
import { createAuthState, parseAuthState } from "../security/authState.js";
import { requireSession } from "../security/session.js";
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
} from "../views/accountErrorPage.js";
import { otpPage } from "../views/otpPage.js";

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
    const state = await createAuthState(returnTo, config);
    if (!state) {
      return authFailedPage(config);
    }
    return redirectToDiscordAuthorize(state, config);
  }
  const active = await verifyCurrentMemberUser(session.discord_id, config);
  if (!active) {
    return inactiveAccountPage(config);
  }
  const code = randomBase64Url(32);
  await callUserApi(config.userApi, "/auth-code/create", {
    app_id: appId,
    code,
    user: {
      discord_id: active.user.discord_id,
      display_name: active.user.display_name,
      role: active.user.role,
    },
    expires_at: Math.floor(Date.now() / 1000) + 300,
  });
  const callbackUrl = new URL(returnTo);
  callbackUrl.searchParams.set("code", code);
  return Response.redirect(callbackUrl, 302);
}

export async function token(
  request: Request,
  config: AccountConfig,
): Promise<Response> {
  const body = (await request.json()) as Record<string, unknown>;
  const appId = body.app_id;
  const code = body.code;
  if (typeof appId !== "string" || typeof code !== "string") {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    return Response.json(
      await callUserApi(config.userApi, "/auth-code/consume", {
        app_id: appId,
        code,
      }),
    );
  } catch (error) {
    if (error instanceof UserApiError && error.status === 401) {
      return Response.json({ error: "invalid_auth_code" }, { status: 401 });
    }
    throw error;
  }
}

export async function callback(
  url: URL,
  config: AccountConfig,
): Promise<Response> {
  const code = url.searchParams.get("code");
  const state = await parseAuthState(url.searchParams.get("state"), config);
  if (!code || !state) {
    return authFailedPage(config);
  }

  const discordResult = await fetchDiscordOAuthResult(code, config);
  if (!discordResult) {
    return authFailedPage(config);
  }
  const guildMember = await fetchDiscordGuildMember(
    discordResult.accessToken,
    config,
  );
  if (!guildMember) {
    return inactiveAccountPage(config);
  }
  const active = await verifyCurrentMemberUser(discordResult.user.id, config);
  if (!active) {
    return inactiveAccountPage(config);
  }

  const challengeId = randomBase64Url(24);
  const otpCode = createOtpCode();
  await callUserApi(config.userApi, "/otp-challenge/create", {
    challenge_id: challengeId,
    discord_id: active.user.discord_id,
    otp: otpCode,
    expires_at: Math.floor(Date.now() / 1000) + 300,
  });
  const otpResult = await sendDiscordOtp(
    active.user.discord_id,
    otpCode,
    config,
  );
  if (!otpResult.ok) {
    return otpDeliveryFailedPage(config);
  }
  return otpPage(challengeId, state.return_to);
}

export async function otp(
  request: Request,
  config: AccountConfig,
): Promise<Response> {
  const form = await request.formData();
  const challengeId = String(form.get("challenge_id") ?? "");
  const otpCode = String(form.get("otp") ?? "");
  const returnTo = accountReturnTo(String(form.get("return_to") ?? ""), config);
  try {
    const result = await callUserApi<{ discord_id: string }>(
      config.userApi,
      "/otp-challenge/consume",
      {
        challenge_id: challengeId,
        otp: otpCode,
      },
    );
    const active = await verifyActiveUser(result.discord_id, config);
    if (!active) {
      return inactiveAccountPage(config);
    }
    return await createAccountSessionResponse(active.user, returnTo, config);
  } catch (error) {
    if (error instanceof UserApiError && error.status === 401) {
      return authFailedPage(config);
    }
    throw error;
  }
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
    const session = getSingleCookie(
      request.headers.get("cookie"),
      appSessionCookieName(app.appId),
    );
    const payload = session
      ? await verifySessionCookie(
          session,
          { [config.session.kid]: app.sessionVerifySecret },
          Math.floor(Date.now() / 1000),
        )
      : null;
    if (!payload || payload.app_id !== app.appId) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    return Response.json({
      user: {
        discord_id: payload.discord_id,
        display_name: payload.display_name,
        role: payload.role,
      },
    });
  }
  const session = await requireSession(request, config);
  return session
    ? Response.json({ ok: true })
    : Response.json({ error: "unauthorized" }, { status: 401 });
}

export async function me(
  request: Request,
  config: AccountConfig,
): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const session = getSingleCookie(
    request.headers.get("cookie"),
    sessionCookieName,
  );
  if (session) {
    const payload = await verifySessionCookie(
      session,
      { [config.session.kid]: config.session.secret },
      now,
    );
    if (payload) {
      const active = await verifyActiveUser(payload.discord_id, config);
      if (active) {
        return Response.json({ user: active.user });
      }
    }
  }
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
