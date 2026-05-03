import {
  IconArrowLeft,
  IconCheck,
  IconId,
  IconLogout,
  IconPencil,
  IconShieldCheck,
  IconTrash,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import { Button, Card, Field, TextInput } from "../../../shared/ui.js";
import type { User } from "../../../shared/userApi.js";
import type { AccountTokens } from "../security/accountTokens.js";

export function AccountView({
  user,
  tokens,
  returnTo,
  showBackLink,
}: {
  user: User;
  tokens: AccountTokens;
  returnTo: string;
  showBackLink: boolean;
}) {
  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-primary">Account</p>
          <h1 className="text-3xl font-semibold leading-tight text-ink">
            アカウント設定
          </h1>
        </div>
        {showBackLink ? (
          <a
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-semibold text-ink transition-colors hover:bg-haze focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            href={returnTo}
            data-history-back
          >
            <IconArrowLeft aria-hidden size={18} />
            戻る
          </a>
        ) : null}
      </header>
      <Card className="grid gap-6">
        <div className="grid gap-1">
          <h2 className="text-base font-semibold text-ink">プロフィール</h2>
          <p className="text-sm leading-6 text-muted">
            Discord認証情報と表示名を管理します。
          </p>
        </div>
        <dl>
          <Field
            label="Discord ID"
            value={
              <span className="inline-flex items-center gap-2">
                <IconId aria-hidden size={18} />
                {user.discord_id}
              </span>
            }
          />
          <Field
            label="表示名"
            value={
              <form
                className="grid gap-3"
                method="post"
                action="/profile"
                data-profile-form
              >
                <input type="hidden" name="csrf_token" value={tokens.profile} />
                <input type="hidden" name="return_to" value={returnTo} />
                <div
                  className="flex flex-wrap items-center justify-between gap-3"
                  data-profile-view
                >
                  <span className="inline-flex items-center gap-2">
                    <IconUser aria-hidden size={18} />
                    {user.display_name}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label="表示名を編集"
                    data-profile-edit
                  >
                    <IconPencil aria-hidden size={18} />
                  </Button>
                </div>
                <div className="grid hidden gap-3" data-profile-editor>
                  <TextInput
                    id="display-name"
                    name="display_name"
                    defaultValue={user.display_name}
                    maxLength={20}
                    placeholder="表示名"
                    required
                    aria-label="表示名"
                    data-profile-input
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="submit" disabled data-profile-submit>
                      <IconCheck aria-hidden size={18} />
                      保存
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      data-profile-cancel
                    >
                      <IconX aria-hidden size={18} />
                      取消
                    </Button>
                    <p className="text-sm text-muted">20文字以内</p>
                  </div>
                </div>
              </form>
            }
          />
          <Field
            label="権限"
            value={
              <span className="inline-flex items-center gap-2">
                <IconShieldCheck aria-hidden size={18} />
                {user.role}
              </span>
            }
          />
          <Field label="状態" value={user.status} />
        </dl>
        <div data-account-client-root />
        <script src="/account-client.js" defer />
      </Card>
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="grid gap-1">
          <h2 className="text-base font-semibold text-ink">セッション</h2>
          <p className="text-sm text-muted">
            ログアウトまたはアカウント削除を行います。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form method="post" action="/logout">
            <input type="hidden" name="csrf_token" value={tokens.logout} />
            <input type="hidden" name="return_to" value={returnTo} />
            <Button type="submit" variant="secondary">
              <IconLogout aria-hidden size={18} />
              ログアウト
            </Button>
          </form>
          <form method="post" action="/delete" data-delete-form>
            <input type="hidden" name="csrf_token" value={tokens.delete} />
            <input type="hidden" name="return_to" value={returnTo} />
            <Button type="submit" variant="danger">
              <IconTrash aria-hidden size={18} />
              削除
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}
