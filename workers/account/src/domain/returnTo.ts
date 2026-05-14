import type { AccountConfig } from "../accountConfig.js";
import { normalizeReturnTo } from "../domain/navigation.js";

export function accountReturnTo(
  value: string | null,
  config: AccountConfig,
): string {
  return (
    normalizeReturnTo(value, config.navigation) ?? config.navigation.ACCOUNT_URL
  );
}

export function redirectToAccountRoot(
  requestUrl: URL,
  returnTo: string,
): Response {
  const url = new URL("/", requestUrl.origin);
  url.searchParams.set("return_to", returnTo);
  return Response.redirect(url, 303);
}
