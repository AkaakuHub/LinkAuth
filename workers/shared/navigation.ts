export type AuthNavigationConfig = {
  ACCOUNT_URL: string;
  APP_URL: string;
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
): string {
  if (!value) {
    return config.ACCOUNT_URL;
  }
  try {
    const url = new URL(value);
    const accountUrl = new URL(config.ACCOUNT_URL);
    const appUrl = new URL(config.APP_URL);
    if (url.username || url.password || url.hash) {
      return config.ACCOUNT_URL;
    }
    if (sameOrigin(url, accountUrl) && url.pathname === "/") {
      return config.ACCOUNT_URL;
    }
    if (sameOrigin(url, appUrl)) {
      url.hash = "";
      return url.toString();
    }
    return config.ACCOUNT_URL;
  } catch {
    return config.ACCOUNT_URL;
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
