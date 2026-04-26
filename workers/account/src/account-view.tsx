import {
  IconId,
  IconLogout,
  IconShieldCheck,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import { Button, Card, Field, TextInput } from "../../shared/ui.js";
import type { User } from "../../shared/user-api.js";
import type { AccountTokens } from "./account-tokens.js";

export function AccountView({
  user,
  tokens,
}: {
  user: User;
  tokens: AccountTokens;
}) {
  return (
    <div className="grid gap-5">
      <header className="flex flex-col gap-3 border-b border-line pb-6">
        <p className="text-sm font-semibold text-primary">Account</p>
        <h1 className="font-serif text-4xl leading-tight tracking-normal text-ink">
          Discord認証アカウント
        </h1>
      </header>
      <Card>
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
        <form className="mt-6 grid gap-3" method="post" action="/profile">
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
            required
          />
          <div>
            <Button type="submit">更新</Button>
          </div>
        </form>
      </Card>
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">セッション操作</p>
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
