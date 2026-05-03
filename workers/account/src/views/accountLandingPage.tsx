import { IconBrandDiscord } from "@tabler/icons-react";
import { page } from "../../../shared/html.js";
import { Card, LinkButton } from "../../../shared/ui.js";

export function accountLandingPage(
  discordAuthorizeUrl: string,
): Promise<Response> {
  return page(
    "Account",
    <div className="grid flex-1 place-items-center">
      <Card className="grid w-full max-w-lg gap-5">
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-primary">Account</p>
          <h1 className="text-3xl font-semibold leading-tight text-ink">
            アカウント管理
          </h1>
          <p className="text-sm leading-7 text-muted">
            Discordでログインしてアカウント情報を管理します。
          </p>
        </div>
        <LinkButton href={discordAuthorizeUrl}>
          <IconBrandDiscord aria-hidden size={20} />
          Discordでログイン
        </LinkButton>
      </Card>
    </div>,
    200,
    noStoreHeaders(),
  );
}

export function noStoreHeaders(): Headers {
  return new Headers({
    "cache-control": "no-store, no-cache, max-age=0, must-revalidate",
    expires: "0",
    pragma: "no-cache",
  });
}
