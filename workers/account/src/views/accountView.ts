import { attr, escapeHtml } from "../../../shared/html.js";
import { icon } from "../../../shared/icons.js";
import { avatarAssetUrl, profileAvatar } from "../../../shared/profileUi.js";
import { button, card, textInput } from "../../../shared/ui.js";
import type { User } from "../../../shared/user.js";
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
  return `<div class="mx-auto grid w-full max-w-3xl gap-4"><header class="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4"><div class="inline-flex items-center gap-2 text-sm font-semibold text-primary">${icon("settings")}アカウント設定</div>${backLink(
    {
      returnTo,
      showBackLink,
    },
  )}</header><input type="hidden" name="avatar_csrf_token"${attr("value", tokens.avatar)} data-avatar-csrf>${accountProfileCard(
    {
      user,
      tokens,
      escapedReturnTo,
    },
  )}${accountActions({
    tokens,
    escapedReturnTo,
  })}</div>`;
}

function accountProfileCard({
  user,
  tokens,
  escapedReturnTo,
}: {
  user: User;
  tokens: AccountTokens;
  escapedReturnTo: string;
}): string {
  return card({
    className: "overflow-hidden p-0",
    children: `<div class="h-36 bg-haze"></div><div class="grid gap-5 px-5 pb-5"><div class="-mt-14 flex flex-wrap items-end justify-between gap-4"><div class="grid gap-3">${avatarEditor(
      user,
    )}<div class="grid gap-1"><h1 class="text-3xl font-semibold leading-tight text-ink">${escapeHtml(user.display_name)}</h1><p class="text-sm text-muted">@${escapeHtml(user.discord_id)}</p></div></div>${button(
      {
        type: "button",
        variant: "secondary",
        attributes: " data-profile-edit-trigger",
        children: `${icon("pencil")}編集`,
      },
    )}</div>${profileForm({ user, tokens, escapedReturnTo })}</div>${avatarCropperDialog()}<script src="/account-client.js" defer></script>`,
  });
}

function accountActions({
  tokens,
  escapedReturnTo,
}: {
  tokens: AccountTokens;
  escapedReturnTo: string;
}): string {
  return card({
    className: "flex flex-wrap items-center justify-between gap-4",
    children: `<div class="grid gap-1"><h2 class="text-base font-semibold text-ink">アカウント操作</h2><p class="text-sm text-muted">ログアウトまたはアカウント削除を行います。</p></div><div class="flex flex-wrap gap-2"><form method="post" action="/logout"><input type="hidden" name="csrf_token"${attr("value", tokens.logout)}><input type="hidden" name="return_to" value="${escapedReturnTo}">${button(
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
  });
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
  return `<form class="grid hidden gap-3 rounded-md border border-line bg-haze p-4" method="post" action="/profile" data-profile-form><input type="hidden" name="csrf_token"${attr("value", tokens.profile)}><input type="hidden" name="return_to" value="${escapedReturnTo}"><div class="grid gap-3" data-profile-editor>${textInput(
    {
      attributes: ` id="display-name" name="display_name"${attr("value", user.display_name)} maxlength="20" placeholder="表示名" required aria-label="表示名" data-profile-input`,
    },
  )}<div class="flex flex-wrap items-center gap-2">${button({
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

function avatarEditor(user: User): string {
  const avatar = profileAvatar({
    avatarUrl: avatarAssetUrl(user.icon_source, user.icon_key),
    displayName: user.display_name,
  });
  return `<div class="grid gap-2">${avatar}<label class="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-semibold text-ink transition-colors hover:bg-haze focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary">${icon("pencil")}アイコン変更<input class="hidden" type="file" accept="image/*" data-avatar-input></label><p class="text-sm text-muted" data-avatar-status></p></div>`;
}

function avatarCropperDialog(): string {
  return `<dialog class="w-[min(92vw,36rem)] rounded-lg border border-line bg-panel p-0 shadow-sm" data-avatar-cropper-dialog><div class="grid gap-4 p-5"><div class="grid gap-1"><h2 class="text-base font-semibold text-ink">アイコンを調整</h2><p class="text-sm text-muted">正方形に切り抜いて保存します。</p></div><div class="max-h-[60vh] overflow-hidden rounded-md border border-line bg-haze"><img class="block max-h-[60vh] w-full" alt="" data-avatar-cropper-image></div><div class="flex flex-wrap justify-end gap-2">${button(
    {
      type: "button",
      variant: "secondary",
      attributes: " data-avatar-cropper-cancel",
      children: `${icon("x")}取消`,
    },
  )}${button({
    type: "button",
    attributes: " data-avatar-cropper-save",
    children: `${icon("check")}保存`,
  })}</div></div></dialog>`;
}
