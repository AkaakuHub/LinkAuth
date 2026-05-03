import {
  IconAlertTriangle,
  IconApps,
  IconHome,
  IconLogin2,
  IconSettings,
} from "@tabler/icons-react";
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
    if (url.pathname === "/" && request.method === "GET") {
      return Response.redirect(new URL("/login", request.url), 302);
    }
    if (url.pathname === "/login" && request.method === "GET") {
      return loginPage(request);
    }
    if (url.pathname === "/login" && request.method === "POST") {
      return startLogin(request, config);
    }
    return new Response("not found", { status: 404 });
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
    <div className="grid flex-1 place-items-center">
      <Card className="grid w-full max-w-lg gap-5">
        <div className="grid gap-3">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
            <IconApps aria-hidden size={18} />
            App
          </p>
          <div className="grid gap-1">
            <h1 className="text-3xl font-semibold leading-tight text-ink">
              appセッションが有効です
            </h1>
            <p className="text-sm text-muted">
              {payload.display_name}としてこのappを利用できます。
            </p>
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

function loginPage(request: Request): Promise<Response> {
  return page(
    "App Login",
    <div className="grid flex-1 place-items-center">
      <Card className="grid w-full max-w-lg gap-5">
        <div className="grid gap-3">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
            <IconApps aria-hidden size={18} />
            App
          </p>
          <div className="grid gap-1">
            <h1 className="text-3xl font-semibold leading-tight text-ink">
              appにログイン
            </h1>
            <p className="text-sm leading-7 text-muted">
              認証基盤で本人確認して、このapp用のセッションを発行します。
            </p>
          </div>
        </div>
        <form action="/login" method="post">
          <input
            type="hidden"
            name="return_to"
            value={appReturnToUrl(request)}
          />
          <button
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-primary bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            type="submit"
          >
            <IconLogin2 aria-hidden size={18} />
            認証して続行
          </button>
        </form>
      </Card>
    </div>,
  );
}

async function startLogin(
  request: Request,
  config: AppConfig,
): Promise<Response> {
  const form = await request.formData();
  const returnTo = safeAppReturnTo(
    String(form.get("return_to") ?? ""),
    new URL("/", request.url),
  );
  const callbackUrl = new URL("/_auth/callback", request.url);
  callbackUrl.searchParams.set("return_to", returnTo);
  const authorizeUrl = new URL("/authorize", config.navigation.AUTH_BASE_URL);
  authorizeUrl.searchParams.set("app_id", config.appId);
  authorizeUrl.searchParams.set("return_to", callbackUrl.toString());
  return Response.redirect(authorizeUrl, 302);
}

async function authCallback(url: URL, config: AppConfig): Promise<Response> {
  const code = url.searchParams.get("code");
  if (!code) {
    return appAuthFailedPage(url);
  }
  const tokenUrl = new URL("/token", config.navigation.AUTH_BASE_URL);
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ app_id: config.appId, code }),
  });
  if (!response.ok) {
    return appAuthFailedPage(url);
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
    return appAuthFailedPage(url);
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

function appAuthFailedPage(url: URL): Promise<Response> {
  return page(
    "App認証に失敗しました",
    <div className="grid flex-1 place-items-center">
      <Card className="grid w-full max-w-lg gap-5">
        <div className="grid gap-2">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-danger">
            <IconAlertTriangle aria-hidden size={18} />
            認証できません
          </p>
          <h1 className="text-3xl font-semibold leading-tight text-ink">
            app認証に失敗しました
          </h1>
          <p className="text-sm leading-7 text-muted">
            認証リクエストが無効、期限切れ、またはすでに使用済みです。もう一度ログインしてください。
          </p>
        </div>
        <LinkButton
          href={new URL("/login", url.origin).toString()}
          variant="secondary"
        >
          <IconHome aria-hidden size={18} />
          ログイン画面へ戻る
        </LinkButton>
      </Card>
    </div>,
    401,
  );
}

function appReturnTo(url: URL): string {
  const value = url.searchParams.get("return_to");
  if (!value) {
    return new URL("/", url.origin).toString();
  }
  return safeAppReturnTo(value, new URL("/", url.origin));
}

function appReturnToUrl(request: Request): string {
  return new URL("/", request.url).toString();
}

function safeAppReturnTo(value: string, defaultUrl: URL): string {
  try {
    const returnTo = new URL(value);
    if (
      returnTo.origin !== defaultUrl.origin ||
      returnTo.username ||
      returnTo.password
    ) {
      return defaultUrl.toString();
    }
    returnTo.hash = "";
    return returnTo.toString();
  } catch {
    return defaultUrl.toString();
  }
}
