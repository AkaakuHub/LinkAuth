import type { AccountConfig } from "../accountConfig.js";
import { isPublicAvatarIconKey } from "../domain/avatar.js";

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
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": "image/webp",
      "x-content-type-options": "nosniff",
    },
  });
}

function isPublicAssetKey(key: string): boolean {
  return isPublicAvatarIconKey(key);
}
