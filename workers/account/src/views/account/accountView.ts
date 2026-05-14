import type { PersonalAccessTokenRecord } from "../../data/personalAccessTokens.js";
import type { User } from "../../domain/user.js";
import type { AccountTokens } from "../../security/accountTokens.js";
import { attr, escapeHtml } from "../lib/html.js";
import { icon } from "../lib/icons.js";
import { avatarAssetUrl, profileAvatar } from "../lib/profileUi.js";
import { button, card, textInput } from "../lib/ui.js";
import { personalAccessTokenCard } from "./personalAccessTokenView.js";

export function accountView({
  issuedToken,
  personalAccessTokens,
  user,
  tokens,
  returnTo,
  showBackLink,
}: {
  issuedToken: string | undefined;
  personalAccessTokens: PersonalAccessTokenRecord[];
  user: User;
  tokens: AccountTokens;
  returnTo: string;
  showBackLink: boolean;
}): string {
  const escapedReturnTo = escapeHtml(returnTo);
  return `<div class="mx-auto grid w-full max-w-4xl gap-6 text-ink"><header class="grid gap-5 border-b border-line pb-6 sm:flex sm:items-end sm:justify-between"><div class="grid gap-3"><p class="text-sm font-semibold text-primary">LinkAuth Account</p><div class="grid gap-2"><h1 class="text-3xl font-semibold leading-tight tracking-normal text-ink sm:text-4xl">アカウント設定</h1><p class="max-w-2xl text-base leading-7 text-muted">プロフィール、Bearer token、セッションを管理します。</p></div></div>${backLink(
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
  )}${personalAccessTokenCard({
    issuedToken,
    personalAccessTokens,
    tokens,
    escapedReturnTo,
  })}${accountActions({
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
    className: "overflow-hidden rounded-lg p-0",
    children: `<div class="h-12 border-b border-line bg-primary sm:h-16"></div><div class="relative grid justify-items-center px-5 pb-5">${avatarEditor(
      user,
    )}<div class="grid min-w-0 justify-items-center gap-1 text-center"><div class="flex min-w-0 flex-wrap items-center justify-center gap-2" data-profile-display><div class="break-words text-2xl font-semibold leading-tight text-ink sm:text-3xl my-3">${escapeHtml(user.display_name)}</div>${button(
      {
        type: "button",
        variant: "secondary",
        className: "min-h-9 px-3",
        attributes: " data-profile-edit-trigger",
        children: `${icon("pencil")}編集`,
      },
    )}</div>${profileForm({ user, tokens, escapedReturnTo })}<div class="text-sm text-muted my-1">@${escapeHtml(user.discord_id)}</div></div></div>${avatarCropperDialog()}<script src="/account-client.js" defer></script>`,
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
    className:
      "grid gap-5 rounded-lg sm:flex sm:items-center sm:justify-between",
    children: `<div class="grid gap-2"><h2 class="text-xl font-semibold text-ink">アカウント操作</h2><p class="text-sm leading-6 text-muted">ログアウトまたはアカウント削除を行います。</p></div><div class="flex flex-wrap gap-2"><form method="post" action="/logout"><input type="hidden" name="csrf_token"${attr("value", tokens.logout)}><input type="hidden" name="return_to" value="${escapedReturnTo}">${button(
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
  return `<form class="my-3 grid hidden justify-items-center gap-3" method="post" action="/profile" data-profile-form><input type="hidden" name="csrf_token"${attr("value", tokens.profile)}><input type="hidden" name="return_to" value="${escapedReturnTo}"><div class="grid justify-items-center gap-3" data-profile-editor><label class="sr-only" for="display-name">表示名</label>${textInput(
    {
      className:
        "h-12 w-[min(80vw,24rem)] text-center text-2xl font-semibold sm:text-3xl",
      attributes: ` id="display-name" name="display_name"${attr("value", user.display_name)} maxlength="20" placeholder="表示名" required aria-label="表示名" data-profile-input`,
    },
  )}<div class="flex flex-wrap items-center justify-center gap-2">${button({
    type: "submit",
    className: "min-h-9 px-3",
    attributes: " data-profile-submit",
    disabled: true,
    children: "保存",
  })}${button({
    type: "button",
    variant: "secondary",
    className: "min-h-9 px-3",
    attributes: " data-profile-cancel",
    children: "取消",
  })}</div><p class="text-sm text-muted">20文字以内</p></div></form>`;
}

function avatarEditor(user: User): string {
  const avatar = profileAvatar({
    avatarUrl: avatarAssetUrl(user.icon_source, user.icon_key),
    displayName: user.display_name,
    sizeClassName: "h-24 w-24",
  });
  return `<div class="-mt-12 grid justify-items-center gap-2 sm:-mt-12">${avatar}<label class="inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-semibold text-ink transition-colors hover:bg-panel/80 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary">${icon("pencil")}アイコン変更<input class="hidden" type="file" accept="image/*" data-avatar-input></label><p class="hidden text-sm text-muted" data-avatar-status></p></div>`;
}

function avatarCropperDialog(): string {
  return `<dialog class="w-[min(92vw,36rem)] rounded-lg border border-line bg-panel p-0 shadow-sm backdrop:bg-ink/50" data-avatar-cropper-dialog><div class="grid gap-4 p-5"><div class="grid gap-1"><h2 class="text-xl font-semibold text-ink">アイコンを調整</h2><p class="text-sm text-muted">正方形に切り抜いて保存します。</p></div><div class="max-h-[60vh] overflow-hidden rounded-md border border-line bg-haze"><img class="block max-h-[60vh] w-full" alt="" data-avatar-cropper-image></div><div class="flex flex-wrap justify-end gap-2">${button(
    {
      type: "button",
      variant: "secondary",
      attributes: " data-avatar-cropper-cancel",
      children: "取消",
    },
  )}${button({
    type: "button",
    attributes: " data-avatar-cropper-save",
    children: "保存",
  })}</div></div></dialog>`;
}
