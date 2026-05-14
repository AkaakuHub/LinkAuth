import type { AccountConfig } from "../accountConfig.js";

export async function asset(
  url: URL,
  config: AccountConfig,
): Promise<Response> {
  const key = url.pathname.replace(/^\/assets\//, "");
  if (!isPublicAssetKey(key)) {
    return new Response("not found", { status: 404 });
  }
  const object = await config.assets.get(key);
  if (!object) {
    return new Response("not found", { status: 404 });
  }
  return new Response(object.body, {
    headers: {
      "content-type": "image/webp",
      "x-content-type-options": "nosniff",
    },
  });
}

function isPublicAssetKey(key: string): boolean {
  return /^icons\/[0-9]+\/avatar\.webp$/.test(key);
}
