import { IconAlertTriangle, IconHome } from "@tabler/icons-react";
import { page } from "../../shared/html.js";
import { Card, LinkButton } from "../../shared/ui.js";

export function inactiveUserPage(): Promise<Response> {
  return page(
    "認証できません",
    <div className="grid flex-1 place-items-center">
      <Card className="w-full max-w-lg">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-danger">
          <IconAlertTriangle aria-hidden size={18} />
          認証できません
        </p>
        <h1 className="mt-3 font-serif text-4xl leading-tight text-ink">
          登録が有効ではありません
        </h1>
        <p className="mt-4 text-sm leading-7 text-muted">
          このDiscordアカウントは未登録、無効化済み、または削除済みです。サーバーで登録し直してからログインしてください。
        </p>
        <LinkButton className="mt-6" href="/" variant="secondary">
          <IconHome aria-hidden size={20} />
          Authホームへ戻る
        </LinkButton>
      </Card>
    </div>,
  );
}
