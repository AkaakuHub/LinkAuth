import {
  type LinkAuthAppConfig,
  type LinkAuthAppEnv,
  loadLinkAuthAppConfig,
} from "link-auth";

export type AppConfig = LinkAuthAppConfig;

export function withAppConfig(
  handler: (request: Request, config: AppConfig) => Promise<Response>,
): ExportedHandler<LinkAuthAppEnv> {
  return {
    async fetch(request: Request, env: LinkAuthAppEnv): Promise<Response> {
      return await handler(request, loadLinkAuthAppConfig(env));
    },
  };
}
