export type AuthNavigationConfig = {
  ACCOUNT_URL: string;
  ALLOWED_RETURN_TO_ORIGINS: string;
  AUTH_CALLBACK_URL: string;
};

export type AuthBaseNavigationConfig = {
  AUTH_BASE_URL: string;
};

export function redirectToAuthHome(
  config: AuthBaseNavigationConfig,
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

export function authHomeUrl(config: AuthBaseNavigationConfig): string {
  return new URL("/", config.AUTH_BASE_URL).toString();
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
