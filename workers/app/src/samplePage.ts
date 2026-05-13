import type { SampleUser } from "./sampleUser.js";

type PanelTone = "primary" | "danger";

const styleSheet = `
:root{color-scheme:light;--bg:#f7f8fb;--panel:#fff;--ink:#1f2937;--muted:#6b7280;--line:#d8dee8;--primary:#2563eb;--primary-fg:#fff;--danger:#dc2626;--danger-fg:#fff}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{display:flex;min-height:100dvh;width:100%;max-width:64rem;margin:0 auto;padding:2rem 1rem;flex-direction:column}
.auth-shell{display:grid;flex:1;place-items:center;padding:2rem 0}
.auth-card{width:100%;max-width:32rem;overflow:hidden;border:1px solid var(--line);border-radius:.5rem;background:var(--panel)}
.auth-accent{height:.25rem;background:var(--primary)}
.auth-accent-danger{background:var(--danger)}
.auth-body{display:grid;gap:1.5rem;padding:2rem}
.auth-header{display:grid;justify-items:center;gap:1rem;text-align:center}
.auth-label{font-size:.875rem;font-weight:700;color:var(--primary)}
.auth-label-danger{color:var(--danger)}
.auth-title{margin:0;font-size:1.875rem;line-height:1.15;font-weight:700}
.auth-description{margin:0;color:var(--muted);line-height:1.75}
.button{display:inline-flex;min-height:2.75rem;align-items:center;justify-content:center;border:1px solid var(--primary);border-radius:.375rem;background:var(--primary);color:var(--primary-fg);padding:0 1rem;font-size:.875rem;font-weight:700;text-decoration:none}
.button-secondary{border-color:var(--line);background:var(--panel);color:var(--ink)}
.full{width:100%}
.shell{display:grid;width:100%;max-width:48rem;margin:0 auto;gap:1rem}
.header{display:flex;align-items:center;justify-content:space-between;gap:1rem;border-bottom:1px solid var(--line);padding-bottom:1rem}
.brand{font-size:.875rem;font-weight:700;color:var(--primary)}
.profile{overflow:hidden;border:1px solid var(--line);border-radius:.5rem;background:var(--panel);box-shadow:0 1px 2px rgb(15 23 42 / .06)}
.cover{height:9rem;background:#e8eef8}
.profile-body{display:grid;gap:1.25rem;padding:0 1.25rem 1.25rem}
.profile-content{display:grid;gap:.75rem;margin-top:-3.5rem}
.avatar{width:7rem;height:7rem;border:.25rem solid var(--panel);border-radius:999px;background:var(--primary);color:var(--primary-fg);box-shadow:0 1px 2px rgb(15 23 42 / .08);object-fit:cover}
.avatar-initial{display:grid;place-items:center;font-size:1.875rem;font-weight:700}
.name{margin:0;font-size:1.875rem;line-height:1.15}
.id{margin:0;color:var(--muted);font-size:.875rem}
@media (min-width:640px){main{padding:2rem 1.5rem}.auth-shell{padding:3rem 0}}
`;

export function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${styleSheet}</style></head><body><main>${body}</main></body></html>`,
    {
      headers: {
        "content-security-policy": [
          "default-src 'none'",
          "base-uri 'none'",
          "connect-src 'self'",
          "form-action 'self' https: http://localhost:*",
          "frame-ancestors 'none'",
          "img-src 'self' data: blob: https: http://localhost:*",
          "style-src 'unsafe-inline'",
        ].join("; "),
        "content-type": "text/html; charset=utf-8",
        "referrer-policy": "same-origin",
        "x-content-type-options": "nosniff",
      },
      status,
    },
  );
}

export function loginPageBody(input: { returnTo: string }): string {
  return authShell(
    authPanel({
      label: "Sample App",
      title: "appにログイン",
      description: "LinkAuthで本人確認し、このapp用のセッションを発行します。",
      children: `<form action="/login" method="post"><input type="hidden" name="return_to"${attr("value", input.returnTo)}>${button(
        {
          children: "認証して続行",
          className: "full",
          type: "submit",
        },
      )}</form>`,
    }),
  );
}

export function appHomePage(input: {
  accountUrl: string;
  assetBaseUrl: string;
  user: SampleUser;
}): string {
  return `<div class="shell">${appHeader(input.accountUrl)}<section class="profile"><div class="cover"></div><div class="profile-body"><div class="profile-content">${profileAvatar(
    input.user,
    input.assetBaseUrl,
  )}<div><h1 class="name">${escapeHtml(input.user.display_name)}</h1><p class="id">@${escapeHtml(
    input.user.discord_id,
  )}</p></div></div></div></section></div>`;
}

export function authFailedPageBody(input: { loginUrl: string }): string {
  return authShell(
    authPanel({
      label: "認証できません",
      title: "app認証に失敗しました",
      description:
        "認証リクエストが無効、期限切れ、またはすでに使用済みです。もう一度ログインしてください。",
      tone: "danger",
      children: linkButton({
        href: input.loginUrl,
        className: "full",
        variant: "secondary",
        children: "ログイン画面へ戻る",
      }),
    }),
  );
}

function attr(name: string, value: string | number | boolean): string {
  if (value === false) {
    return "";
  }
  if (value === true) {
    return ` ${name}`;
  }
  return ` ${name}="${escapeHtml(String(value))}"`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function authShell(children: string): string {
  return `<div class="auth-shell">${children}</div>`;
}

function authPanel({
  children,
  description,
  label,
  title,
  tone = "primary",
}: {
  children: string;
  description: string;
  label: string;
  title: string;
  tone?: PanelTone;
}): string {
  const danger = tone === "danger";
  return `<section class="auth-card"><div class="${danger ? "auth-accent auth-accent-danger" : "auth-accent"}"></div><div class="auth-body"><div class="auth-header"><p class="${danger ? "auth-label auth-label-danger" : "auth-label"}">${escapeHtml(
    label,
  )}</p><div><h1 class="auth-title">${escapeHtml(title)}</h1><p class="auth-description">${escapeHtml(
    description,
  )}</p></div></div>${children}</div></section>`;
}

function button({
  children,
  className = "",
  type = "button",
}: {
  children: string;
  className?: string;
  type?: "button" | "submit";
}): string {
  return `<button class="${["button", className].filter(Boolean).join(" ")}" type="${type}">${children}</button>`;
}

function linkButton({
  children,
  href,
  className = "",
  variant,
}: {
  children: string;
  href: string;
  className?: string;
  variant?: "secondary";
}): string {
  return `<a class="${["button", variant === "secondary" ? "button-secondary" : "", className].filter(Boolean).join(" ")}" href="${escapeHtml(href)}">${children}</a>`;
}

function appHeader(accountUrl: string): string {
  return `<header class="header"><div class="brand">Sample App</div>${linkButton(
    {
      href: accountUrl,
      className: "",
      variant: "secondary",
      children: "設定",
    },
  )}</header>`;
}

function profileAvatar(user: SampleUser, assetBaseUrl: string): string {
  const avatarUrl = avatarAssetUrl(
    user.icon_source,
    user.icon_key,
    assetBaseUrl,
  );
  if (avatarUrl) {
    return `<img class="avatar"${attr("src", avatarUrl)}${attr("alt", `${user.display_name}のアイコン`)}>`;
  }
  return `<div class="avatar avatar-initial" aria-hidden="true">${escapeHtml(profileInitial(user.display_name))}</div>`;
}

function avatarAssetUrl(
  iconSource: SampleUser["icon_source"],
  iconKey: string | undefined,
  assetBaseUrl: string,
): string | null {
  if (iconSource !== "r2" || !iconKey) {
    return null;
  }
  return new URL(
    `/assets/${iconKey.split("/").map(encodeURIComponent).join("/")}`,
    assetBaseUrl,
  ).toString();
}

function profileInitial(displayName: string): string {
  return displayName.trim().slice(0, 1).toUpperCase() || "?";
}
