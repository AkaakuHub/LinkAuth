import type { PersonalAccessTokenRecord } from "../data/personalAccessTokens.js";
import type { AccountTokens } from "../security/accountTokens.js";
import { attr, escapeHtml } from "./lib/html.js";
import { icon } from "./lib/icons.js";
import { button, card, formField, radioOption, textInput } from "./lib/ui.js";

export function personalAccessTokenCard({
  issuedToken,
  personalAccessTokens,
  tokens,
  escapedReturnTo,
}: {
  issuedToken: string | undefined;
  personalAccessTokens: PersonalAccessTokenRecord[];
  tokens: AccountTokens;
  escapedReturnTo: string;
}): string {
  return card({
    children: `<div class="grid gap-5"><div class="grid gap-1"><h2 class="text-base font-semibold text-ink">Bearer token</h2><p class="text-sm text-muted">curlやAPIから使用するtokenを管理します。発行後のtoken本体はこの画面で一度だけ表示します。</p></div>${issuedTokenDialog(
      issuedToken,
    )}${personalAccessTokenForm({
      tokens,
      escapedReturnTo,
    })}${personalAccessTokenList({
      personalAccessTokens,
      csrfToken: tokens.token,
      escapedReturnTo,
    })}</div>`,
  });
}

function personalAccessTokenForm({
  tokens,
  escapedReturnTo,
}: {
  tokens: AccountTokens;
  escapedReturnTo: string;
}): string {
  return `<form class="grid gap-4 border-t border-line pt-5" method="post" action="/tokens"><input type="hidden" name="csrf_token"${attr("value", tokens.token)}><input type="hidden" name="return_to" value="${escapedReturnTo}">${formField(
    {
      control: textInput({
        attributes:
          ' id="token-name" name="name" maxlength="40" placeholder="例: local curl" required',
      }),
      label: "名前",
      labelFor: "token-name",
    },
  )}${expirationRadioGroup()}${button({
    type: "submit",
    className: "w-full",
    children: `${icon("check")}発行`,
  })}</form>`;
}

function expirationRadioGroup(): string {
  return `<fieldset class="grid gap-2"><legend class="text-sm font-semibold text-ink">期限</legend><div class="grid gap-2 sm:grid-cols-2">${radioOption(
    {
      checked: true,
      label: "90日",
      name: "expiration",
      value: "90d",
    },
  )}${radioOption({
    label: "無期限",
    name: "expiration",
    value: "none",
  })}</div></fieldset>`;
}

function issuedTokenDialog(issuedToken?: string): string {
  if (!issuedToken) {
    return "";
  }
  return `<dialog class="w-[min(92vw,40rem)] rounded-lg border border-line bg-panel p-0 shadow-sm backdrop:bg-ink/40" data-issued-token-dialog><div class="grid gap-4 p-5"><div class="grid gap-1"><h2 class="text-base font-semibold text-ink">発行済みtoken</h2><p class="text-sm text-muted">このtoken本体は一度だけ表示されます。</p></div><code class="max-h-48 overflow-auto break-all rounded-md border border-line bg-haze p-3 text-sm text-ink" data-issued-token-value>${escapeHtml(issuedToken)}</code><p class="min-h-5 text-sm text-muted" data-issued-token-status></p><div class="flex flex-wrap justify-end gap-2">${button(
    {
      type: "button",
      variant: "secondary",
      attributes: " data-issued-token-close",
      children: `${icon("x")}閉じる`,
    },
  )}${button({
    type: "button",
    attributes: " data-issued-token-copy",
    children: `${icon("copy")}コピー`,
  })}</div></div></dialog>`;
}

function personalAccessTokenList({
  personalAccessTokens,
  csrfToken,
  escapedReturnTo,
}: {
  personalAccessTokens: PersonalAccessTokenRecord[];
  csrfToken: string;
  escapedReturnTo: string;
}): string {
  const rows = personalAccessTokens.map((token) =>
    personalAccessTokenRow({
      token,
      csrfToken,
      escapedReturnTo,
    }),
  );
  return `<div class="grid gap-2">${rows.length > 0 ? rows.join("") : '<p class="text-sm text-muted">発行済みtokenはありません。</p>'}</div>`;
}

function personalAccessTokenRow({
  token,
  csrfToken,
  escapedReturnTo,
}: {
  token: PersonalAccessTokenRecord;
  csrfToken: string;
  escapedReturnTo: string;
}): string {
  const revoked = token.revokedAt !== null;
  return `<div class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3"><div class="grid gap-1"><p class="text-sm font-semibold text-ink">${escapeHtml(token.name)}</p><p class="text-xs text-muted">expires ${escapeHtml(formatExpiresAt(token.expiresAt))}${token.lastUsedAt ? ` / last used ${escapeHtml(token.lastUsedAt)}` : ""}${revoked ? " / revoked" : ""}</p></div>${
    revoked
      ? ""
      : `<form method="post" action="/tokens/revoke"><input type="hidden" name="csrf_token"${attr("value", csrfToken)}><input type="hidden" name="return_to" value="${escapedReturnTo}"><input type="hidden" name="token_id"${attr("value", token.tokenId)}>${button(
          {
            type: "submit",
            variant: "secondary",
            children: `${icon("trash")}失効`,
          },
        )}</form>`
  }</div>`;
}

function formatExpiresAt(value: number | null): string {
  return value === null
    ? "never"
    : new Date(value * 1000).toISOString().slice(0, 10);
}
