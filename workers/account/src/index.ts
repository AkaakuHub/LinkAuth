import { type AccountConfig, withAccountConfig } from "./accountConfig.js";
import { cleanupExpiredAuthData } from "./data/cleanup.js";
import { accountClientScript } from "./generated/accountClient.js";
import {
  accountHome,
  createToken,
  deleteAccount,
  logout,
  revokeToken,
  updateAvatar,
  updateProfile,
} from "./routes/accountRoutes.js";
import { asset } from "./routes/assets.js";
import {
  authorize,
  callback,
  me,
  otp,
  sessionVerify,
  token,
} from "./routes/authRoutes.js";

export default withAccountConfig(handleAccountRequest, handleScheduled);

async function handleAccountRequest(
  request: Request,
  config: AccountConfig,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === "/account-client.js" && request.method === "GET") {
    return new Response(accountClientScript, {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/javascript; charset=utf-8",
      },
    });
  }
  if (url.pathname.startsWith("/assets/")) {
    if (request.method !== "GET") {
      return methodNotAllowed("GET");
    }
    return asset(url, config);
  }
  if (url.pathname === "/authorize") {
    if (request.method !== "GET") {
      return methodNotAllowed("GET");
    }
    return authorize(request, url, config);
  }
  if (url.pathname === "/token" && request.method === "POST") {
    return token(request, config);
  }
  if (url.pathname === "/otp" && request.method === "POST") {
    return otp(request, config);
  }
  if (url.pathname === "/session/verify") {
    if (request.method !== "GET") {
      return methodNotAllowed("GET");
    }
    return sessionVerify(request, url, config);
  }
  if (url.pathname === "/callback") {
    if (request.method !== "GET") {
      return methodNotAllowed("GET");
    }
    return callback(request, url, config);
  }
  if (url.pathname === "/me") {
    if (request.method !== "GET") {
      return methodNotAllowed("GET");
    }
    return me(request, config);
  }
  if (url.pathname === "/" && request.method === "GET") {
    return accountHome(request, url, config);
  }
  if (url.pathname === "/profile" && request.method === "POST") {
    return updateProfile(request, url, config);
  }
  if (url.pathname === "/avatar" && request.method === "POST") {
    return updateAvatar(request, url, config);
  }
  if (url.pathname === "/tokens" && request.method === "POST") {
    return createToken(request, url, config);
  }
  if (url.pathname === "/tokens/revoke" && request.method === "POST") {
    return revokeToken(request, url, config);
  }
  if (url.pathname === "/delete" && request.method === "POST") {
    return deleteAccount(request, url, config);
  }
  if (url.pathname === "/logout" && request.method === "POST") {
    return logout(request, url, config);
  }
  return new Response("not found", { status: 404 });
}

function methodNotAllowed(allow: string): Response {
  return new Response("method not allowed", {
    headers: { allow },
    status: 405,
  });
}

async function handleScheduled(
  controller: ScheduledController,
  config: AccountConfig,
): Promise<void> {
  await cleanupExpiredAuthData(
    config,
    Math.floor(controller.scheduledTime / 1000),
  );
}
