import { IconApps, IconSettings } from "@tabler/icons-react";
import {
  appSessionCookieName,
  createCookie,
  getSingleCookie,
  signSessionCookie,
  verifySessionCookie,
} from "../../../shared/src/session.js";
import { page } from "../../shared/html.js";
import { Card, LinkButton } from "../../shared/ui.js";
import { type AppConfig, withAppConfig } from "./appConfig.js";

export default withAppConfig(handleAppRequest);

async function handleAppRequest(
  request: Request,
  config: AppConfig,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/_auth/callback" && request.method === "GET") {
    return authCallback(url, config);
  }

  const sessionCookie = appSessionCookieName(config.appId);
  const session = getSingleCookie(request.headers.get("cookie"), sessionCookie);
  const payload = session
    ? await verifySessionCookie(
        session,
        { [config.session.kid]: config.session.secret },
        Math.floor(Date.now() / 1000),
      )
    : null;
  if (!payload || payload.app_id !== config.appId) {
    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const callbackUrl = new URL("/_auth/callback", request.url);
    callbackUrl.searchParams.set("return_to", request.url);
    const authorizeUrl = new URL("/authorize", config.navigation.AUTH_BASE_URL);
    authorizeUrl.searchParams.set("app_id", config.appId);
    authorizeUrl.searchParams.set("return_to", callbackUrl.toString());
    return Response.redirect(authorizeUrl, 302);
  }
  if (url.pathname === "/api/me" && request.method === "GET") {
    return Response.json({
      user: {
        discord_id: payload.discord_id,
        display_name: payload.display_name,
        role: payload.role,
      },
    });
  }
  if (url.pathname.startsWith("/api/")) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  const accountUrl = new URL(config.accountUrl);
  accountUrl.searchParams.set(
    "return_to",
    new URL("/", request.url).toString(),
  );
  return page(
    "App",
    <div className="grid flex-1 place-items-center">
      <Card className="grid w-full max-w-lg gap-5">
        <div className="grid gap-3">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
            <IconApps aria-hidden size={18} />
            App
          </p>
          <div className="grid gap-1">
            <h1 className="text-3xl font-semibold leading-tight text-ink">
              ログイン済みです
            </h1>
            <p className="text-sm text-muted">{payload.display_name}</p>
          </div>
        </div>
        <LinkButton href={accountUrl.toString()} variant="secondary">
          <IconSettings aria-hidden size={18} />
          アカウント管理
        </LinkButton>
      </Card>
    </div>,
  );
}

async function authCallback(url: URL, config: AppConfig): Promise<Response> {
  const code = url.searchParams.get("code");
  if (!code) {
    return new Response("invalid callback", { status: 400 });
  }
  const tokenUrl = new URL("/token", config.navigation.AUTH_BASE_URL);
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ app_id: config.appId, code }),
  });
  if (!response.ok) {
    return new Response("token exchange failed", { status: 401 });
  }
  const body = (await response.json()) as {
    user?: {
      discord_id?: unknown;
      display_name?: unknown;
      role?: unknown;
    };
  };
  const user = body.user;
  if (
    !user ||
    typeof user.discord_id !== "string" ||
    typeof user.display_name !== "string" ||
    (user.role !== "user" && user.role !== "admin")
  ) {
    return new Response("invalid token response", { status: 502 });
  }
  const now = Math.floor(Date.now() / 1000);
  const session = await signSessionCookie(
    {
      discord_id: user.discord_id,
      app_id: config.appId,
      role: user.role,
      display_name: user.display_name,
      iat: now,
      exp: now + 3_600,
      kid: config.session.kid,
    },
    config.session.secret,
  );
  const headers = new Headers({ location: appReturnTo(url) });
  headers.append(
    "set-cookie",
    createCookie(
      appSessionCookieName(config.appId),
      session,
      3_600,
      config.domainName,
    ),
  );
  return new Response(null, { status: 302, headers });
}

function appReturnTo(url: URL): string {
  const value = url.searchParams.get("return_to");
  if (!value) {
    return new URL("/", url.origin).toString();
  }
  try {
    const returnTo = new URL(value);
    if (
      returnTo.origin !== url.origin ||
      returnTo.username ||
      returnTo.password
    ) {
      return new URL("/", url.origin).toString();
    }
    returnTo.hash = "";
    return returnTo.toString();
  } catch {
    return new URL("/", url.origin).toString();
  }
}
