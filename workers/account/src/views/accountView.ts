import { attr, escapeHtml } from "../../../shared/html.js";
import { icon } from "../../../shared/icons.js";
import { button, card, field, textInput } from "../../../shared/ui.js";
import type { User } from "../../../shared/userApi.js";
import type { AccountTokens } from "../security/accountTokens.js";

export function accountView({
  user,
  tokens,
  returnTo,
  showBackLink,
}: {
  user: User;
  tokens: AccountTokens;
  returnTo: string;
  showBackLink: boolean;
}): string {
  const escapedReturnTo = escapeHtml(returnTo);
  return `<div class="grid gap-6"><header class="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6"><div class="grid gap-2"><p class="text-sm font-semibold text-primary">Account</p><h1 class="text-3xl font-semibold leading-tight text-ink">アカウント設定</h1></div>${backLink(
    {
      returnTo,
      showBackLink,
    },
  )}</header>${card({
    className: "grid gap-6",
    children: `<div class="grid gap-1"><h2 class="text-base font-semibold text-ink">プロフィール</h2><p class="text-sm leading-6 text-muted">Discord認証情報と表示名を管理します。</p></div><dl>${field(
      {
        label: "Discord ID",
        value: `<span class="inline-flex items-center gap-2">${icon("id")}${escapeHtml(user.discord_id)}</span>`,
      },
    )}${field({
      label: "表示名",
      value: profileForm({ user, tokens, escapedReturnTo }),
    })}${field({
      label: "権限",
      value: `<span class="inline-flex items-center gap-2">${icon("shield-check")}${escapeHtml(user.role)}</span>`,
    })}${field({
      label: "状態",
      value: escapeHtml(user.status),
    })}</dl><script src="/account-client.js" defer></script>`,
  })}${card({
    className: "flex flex-wrap items-center justify-between gap-4",
    children: `<div class="grid gap-1"><h2 class="text-base font-semibold text-ink">セッション</h2><p class="text-sm text-muted">ログアウトまたはアカウント削除を行います。</p></div><div class="flex flex-wrap gap-2"><form method="post" action="/logout"><input type="hidden" name="csrf_token"${attr("value", tokens.logout)}><input type="hidden" name="return_to" value="${escapedReturnTo}">${button(
      {
        type: "submit",
        variant: "secondary",
        children: `${icon("logout")}ログアウト`,
      },
    )}</form><form method="post" action="/delete" data-delete-form><input type="hidden" name="csrf_token"${attr("value", tokens.delete)}><input type="hidden" name="return_to" value="${escapedReturnTo}">${button(
      {
        type: "submit",
        variant: "danger",
        children: `${icon("trash")}削除`,
      },
    )}</form></div>`,
  })}</div>`;
}

function backLink({
  returnTo,
  showBackLink,
}: {
  returnTo: string;
  showBackLink: boolean;
}): string {
  if (!showBackLink) {
    return "";
  }
  return `<a class="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-semibold text-ink transition-colors hover:bg-haze focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"${attr("href", returnTo)} data-history-back>${icon("arrow-left")}戻る</a>`;
}

function profileForm({
  user,
  tokens,
  escapedReturnTo,
}: {
  user: User;
  tokens: AccountTokens;
  escapedReturnTo: string;
}): string {
  return `<form class="grid gap-3" method="post" action="/profile" data-profile-form><input type="hidden" name="csrf_token"${attr("value", tokens.profile)}><input type="hidden" name="return_to" value="${escapedReturnTo}"><div class="flex flex-wrap items-center justify-between gap-3" data-profile-view><span class="inline-flex items-center gap-2">${icon("user")}${escapeHtml(user.display_name)}</span>${button(
    {
      type: "button",
      variant: "secondary",
      attributes: ' aria-label="表示名を編集" data-profile-edit',
      children: icon("pencil"),
    },
  )}</div><div class="grid hidden gap-3" data-profile-editor>${textInput({
    attributes: ` id="display-name" name="display_name"${attr("value", user.display_name)} maxlength="20" placeholder="表示名" required aria-label="表示名" data-profile-input`,
  })}<div class="flex flex-wrap items-center gap-2">${button({
    type: "submit",
    attributes: " data-profile-submit",
    disabled: true,
    children: `${icon("check")}保存`,
  })}${button({
    type: "button",
    variant: "secondary",
    attributes: " data-profile-cancel",
    children: `${icon("x")}取消`,
  })}<p class="text-sm text-muted">20文字以内</p></div></div></form>`;
}
