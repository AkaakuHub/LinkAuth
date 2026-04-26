import {
  IconId,
  IconLogout,
  IconShieldCheck,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import { Button, Card, Field, TextInput } from "../../shared/ui.js";
import type { User } from "../../shared/userApi.js";
import type { AccountTokens } from "./accountTokens.js";

export function AccountView({
  user,
  tokens,
}: {
  user: User;
  tokens: AccountTokens;
}) {
  return (
    <div className="grid gap-6">
      <header className="flex flex-col gap-2 border-b border-line pb-6">
        <p className="text-sm font-semibold text-primary">Account</p>
        <h1 className="text-3xl font-semibold leading-tight text-ink">
          アカウント設定
        </h1>
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
              <span className="inline-flex items-center gap-2">
                <IconUser aria-hidden size={18} />
                {user.display_name}
              </span>
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
        <form
          className="grid gap-3"
          method="post"
          action="/profile"
          data-profile-form
        >
          <input type="hidden" name="csrf_token" value={tokens.profile} />
          <label
            className="grid gap-2 text-sm font-semibold text-ink"
            htmlFor="display-name"
          >
            表示名
          </label>
          <TextInput
            id="display-name"
            name="display_name"
            defaultValue={user.display_name}
            maxLength={20}
            placeholder="表示名"
            required
            data-profile-input
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled data-profile-submit>
              更新
            </Button>
            <p className="text-sm text-muted">20文字以内</p>
          </div>
        </form>
        <script src="/profile-form.js" defer />
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
            <Button type="submit" variant="secondary">
              <IconLogout aria-hidden size={18} />
              ログアウト
            </Button>
          </form>
          <form method="post" action="/delete">
            <input type="hidden" name="csrf_token" value={tokens.delete} />
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
