import { accountClientScript } from "./accountClientGenerated.js";
import { type AccountConfig, withAccountConfig } from "./accountConfig.js";
import { cleanupExpiredAuthData } from "./data/cleanup.js";
import {
  accountHome,
  deleteAccount,
  logout,
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
import { discordInteraction } from "./routes/discordInteractionRoutes.js";

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
    return asset(url, config);
  }
  if (url.pathname === "/discord/interactions" && request.method === "POST") {
    return discordInteraction(request, config);
  }
  if (url.pathname === "/authorize") {
    return authorize(request, url, config);
  }
  if (url.pathname === "/token" && request.method === "POST") {
    return token(request, config);
  }
  if (url.pathname === "/otp" && request.method === "POST") {
    return otp(request, config);
  }
  if (url.pathname === "/session/verify") {
    return sessionVerify(request, url, config);
  }
  if (url.pathname === "/callback") {
    return callback(request, url, config);
  }
  if (url.pathname === "/me") {
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
  if (url.pathname === "/delete" && request.method === "POST") {
    return deleteAccount(request, url, config);
  }
  if (url.pathname === "/logout" && request.method === "POST") {
    return logout(request, url, config);
  }
  return new Response("not found", { status: 404 });
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
