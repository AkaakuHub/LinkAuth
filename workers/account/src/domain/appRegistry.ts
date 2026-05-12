import type { AccountConfig, AppDefinition } from "../accountConfig.js";

export function findApp(
  config: AccountConfig,
  appId: string,
): AppDefinition | null {
  return config.apps.find((app) => app.appId === appId) ?? null;
}

export function matchesCallbackUrl(
  value: string,
  callbackUrl: string,
): boolean {
  try {
    const valueUrl = new URL(value);
    const appCallbackUrl = new URL(callbackUrl);
    return (
      !valueUrl.username &&
      !valueUrl.password &&
      valueUrl.origin === appCallbackUrl.origin &&
      valueUrl.pathname === appCallbackUrl.pathname
    );
  } catch {
    return false;
  }
}

export function appLogoutUrlForReturnTo(
  config: AccountConfig,
  returnTo: string,
): string {
  const returnToUrl = new URL(returnTo);
  const app = config.apps.find((definition) => {
    const callbackUrl = new URL(definition.callbackUrl);
    return returnToUrl.origin === callbackUrl.origin;
  });
  return app
    ? new URL("/_auth/logout", returnToUrl.origin).toString()
    : returnTo;
}
