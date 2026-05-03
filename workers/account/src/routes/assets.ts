import type { AccountConfig } from "../accountConfig.js";

export async function asset(
  url: URL,
  config: AccountConfig,
): Promise<Response> {
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
