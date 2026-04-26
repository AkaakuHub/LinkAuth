export type AuthNavigationConfig = {
  ACCOUNT_URL: string;
  ALLOWED_RETURN_TO_ORIGINS: string;
  AUTH_CALLBACK_URL: string;
};

export type LoginNavigationConfig = {
  AUTH_LOGIN_URL: string;
};

export function redirectToLogin(
  config: LoginNavigationConfig,
  returnTo: string,
  status = 302,
): Response {
  const url = new URL(config.AUTH_LOGIN_URL);
  url.searchParams.set("return_to", returnTo);
  return Response.redirect(url, status);
}

export function redirectToAuthHome(
  config: LoginNavigationConfig,
  status = 302,
): Response {
  return Response.redirect(authHomeUrl(config), status);
}

export function redirectToCurrentOriginRoot(
  requestUrl: URL,
  status = 303,
): Response {
  return Response.redirect(new URL("/", requestUrl.origin), status);
}

export function redirectToUrl(url: URL, status = 302): Response {
  return Response.redirect(url, status);
}

export function authHomeUrl(config: LoginNavigationConfig): string {
  return new URL("/", config.AUTH_LOGIN_URL).toString();
}

export function normalizeReturnTo(
  value: string | null,
  config: AuthNavigationConfig,
): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    const accountUrl = new URL(config.ACCOUNT_URL);
    const allowedReturnToOrigins = config.ALLOWED_RETURN_TO_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0)
      .map((origin) => new URL(origin));
    if (url.username || url.password) {
      return null;
    }
    url.hash = "";
    if (sameOrigin(url, accountUrl) && url.pathname === "/") {
      return config.ACCOUNT_URL;
    }
    if (
      allowedReturnToOrigins.some((allowedOrigin) =>
        sameOrigin(url, allowedOrigin),
      )
    ) {
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function callbackUrl(config: AuthNavigationConfig): string {
  return config.AUTH_CALLBACK_URL;
}

function sameOrigin(left: URL, right: URL): boolean {
  return (
    left.protocol === right.protocol &&
    left.hostname === right.hostname &&
    left.port === right.port
  );
}
