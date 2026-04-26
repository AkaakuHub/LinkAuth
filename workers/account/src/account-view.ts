import { escapeHtml } from "../../shared/html.js";
import type { User } from "../../shared/user-api.js";
import type { AccountTokens } from "./account-tokens.js";

export function renderAccountView(user: User, tokens: AccountTokens): string {
  return `<h1>Account</h1>
<section class="panel">
  ${renderUserDetails(user)}
  ${renderProfileForm(user, tokens.profile)}
  ${renderDangerActions(tokens)}
</section>`;
}

function renderUserDetails(user: User): string {
  return `<div class="grid">
    <div class="label">Discord ID</div><div>${escapeHtml(user.discord_id)}</div>
    <div class="label">表示名</div><div>${escapeHtml(user.display_name)}</div>
    <div class="label">権限</div><div>${escapeHtml(user.role)}</div>
    <div class="label">状態</div><div>${escapeHtml(user.status)}</div>
  </div>`;
}

function renderProfileForm(user: User, csrfToken: string): string {
  return `<form method="post" action="/profile" class="actions">
    <input type="hidden" name="csrf_token" value="${escapeHtml(csrfToken)}">
    <input name="display_name" value="${escapeHtml(user.display_name)}" maxlength="20" required>
    <button type="submit">更新</button>
  </form>`;
}

function renderDangerActions(tokens: AccountTokens): string {
  return `<div class="actions">
    <form method="post" action="/logout">
      <input type="hidden" name="csrf_token" value="${escapeHtml(tokens.logout)}">
      <button type="submit">ログアウト</button>
    </form>
    <form method="post" action="/delete">
      <input type="hidden" name="csrf_token" value="${escapeHtml(tokens.delete)}">
      <button class="danger" type="submit">削除</button>
    </form>
  </div>`;
}
