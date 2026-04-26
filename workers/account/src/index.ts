import {
  deleteCookie,
  getSingleCookie,
  rememberCookieName,
  sessionCookieName,
} from "../../../shared/src/session.js";
import {
  authHomeUrl,
  redirectToCurrentOriginRoot,
  redirectToLogin,
} from "../../shared/navigation.js";
import { callUserApi, type User } from "../../shared/userApi.js";
import { type AccountConfig, withAccountConfig } from "./accountConfig.js";
import { verifyFormCsrf, verifyHeaderCsrf } from "./csrf.js";
import { accountPage } from "./page.js";
import { requireSession } from "./session.js";
import { isWebp512 } from "./webp.js";

export default withAccountConfig(handleAccountRequest);

async function handleAccountRequest(
  request: Request,
  config: AccountConfig,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/assets/")) {
    return asset(url, config);
  }

  const session = await requireSession(request, config);
  if (!session) {
    return redirectToLogin(
      config.navigation,
      new URL("/", url.origin).toString(),
    );
  }
  if (url.pathname === "/" && request.method === "GET") {
    const active = await callUserApi<{ user: User }>(
      config.userApi,
      "/users/verify-active",
      { discord_id: session.discord_id },
    );
    return accountPage(active.user, url, config);
  }
  if (url.pathname === "/profile" && request.method === "POST") {
    if (
      !(await verifyFormCsrf(
        request,
        url,
        config,
        session.discord_id,
        "profile",
      ))
    ) {
      return new Response("forbidden", { status: 403 });
    }
    const form = await request.formData();
    await callUserApi(config.userApi, "/users/update-profile", {
      discord_id: session.discord_id,
      display_name: String(form.get("display_name") ?? ""),
      request_id: crypto.randomUUID(),
    });
    return redirectToCurrentOriginRoot(url);
  }
  if (url.pathname === "/avatar" && request.method === "POST") {
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
    const body = new Uint8Array(await request.arrayBuffer());
    if (body.byteLength > 10 * 1024 * 1024 || !isWebp512(body)) {
      return new Response("invalid image", { status: 400 });
    }
    const iconKey = `icons/${session.discord_id}/avatar.webp`;
    await config.assets.put(iconKey, body, {
      httpMetadata: { contentType: "image/webp" },
    });
    await callUserApi(config.userApi, "/users/update-avatar", {
      discord_id: session.discord_id,
      icon_source: "r2",
      icon_key: iconKey,
      request_id: crypto.randomUUID(),
    });
    return Response.json({ ok: true });
  }
  if (url.pathname === "/delete" && request.method === "POST") {
    if (
      !(await verifyFormCsrf(
        request,
        url,
        config,
        session.discord_id,
        "delete",
      ))
    ) {
      return new Response("forbidden", { status: 403 });
    }
    await callUserApi(config.userApi, "/users/delete", {
      discord_id: session.discord_id,
      request_id: crypto.randomUUID(),
    });
    return clearCookiesAndRedirectToAuthHome(config);
  }
  if (url.pathname === "/logout" && request.method === "POST") {
    if (
      !(await verifyFormCsrf(
        request,
        url,
        config,
        session.discord_id,
        "logout",
      ))
    ) {
      return new Response("forbidden", { status: 403 });
    }
    const remember = getSingleCookie(
      request.headers.get("cookie"),
      rememberCookieName,
    );
    const tokenId = remember?.split(".")[0];
    if (tokenId) {
      await callUserApi(config.userApi, "/remember/delete", {
        discord_id: session.discord_id,
        token_id: tokenId,
        request_id: crypto.randomUUID(),
      });
    }
    return clearCookiesAndRedirectToAuthHome(config);
  }
  return new Response("not found", { status: 404 });
}

async function asset(url: URL, config: AccountConfig): Promise<Response> {
  const key = url.pathname.replace(/^\/assets\//, "");
  const object = await config.assets.get(key);
  if (!object) {
    return new Response("not found", { status: 404 });
  }
  return new Response(object.body, {
    headers: {
      "content-type":
        object.httpMetadata?.contentType ?? "application/octet-stream",
    },
  });
}

function clearCookiesAndRedirectToAuthHome(config: AccountConfig): Response {
  const headers = new Headers({ location: authHomeUrl(config.navigation) });
  headers.append(
    "set-cookie",
    deleteCookie(sessionCookieName, config.domainName),
  );
  headers.append(
    "set-cookie",
    deleteCookie(rememberCookieName, config.domainName),
  );
  return new Response(null, { status: 302, headers });
}
